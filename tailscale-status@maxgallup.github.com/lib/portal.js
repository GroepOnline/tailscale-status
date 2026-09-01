import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PORTAL_SERVICE = 'org.freedesktop.portal.Desktop';
const PORTAL_PATH = '/org/freedesktop/portal/desktop';
const FILECHOOSER_IFACE = 'org.freedesktop.portal.FileChooser';
const REQUEST_IFACE = 'org.freedesktop.portal.Request';

let requestTokenCounter = 0;

/** Default factory: FileChooser proxy on the session bus. */
async function defaultCreateFileChooserProxy() {
    return Gio.DBusProxy.new_for_bus_future(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.NONE,
        null,
        PORTAL_SERVICE,
        PORTAL_PATH,
        FILECHOOSER_IFACE,
        null
    );
}

async function defaultCreateRequestProxy(requestPath) {
    return Gio.DBusProxy.new_for_bus_future(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.NONE,
        null,
        PORTAL_SERVICE,
        requestPath,
        REQUEST_IFACE,
        null
    );
}

/**
 * Open the system file chooser via xdg-desktop-portal and resolve to the
 * picked file URIs. No Gtk import, no subprocess — the portal is the
 * sandbox-friendly, GNOME-standard way to pick files from a shell process.
 *
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {boolean} [opts.multiple]
 * @param {object} [opts.deps] injectable proxies for unit tests
 * @returns {Promise<string[]>} file:// URIs (empty array on cancel/dismiss)
 */
export async function openFilePicker({title = 'Select files', multiple = true, deps = {}} = {}) {
    const createFileChooserProxy = deps.createFileChooserProxy ?? defaultCreateFileChooserProxy;
    const createRequestProxy = deps.createRequestProxy ?? defaultCreateRequestProxy;

    let chooserProxy;
    try {
        chooserProxy = await createFileChooserProxy();
    } catch (e) {
        throw new PortalError(`file chooser portal unavailable: ${e.message ?? e}`);
    }

    requestTokenCounter++;
    const options = {
        handle_token: new GLib.Variant('s', `tailscalestatus${requestTokenCounter}`),
        title: new GLib.Variant('s', title),
        multiple: new GLib.Variant('b', multiple),
        modal: new GLib.Variant('b', true),
    };
    const [requestPath] = chooserProxy.call_sync(
        'OpenFile',
        new GLib.Variant('(sa{sv})', ['', options]),
        Gio.DBusCallFlags.NONE,
        -1,
        null
    ).deepUnpack();

    const requestProxy = await createRequestProxy(requestPath);
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
            if (settled) {
                return;
            }
            settled = true;
            requestProxy.disconnect(signalId);
            GLib.source_remove(watchdog);
            fn(value);
        };
        const signalId = requestProxy.connect('g-signal', (_proxy, _sender, signal, params) => {
            if (signal !== 'Response') {
                return;
            }
            const [responseCode, results] = params.deepUnpack();
            if (responseCode !== 0) {
                // 1 = cancelled by user, anything else is a portal error
                finish(resolve, []);
                return;
            }
            const uris = results.uris?.deepUnpack() ?? [];
            finish(resolve, uris);
        });
        // the portal never answers means a stuck dialog; give up after 10 minutes
        const watchdog = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 600, () => {
            finish(reject, new PortalError('file chooser timed out'));
            return GLib.SOURCE_REMOVE;
        });
    });
}

export class PortalError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PortalError';
        this.code = 'portal';
    }
}
