import Gio from 'gi://Gio';

/** Open a URI with the desktop default handler via the GIO URI-launch API. */
export function launchUri(uri) {
    return new Promise((resolve, reject) => {
        Gio.AppInfo.launch_default_for_uri_async(uri, null, null, (source, res) => {
            try {
                resolve(source.launch_default_for_uri_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}
