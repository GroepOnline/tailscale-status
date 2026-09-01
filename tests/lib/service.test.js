import {TailscaleService} from '../../tailscale-status@maxgallup.github.com/lib/service.js';
import {LocalApiError} from '../../tailscale-status@maxgallup.github.com/lib/localapi.js';
import {register, assert, assertEqual, withTimeout, sleep} from '../harness.js';
import {statusFixture, prefsFixture, profilesFixture} from '../fixtures.js';

/** Fake client: records calls, returns canned responses, no sockets needed. */
function fakeClient(overrides = {}) {
    const calls = [];
    const base = {
        status: () => {
            calls.push('status');
            return Promise.resolve(statusFixture);
        },
        getPrefs: () => {
            calls.push('getPrefs');
            return Promise.resolve(prefsFixture);
        },
        patchPrefs: (partial) => {
            calls.push({patchPrefs: partial});
            return Promise.resolve({...prefsFixture, ...partial});
        },
        switchProfile: (key) => {
            calls.push({switchProfile: key});
            return Promise.resolve(204);
        },
        logout: () => {
            calls.push('logout');
            return Promise.resolve(204);
        },
        loginInteractive: () => {
            calls.push('loginInteractive');
            return Promise.resolve(204);
        },
    };
    for (const key of Object.keys(overrides)) {
        base[key] = overrides[key];
    }
    return {calls, ...base};
}

register('service: start() refreshes and emits state-changed with derived nodes', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 0});
    const states = [];
    const id = service.connect('state-changed', (_svc, state) => states.push(state));
    service.start();
    await withTimeout(sleep(50), 5000, 'initial refresh');
    service.disconnect(id);
    service.stop();
    assert(states.length >= 1, 'at least one state-changed');
    assertEqual(states[0].backendState, 'Running');
    assertEqual(states[0].username, 'joep@example.com');
    assertEqual(states[0].usesExitNode, 'exit-active');
    assertEqual(states[0].nodes.length, 5, 'self + 4 peers');
    assertEqual(states[0].prefs.ExitNodeIP, '100.64.0.5');
});

register('service: poll timer stops fully after stop()', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 1});
    let refreshes = 0;
    service.connect('state-changed', () => refreshes++);
    service.start();
    await withTimeout(sleep(50), 5000, 'initial refresh');
    const afterInitial = refreshes;
    assert(afterInitial >= 1, 'initial refresh happened');
    service.stop();
    await withTimeout(sleep(1500), 5000, 'wait past one poll interval');
    assertEqual(refreshes, afterInitial, 'no further refreshes after stop()');
});

register('service: poll fires while running (1s interval)', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 1});
    let refreshes = 0;
    service.connect('state-changed', () => refreshes++);
    service.start();
    await withTimeout(sleep(1500), 5000, 'poll window');
    service.stop();
    assert(refreshes >= 2, `expected initial + at least one poll refresh, got ${refreshes}`);
});

register('service: refresh failure emits error and keeps state-error field', async () => {
    const client = fakeClient({
        status: () => Promise.reject(new LocalApiError('connect', 'socket gone')),
    });
    const service = new TailscaleService({client, pollInterval: 0});
    const errors = [];
    service.connect('error', (_svc, err) => errors.push(err));
    await withTimeout(service.refresh(), 5000, 'refresh');
    const stateError = service.state.error;
    service.stop();
    assertEqual(errors.length, 1);
    assertEqual(errors[0].code, 'connect');
    assertEqual(stateError?.code, 'connect');
});

register('service: write helpers call patchPrefs and refresh', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 0});
    await withTimeout(service.setUp(false), 5000, 'setUp');
    await withTimeout(service.setShieldsUp(true), 5000, 'shields');
    await withTimeout(service.setAcceptRoutes(false), 5000, 'routes');
    await withTimeout(service.setAllowLanAccess(true), 5000, 'lan');
    await withTimeout(service.setExitNode('100.64.0.4'), 5000, 'exit');
    await withTimeout(service.setExitNode(null), 5000, 'exit clear');
    const patches = client.calls.filter((c) => c.patchPrefs).map((c) => c.patchPrefs);
    assertEqual(patches, [
        {WantRunning: false},
        {ShieldsUp: true},
        {RouteAll: false},
        {ExitNodeAllowLANAccess: true},
        {ExitNodeIP: '100.64.0.4'},
        {ExitNodeIP: ''},
    ]);
    service.stop();
});

register('service: switchToProfile hits profiles endpoint and refreshes', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 0});
    await withTimeout(service.switchToProfile('profile-aa11'), 5000, 'switch');
    service.stop();
    assert(client.calls.some((c) => c.switchProfile === 'profile-aa11'), 'switchProfile called with key');
});

register('service: write failure emits error and rethrows', async () => {
    const client = fakeClient({
        patchPrefs: () => Promise.reject(new LocalApiError('http', 'profiles access denied', 403)),
    });
    const service = new TailscaleService({client, pollInterval: 0});
    const errors = [];
    service.connect('error', (_svc, err) => errors.push(err));
    let thrown = null;
    try {
        await withTimeout(service.setUp(true), 5000, 'setUp');
    } catch (e) {
        thrown = e;
    }
    service.stop();
    assert(thrown instanceof LocalApiError, 'write failure rethrows');
    assertEqual(errors.length, 1);
    assertEqual(errors[0].status, 403);
});

register('service: setPollInterval re-arms without recreating service', async () => {
    const client = fakeClient();
    const service = new TailscaleService({client, pollInterval: 0});
    service.start();
    service.setPollInterval(1);
    assert(service._pollSource !== null, 'poll source armed');
    service.setPollInterval(0);
    assert(service._pollSource === null, 'poll source disarmed at 0');
    service.stop();
    assert(service._pollSource === null, 'stop() disarms poll');
});

register('service: profiles available via client for account menu', async () => {
    const client = fakeClient({
        listProfiles: () => Promise.resolve(profilesFixture),
    });
    const service = new TailscaleService({client, pollInterval: 0});
    const profiles = await withTimeout(service.client.listProfiles(), 5000, 'listProfiles');
    service.stop();
    assertEqual(profiles.length, 2);
    assertEqual(profiles[1].Name, 'work@example.org');
});
