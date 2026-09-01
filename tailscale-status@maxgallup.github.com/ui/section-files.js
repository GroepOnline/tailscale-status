import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {openFilePicker, PortalError} from '../lib/portal.js';

/**
 * Taildrop without subprocesses: sending goes through the xdg-desktop-portal
 * file chooser plus the LocalAPI `file-put` endpoint; receiving through the
 * LocalAPI `files/` endpoints. Replaces the old helper-tool based flow.
 */
export const FilesSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleFilesSection',
    },
    class FilesSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;
            this._busy = false;

            this._sendMenu = new PopupMenu.PopupSubMenuMenuItem('Send Files');
            this._sendMenu.menu.connect('open-state-changed', (_menu, open) => {
                if (open) {
                    this._refreshTargets();
                }
            });

            this._receiveItem = new PopupMenu.PopupMenuItem('Accept incoming files');
            this._receiveItem.connect('activate', () => this._receiveFiles());

            this.addMenuItem(this._receiveItem);
            this.addMenuItem(this._sendMenu);
        }

        update(state) {
            const active = !state.error && state.backendState === 'Running';
            this._sendMenu.sensitive = active;
            this._receiveItem.sensitive = active;
            if (!active) {
                this._sendMenu.menu.removeAll();
            }
        }

        async _refreshTargets() {
            this._sendMenu.menu.removeAll();
            const hint = new PopupMenu.PopupMenuItem('(loading targets…)', {reactive: false});
            this._sendMenu.menu.addMenuItem(hint);
            try {
                const targets = await this._service.client.fileTargets();
                this._sendMenu.menu.removeAll();
                if (targets.length === 0) {
                    this._sendMenu.menu.addMenuItem(
                        new PopupMenu.PopupMenuItem('(no Taildrop targets online)', {reactive: false})
                    );
                    return;
                }
                for (const target of targets) {
                    const node = target.Node ?? {};
                    const name = String(node.Name ?? node.StableID ?? 'unknown').replace(/\.$/, '');
                    const item = new PopupMenu.PopupMenuItem(name);
                    item.connect('activate', () => this._sendFiles(node.StableID, name));
                    this._sendMenu.menu.addMenuItem(item);
                }
            } catch (e) {
                this._sendMenu.menu.removeAll();
                const errorItem = new PopupMenu.PopupMenuItem(`targets unavailable: ${e.message}`, {reactive: false});
                this._sendMenu.menu.addMenuItem(errorItem);
            }
        }

        async _sendFiles(stableId, targetName) {
            if (this._busy) {
                return;
            }
            this._busy = true;
            try {
                const uris = await openFilePicker({title: `Send files to ${targetName}`, multiple: true});
                if (uris.length === 0) {
                    return; // user cancelled
                }
                let sent = 0;
                for (const uri of uris) {
                    const file = Gio.File.new_for_uri(uri);
                    const bytes = await loadBytes(file);
                    const name = file.get_basename();
                    await this._service.client.putFile(stableId, name, bytes);
                    sent++;
                }
                Main.notify(`Sent ${sent} file(s) to ${targetName}`);
            } catch (e) {
                if (e instanceof PortalError) {
                    Main.notify('File picker unavailable', e.message);
                } else {
                    Main.notify('Sending files failed', e.message ?? String(e));
                }
            } finally {
                this._busy = false;
            }
        }

        async _receiveFiles() {
            if (this._busy) {
                return;
            }
            this._busy = true;
            try {
                const waiting = await this._service.client.waitingFiles();
                if (waiting.length === 0) {
                    Main.notify('No incoming files');
                    return;
                }
                const downloads = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
                if (!downloads) {
                    Main.notify('No Downloads directory configured', 'cannot store incoming files');
                    return;
                }
                let saved = 0;
                for (const waitingFile of waiting) {
                    const bytes = await this._service.client.downloadWaitingFile(waitingFile.Name);
                    const destination = Gio.File.new_for_path(`${downloads}/${waitingFile.Name}`);
                    await writeBytes(destination, bytes);
                    await this._service.client.deleteWaitingFile(waitingFile.Name);
                    saved++;
                }
                Main.notify(`Saved ${saved} file(s) to ${downloads}`);
            } catch (e) {
                Main.notify('Receiving files failed', e.message ?? String(e));
            } finally {
                this._busy = false;
            }
        }
    }
);

function loadBytes(file) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (source, res) => {
            try {
                const [bytes] = source.load_contents_finish(res);
                resolve(new Uint8Array(bytes));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function writeBytes(file, bytes) {
    return new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(
            GLib.Bytes.new(bytes),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (source, res) => {
                try {
                    source.replace_contents_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}
