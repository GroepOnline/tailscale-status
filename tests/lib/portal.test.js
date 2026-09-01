import GLib from 'gi://GLib';
import {openFilePicker, PortalError} from '../../tailscale-status@maxgallup.github.com/lib/portal.js';
import {register, assert, assertEqual, withTimeout} from '../harness.js';

/** Fake DBusProxy pair: OpenFile returns a request path; Response fires immediately. */
function fakeProxies({responseCode = 0, uris = [], failChooser = false, delayResponseMs = 0} = {}) {
    const chooserProxy = {
        call_sync: (method, args) => {
            if (failChooser) {
                throw new Error('no portal service');
            }
            if (method !== 'OpenFile') {
                throw new Error(`unexpected method ${method}`);
            }
            const [, options] = args.deepUnpack();
            fakeProxies.lastOptions = options;
            return new GLib.Variant('(o)', ['/org/freedesktop/portal/desktop/request/sender/token']);
        },
    };
    const requestProxy = {
        connect: (_sig, handler) => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayResponseMs, () => {
                handler(requestProxy, ':sender', 'Response', new GLib.Variant('(ua{sv})', [
                    responseCode,
                    {uris: new GLib.Variant('as', uris)},
                ]));
                return GLib.SOURCE_REMOVE;
            });
            return 1;
        },
        disconnect: () => {},
    };
    return {
        createFileChooserProxy: async () => {
            if (failChooser) {
                throw new Error('no portal service');
            }
            return chooserProxy;
        },
        createRequestProxy: async () => requestProxy,
    };
}

register('portal: resolves picked URIs on success', async () => {
    const deps = fakeProxies({uris: ['file:///tmp/a.txt', 'file:///tmp/b.txt']});
    const uris = await withTimeout(openFilePicker({title: 'Send', multiple: true, deps}), 5000, 'portal success');
    assertEqual(uris, ['file:///tmp/a.txt', 'file:///tmp/b.txt']);
    const options = fakeProxies.lastOptions;
    assertEqual(options.multiple.deepUnpack(), true);
    assertEqual(options.title.deepUnpack(), 'Send');
});

register('portal: user cancel resolves empty list', async () => {
    const deps = fakeProxies({responseCode: 1, uris: ['file:///should-not-appear']});
    const uris = await withTimeout(openFilePicker({deps}), 5000, 'portal cancel');
    assertEqual(uris, []);
});

register('portal: unavailable rejects with PortalError', async () => {
    const deps = fakeProxies({failChooser: true});
    try {
        await withTimeout(openFilePicker({deps}), 5000, 'portal unavailable');
        assert(false, 'expected PortalError');
    } catch (e) {
        assert(e instanceof PortalError, `expected PortalError, got ${e?.name}`);
        assert(e.message.includes('unavailable'), `message: ${e.message}`);
    }
});
