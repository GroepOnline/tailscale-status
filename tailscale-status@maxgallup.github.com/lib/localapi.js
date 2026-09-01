import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEFAULT_SOCKET_PATH = '/run/tailscale/tailscaled.sock';
const DEFAULT_TIMEOUT_MS = 10000;
const HTTP_HOST = 'local-tailscaled.sock';

/**
 * Normalized failure of a LocalAPI call. `code` is one of:
 * 'timeout', 'connect', 'http' (server returned >= 400), 'protocol' (malformed
 * response). `status` carries the HTTP status code for 'http'.
 */
export class LocalApiError extends Error {
    constructor(code, message, status = null) {
        super(message);
        this.name = 'LocalApiError';
        this.code = code;
        this.status = status;
    }
}

function concatBytes(parts, totalLength) {
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function findHeaderEnd(bytes) {
    const pattern = [13, 10, 13, 10];
    outer: for (let i = 0; i <= bytes.length - pattern.length; i++) {
        for (let j = 0; j < pattern.length; j++) {
            if (bytes[i + j] !== pattern[j]) {
                continue outer;
            }
        }
        return i;
    }
    return -1;
}

function parseHeaders(headerBlock) {
    const lines = new TextDecoder().decode(headerBlock).split('\r\n');
    const statusLine = lines[0];
    const match = statusLine.match(/^HTTP\/\d(?:\.\d)? (\d{3}) ?(.*)$/);
    if (!match) {
        throw new LocalApiError('protocol', `malformed status line: ${statusLine}`);
    }
    const headers = {};
    for (let i = 1; i < lines.length; i++) {
        const idx = lines[i].indexOf(':');
        if (idx > 0) {
            headers[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i].slice(idx + 1).trim();
        }
    }
    return {status: Number(match[1]), statusText: match[2] || '', headers};
}

/** Decode a chunked transfer-encoding body from `bytes` (starting after headers). */
function dechunk(bytes) {
    const decoder = new TextDecoder('ascii');
    const parts = [];
    let offset = 0;
    let total = 0;
    for (;;) {
        let lineEnd = -1;
        for (let i = offset; i < bytes.length - 1; i++) {
            if (bytes[i] === 13 && bytes[i + 1] === 10) {
                lineEnd = i;
                break;
            }
        }
        if (lineEnd === -1) {
            throw new LocalApiError('protocol', 'truncated chunked body (missing chunk size line)');
        }
        const sizeLine = decoder.decode(bytes.subarray(offset, lineEnd)).split(';')[0].trim();
        const size = parseInt(sizeLine, 16);
        if (Number.isNaN(size)) {
            throw new LocalApiError('protocol', `invalid chunk size: ${sizeLine}`);
        }
        if (size === 0) {
            break;
        }
        const dataStart = lineEnd + 2;
        if (dataStart + size > bytes.length) {
            throw new LocalApiError('protocol', 'truncated chunked body (chunk extends past EOF)');
        }
        parts.push(bytes.subarray(dataStart, dataStart + size));
        total += size;
        offset = dataStart + size + 2;
    }
    return concatBytes(parts, total);
}

export class LocalApiClient {
    /**
     * @param {object} opts
     * @param {string} [opts.socketPath] - path of the tailscaled unix socket.
     * @param {number} [opts.timeoutMs] - per-request timeout.
     */
    constructor({socketPath = DEFAULT_SOCKET_PATH, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
        this.socketPath = socketPath;
        this.timeoutMs = timeoutMs;
    }

    // ---- read endpoints -----------------------------------------------------

    async status() {
        return (await this._request('GET', '/localapi/v0/status')).json();
    }

    async getPrefs() {
        return (await this._request('GET', '/localapi/v0/prefs')).json();
    }

    /** @returns {Promise<object[]>} ipn.LoginProfile array */
    async listProfiles() {
        // "profiles" is a prefix-match route: the trailing slash is required.
        return (await this._request('GET', '/localapi/v0/profiles/')).json();
    }

    async getCurrentProfile() {
        return (await this._request('GET', '/localapi/v0/profiles/current')).json();
    }

    /** @returns {Promise<object[]>} apitype.WaitingFile array (null response means empty) */
    async waitingFiles({waitSeconds = 0} = {}) {
        const res = await this._request('GET', `/localapi/v0/files/?waitsec=${waitSeconds}`);
        const body = res.text().trim();
        return body.length > 0 && body !== 'null' ? res.json() : [];
    }

    /** @returns {Promise<Uint8Array>} raw file contents */
    async downloadWaitingFile(name) {
        const res = await this._request('GET', `/localapi/v0/files/${encodeURIComponent(name)}`);
        return res.bytes();
    }

    /** @returns {Promise<object[]>} apitype.FileTarget array (Node.StableID per peer) */
    async fileTargets() {
        return (await this._request('GET', '/localapi/v0/file-targets')).json();
    }

    async suggestExitNode() {
        return (await this._request('POST', '/localapi/v0/suggest-exit-node')).json();
    }

    // ---- write endpoints ----------------------------------------------------

    /**
     * Merge-update prefs. Covers up/down (WantRunning), ShieldsUp, RouteAll
     * (accept-routes), ExitNodeIP, ExitNodeAllowLANAccess.
     */
    async patchPrefs(partial) {
        return (await this._request('PATCH', '/localapi/v0/prefs', {
            jsonBody: partial,
        })).json();
    }

    async start(opts = {}) {
        return (await this._request('POST', '/localapi/v0/start', {jsonBody: opts})).status;
    }

    async logout() {
        return (await this._request('POST', '/localapi/v0/logout')).status;
    }

    /** Interactive login: BackendState flips to NeedsLogin and status carries AuthURL. */
    async loginInteractive() {
        return (await this._request('POST', '/localapi/v0/login-interactive')).status;
    }

    async switchProfile(profileKey) {
        return (await this._request('POST', `/localapi/v0/profiles/${encodeURIComponent(profileKey)}`)).status;
    }

    async deleteWaitingFile(name) {
        return (await this._request('DELETE', `/localapi/v0/files/${encodeURIComponent(name)}`)).status;
    }

    /** @param {Uint8Array} contents raw file bytes */
    async putFile(stableId, name, contents) {
        return (await this._request('PUT', `/localapi/v0/file-put/${encodeURIComponent(stableId)}/${encodeURIComponent(name)}`, {
            body: contents,
            contentType: 'application/octet-stream',
        })).status;
    }

    // ---- transport ----------------------------------------------------------

    /**
     * One HTTP/1.1 request over the tailscaled unix socket. Uses
     * `Connection: close` so the body is simply read to EOF — the Go http
     * server may answer with Content-Length or chunked encoding, both are
     * handled.
     *
     * @returns {Promise<{status: number, headers: object, text: () => string, json: () => object, bytes: () => Uint8Array}>}
     */
    async _request(method, path, {jsonBody = null, body = null, contentType = 'application/json'} = {}) {
        if (jsonBody !== null && body !== null) {
            throw new Error('pass either jsonBody or body, not both');
        }
        let bodyBytes = new Uint8Array(0);
        let extraHeaders = '';
        if (jsonBody !== null) {
            bodyBytes = new TextEncoder().encode(JSON.stringify(jsonBody));
            extraHeaders = `Content-Type: application/json\r\n`;
        } else if (body !== null) {
            bodyBytes = body;
            extraHeaders = `Content-Type: ${contentType}\r\n`;
        }

        const header =
            `${method} ${path} HTTP/1.1\r\n` +
            `Host: ${HTTP_HOST}\r\n` +
            `Connection: close\r\n` +
            (bodyBytes.length > 0 ? `Content-Length: ${bodyBytes.length}\r\n` : '') +
            extraHeaders +
            `\r\n`;

        const client = new Gio.SocketClient({timeout: Math.ceil(this.timeoutMs / 1000)});
        const cancellable = new Gio.Cancellable();
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.timeoutMs, () => {
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        let connection;
        try {
            connection = await this._connect(client, cancellable);
            // header and body in one write: a server that answers after the
            // header alone (or resets early) must never see a torn request
            const request = new Uint8Array(new TextEncoder().encode(header).length + bodyBytes.length);
            request.set(new TextEncoder().encode(header), 0);
            request.set(bodyBytes, new TextEncoder().encode(header).length);
            await this._writeAll(connection.get_output_stream(), request, cancellable);
            const raw = await this._readAll(connection.get_input_stream(), cancellable);
            return this._parseResponse(raw);
        } catch (e) {
            if (e instanceof LocalApiError) {
                throw e;
            }
            if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                throw new LocalApiError('timeout', `request to ${path} timed out after ${this.timeoutMs}ms`);
            }
            throw new LocalApiError('connect', `${path}: ${e.message ?? String(e)}`);
        } finally {
            GLib.source_remove(timeoutId);
            cancellable.cancel();
            if (connection) {
                try {
                    connection.close(null);
                } catch {
                    // closing a connection that never opened is harmless
                }
            }
        }
    }

    _connect(client, cancellable) {
        return new Promise((resolve, reject) => {
            client.connect_async(Gio.UnixSocketAddress.new(this.socketPath), cancellable, (c, res) => {
                try {
                    resolve(c.connect_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    _writeAll(stream, bytes, cancellable) {
        return new Promise((resolve, reject) => {
            stream.write_bytes_async(GLib.Bytes.new(bytes), GLib.PRIORITY_DEFAULT, cancellable, (s, res) => {
                try {
                    const written = s.write_bytes_finish(res);
                    if (written !== bytes.length) {
                        reject(new LocalApiError('protocol', 'short write on request'));
                        return;
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _readAll(stream, cancellable) {
        const parts = [];
        let total = 0;
        for (;;) {
            const chunk = await new Promise((resolve, reject) => {
                stream.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, cancellable, (s, res) => {
                    try {
                        resolve(s.read_bytes_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            if (chunk.get_size() === 0) {
                break;
            }
            const data = chunk.get_data();
            parts.push(data.subarray(0, chunk.get_size()));
            total += chunk.get_size();
        }
        return concatBytes(parts, total);
    }

    _parseResponse(raw) {
        const headerEnd = findHeaderEnd(raw);
        if (headerEnd === -1) {
            throw new LocalApiError('protocol', 'response has no header terminator');
        }
        const {status, statusText, headers} = parseHeaders(raw.subarray(0, headerEnd));
        let bodyBytes = raw.subarray(headerEnd + 4);
        if ((headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
            bodyBytes = dechunk(bodyBytes);
        } else if (headers['content-length'] !== undefined) {
            const length = parseInt(headers['content-length'], 10);
            if (!Number.isNaN(length) && bodyBytes.length > length) {
                bodyBytes = bodyBytes.subarray(0, length);
            }
        }
        if (status >= 400) {
            const snippet = new TextDecoder().decode(bodyBytes).slice(0, 200);
            throw new LocalApiError('http', `${statusText || 'HTTP error'} (status ${status})${snippet ? `: ${snippet}` : ''}`, status);
        }
        return {
            status,
            headers,
            text: () => new TextDecoder().decode(bodyBytes),
            json: () => {
                try {
                    return JSON.parse(new TextDecoder().decode(bodyBytes));
                } catch (e) {
                    throw new LocalApiError('protocol', `invalid JSON response: ${e.message}`);
                }
            },
            bytes: () => new Uint8Array(bodyBytes),
        };
    }
}
