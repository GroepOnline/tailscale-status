import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Minimal HTTP/1.1 mock of the tailscaled LocalAPI for gjs unit tests.
 * Serves canned responses over a unix socket it creates itself
 * (`GLib.Dir_make_tmp`), answers every request with `Connection: close`.
 */
export class MockLocalApiServer {
    constructor() {
        this.routes = new Map();
        this.requests = [];
        this._dir = null;
        this._socketPath = null;
        this._service = null;
        this._pendingWrites = 0;
    }

    get socketPath() {
        return this._socketPath;
    }

    /** @param {string} key `${method} ${path-with-trailing-normalization}` */
    route(method, path, handler) {
        this.routes.set(`${method} ${path}`, handler);
    }

    start() {
        this._dir = GLib.dir_make_tmp('tailscale-status-test-XXXXXX');
        this._socketPath = `${this._dir}/tailscaled.sock`;
        this._service = new Gio.SocketService();
        this._service.add_address(
            Gio.UnixSocketAddress.new(this._socketPath),
            Gio.SocketType.STREAM,
            Gio.SocketProtocol.DEFAULT,
            null
        );
        this._service.connect('incoming', (service, connection) => {
            this._handleConnection(connection);
            return true;
        });
        return this._socketPath;
    }

    async stop() {
        if (this._service) {
            // Do not call service.close() explicitly: GIO warns "Listener is
            // already closed" on dispose when close() ran first. Dropping the
            // reference lets disposal close it cleanly.
            this._service = null;
        }
        // wait for in-flight connection writes to finish before removing the socket dir
        const deadline = Date.now() + 5000;
        while (this._pendingWrites > 0 && Date.now() < deadline) {
            await sleepMs(10);
        }
        await sleepMs(20); // let pending accepts/writes land before the socket file disappears
        if (this._dir) {
            GLib.unlink(this._socketPath);
            GLib.rmdir(this._dir);
            this._dir = null;
            this._socketPath = null;
        }
    }

    _handleConnection(connection) {
        const reader = connection.get_input_stream();
        const parts = [];
        let total = 0;
        const readMore = () => {
            reader.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                let chunk;
                try {
                    chunk = stream.read_bytes_finish(res);
                } catch {
                    return;
                }
                const size = chunk.get_size();
                if (size === 0) {
                    return;
                }
                const data = chunk.get_data();
                parts.push(data.subarray(0, size));
                total += size;
                const raw = concat(parts, total);
                if (requestComplete(raw)) {
                    this._respond(connection, raw);
                } else {
                    readMore();
                }
            });
        };
        readMore();
    }

    _respond(connection, raw) {
        const head = new TextDecoder('ascii').decode(raw.subarray(0, findHeaderEnd(raw)));
        const [requestLine] = head.split('\r\n');
        const [method, rawPath] = requestLine.split(' ');
        const path = rawPath.split('?')[0];
        this.requests.push({method, path});

        const handler = this.routes.get(`${method} ${path}`) ?? this.routes.get(`${method} ${normalizePrefix(path)}`);
        Promise.resolve(handler ? handler({method, path}) : null)
            .then((out) => {
                let status = 404;
                let bodyBytes = new TextEncoder().encode('404 page not found');
                if (out) {
                    status = out.status ?? 200;
                    bodyBytes = out.bytes ?? new TextEncoder().encode(JSON.stringify(out.json ?? null));
                }
                const headerBytes = new TextEncoder().encode(
                    `HTTP/1.1 ${status} ${statusText(status)}\r\n` +
                    `Content-Length: ${bodyBytes.length}\r\n` +
                    `Connection: close\r\n\r\n`
                );
                const outBytes = new Uint8Array(headerBytes.length + bodyBytes.length);
                outBytes.set(headerBytes, 0);
                outBytes.set(bodyBytes, headerBytes.length);

                this._pendingWrites++;
                connection.get_output_stream().write_bytes_async(GLib.Bytes.new(outBytes), GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                    try {
                        stream.write_bytes_finish(res);
                    } catch {
                        // client hung up early
                    }
                    this._pendingWrites--;
                    connection.close(null);
                });
            })
            .catch(() => connection.close(null));
    }
}

function findHeaderEnd(bytes) {
    for (let i = 0; i <= bytes.length - 4; i++) {
        if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
            return i;
        }
    }
    return -1;
}

/** A request is complete once the header and its declared Content-Length arrived. */
function requestComplete(bytes) {
    const headerEnd = findHeaderEnd(bytes);
    if (headerEnd === -1) {
        return false;
    }
    const head = new TextDecoder('ascii').decode(bytes.subarray(0, headerEnd));
    const lengthMatch = head.match(/Content-Length: (\d+)/i);
    if (!lengthMatch) {
        return true;
    }
    return bytes.length >= headerEnd + 4 + Number(lengthMatch[1]);
}

function concat(parts, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/** Treat `/localapi/v0/files/<name>` and `/localapi/v0/files` as the same prefix route family. */
function normalizePrefix(path) {
    const match = path.match(/^(\/localapi\/v0\/(?:profiles|files|file-put)\/)/);
    return match ? match[1] : path;
}

function statusText(code) {
    return {200: 'OK', 204: 'No Content', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error'}[code] || 'OK';
}

function sleepMs(ms) {
    return new Promise((resolve) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}
