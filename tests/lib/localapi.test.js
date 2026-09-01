import {MockLocalApiServer} from '../mock/localapi-server.js';
import {LocalApiClient, LocalApiError} from '../../tailscale-status@maxgallup.github.com/lib/localapi.js';
import {register, assert, assertEqual, assertThrows, withTimeout} from '../harness.js';
import {
    statusFixture,
    prefsFixture,
    profilesFixture,
    currentProfileFixture,
    waitingFilesFixture,
    fileTargetsFixture,
} from '../fixtures.js';

async function withServer(setup, run) {
    const server = new MockLocalApiServer();
    setup(server);
    const socketPath = server.start();
    const client = new LocalApiClient({socketPath, timeoutMs: 3000});
    try {
        await run(client, server);
    } finally {
        await server.stop();
    }
}

register('localapi: status() parses canned JSON', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/status', () => ({json: statusFixture})),
        async (client) => {
            const status = await withTimeout(client.status());
            assertEqual(status.BackendState, 'Running');
            assertEqual(status.Self.HostName, 'laptop');
        }
    );
});

register('localapi: getPrefs() returns prefs object', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/prefs', () => ({json: prefsFixture})),
        async (client) => {
            const prefs = await withTimeout(client.getPrefs());
            assertEqual(prefs.ExitNodeIP, '100.64.0.5');
            assertEqual(prefs.ShieldsUp, false);
        }
    );
});

register('localapi: patchPrefs() sends PATCH with JSON merge body', async () => {
    await withServer(
        (s) => s.route('PATCH', '/localapi/v0/prefs', ({method}) => ({json: {...prefsFixture, WantRunning: false, __method: method}})),
        async (client) => {
            const prefs = await withTimeout(client.patchPrefs({WantRunning: false}));
            assertEqual(prefs.__method, 'PATCH');
            assertEqual(prefs.WantRunning, false);
        }
    );
});

register('localapi: listProfiles() uses trailing slash route', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/profiles/', () => ({json: profilesFixture})),
        async (client, server) => {
            const profiles = await withTimeout(client.listProfiles());
            assertEqual(profiles.length, 2);
            assertEqual(profiles[0].Key, 'profile-ce7e');
            assertEqual(server.requests[server.requests.length - 1].path, '/localapi/v0/profiles/');
        }
    );
});

register('localapi: switchProfile() POSTs escaped profile key', async () => {
    await withServer(
        (s) => s.route('POST', '/localapi/v0/profiles/', () => ({status: 204})),
        async (client, server) => {
            const status = await withTimeout(client.switchProfile('profile-aa11'));
            assertEqual(status, 204);
            assertEqual(server.requests[server.requests.length - 1].path, '/localapi/v0/profiles/profile-aa11');
        }
    );
});

register('localapi: waitingFiles() normalizes null to empty array', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/files/', () => ({json: null})),
        async (client) => {
            const files = await withTimeout(client.waitingFiles());
            assertEqual(files, []);
        }
    );
});

register('localapi: waitingFiles() returns WaitingFile array', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/files/', () => ({json: waitingFilesFixture})),
        async (client) => {
            const files = await withTimeout(client.waitingFiles());
            assertEqual(files.length, 2);
            assertEqual(files[1].Name, 'img with spaces.png');
        }
    );
});

register('localapi: downloadWaitingFile() returns byte-exact binary payload', async () => {
    const payload = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x00, 0x50, 0x49, 0x44]);
    await withServer(
        (s) => s.route('GET', '/localapi/v0/files/report.pdf', () => ({bytes: payload})),
        async (client) => {
            const bytes = await withTimeout(client.downloadWaitingFile('report.pdf'));
            assertEqual(Array.from(bytes), Array.from(payload));
        }
    );
});

register('localapi: putFile() PUTs binary body to escaped file-put path', async () => {
    await withServer(
        (s) => s.route('PUT', '/localapi/v0/file-put/', () => ({status: 200})),
        async (client, server) => {
            const status = await withTimeout(client.putFile('peer1-stable', 'my file.bin', new Uint8Array([1, 2, 3, 0, 4])));
            assertEqual(status, 200);
            assertEqual(server.requests[server.requests.length - 1].path, '/localapi/v0/file-put/peer1-stable/my%20file.bin');
        }
    );
});

register('localapi: fileTargets() returns targets with StableID', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/file-targets', () => ({json: fileTargetsFixture})),
        async (client) => {
            const targets = await withTimeout(client.fileTargets());
            assertEqual(targets[0].Node.StableID, 'peer1-stable');
        }
    );
});

register('localapi: missing socket yields LocalApiError connect', async () => {
    const client = new LocalApiClient({socketPath: '/nonexistent/path/tailscaled.sock', timeoutMs: 2000});
    try {
        await withTimeout(client.status(), 8000, 'missing socket call');
        assert(false, 'expected an error');
    } catch (e) {
        assert(e instanceof LocalApiError, `expected LocalApiError, got ${e?.name}`);
        assertEqual(e.code, 'connect');
    }
});

register('localapi: HTTP 500 surfaces as LocalApiError http with body snippet', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/status', () => ({status: 500, bytes: new TextEncoder().encode('boom')})),
        async (client) => {
            try {
                await withTimeout(client.status());
                assert(false, 'expected an error');
            } catch (e) {
                assert(e instanceof LocalApiError, `expected LocalApiError, got ${e?.name}`);
                assertEqual(e.code, 'http');
                assertEqual(e.status, 500);
                assert(e.message.includes('boom'), `message should carry body snippet: ${e.message}`);
            }
        }
    );
});

register('localapi: HTTP 403 (operator missing) carries status', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/profiles/', () => ({status: 403, bytes: new TextEncoder().encode('profiles access denied')})),
        async (client) => {
            try {
                await withTimeout(client.listProfiles());
                assert(false, 'expected an error');
            } catch (e) {
                assert(e instanceof LocalApiError);
                assertEqual(e.status, 403);
            }
        }
    );
});

register('localapi: timeout rejects with LocalApiError timeout', async () => {
    await withServer(
        (s) => s.route('GET', '/localapi/v0/status', () => new Promise(() => {
            // handler that never responds: the mock waits for a response that
            // never comes; our client should time out first
        })),
        async (client) => {
            try {
                await withTimeout(client.status(), 8000, 'timeout case');
                assert(false, 'expected a timeout error');
            } catch (e) {
                assert(e instanceof LocalApiError, `expected LocalApiError, got ${e?.name}`);
                assertEqual(e.code, 'timeout');
            }
        }
    );
});

register('localapi: chunked transfer-encoding body is dechunked', async () => {
    const client = new LocalApiClient();
    // '{"Version": ' is 12 bytes (0xc); '"1.102.3"}' is 10 bytes (0xa)
    const rawResponse =
        'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n' +
        'c\r\n{"Version": \r\n' +
        'a\r\n"1.102.3"}\r\n' +
        '0\r\n\r\n';
    const res = client._parseResponse(new TextEncoder().encode(rawResponse));
    assertEqual(res.json().Version, '1.102.3');
    assertThrows(() => {
        client._parseResponse(new TextEncoder().encode(
            'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\nabc\r\n'
        ));
    }, LocalApiError);
});

register('localapi: suggestExitNode() POSTs and parses suggestion', async () => {
    await withServer(
        (s) => s.route('POST', '/localapi/v0/suggest-exit-node', () => ({json: {ID: 'nPEER1', Name: 'nas'}})),
        async (client) => {
            const suggestion = await withTimeout(client.suggestExitNode());
            assertEqual(suggestion.Name, 'nas');
        }
    );
});

register('localapi: start/logout/loginInteractive hit their endpoints', async () => {
    await withServer(
        (s) => {
            s.route('POST', '/localapi/v0/start', () => ({status: 204}));
            s.route('POST', '/localapi/v0/logout', () => ({status: 204}));
            s.route('POST', '/localapi/v0/login-interactive', () => ({status: 204}));
            s.route('GET', '/localapi/v0/profiles/current', () => ({json: currentProfileFixture}));
        },
        async (client, server) => {
            assertEqual(await withTimeout(client.start({WantRunning: true})), 204);
            assertEqual(await withTimeout(client.logout()), 204);
            assertEqual(await withTimeout(client.loginInteractive()), 204);
            assertEqual((await withTimeout(client.getCurrentProfile())).Key, 'profile-ce7e');
            const paths = server.requests.map((r) => r.path);
            assert(paths.includes('/localapi/v0/start'), 'start hit');
            assert(paths.includes('/localapi/v0/logout'), 'logout hit');
            assert(paths.includes('/localapi/v0/login-interactive'), 'login-interactive hit');
        }
    );
});
