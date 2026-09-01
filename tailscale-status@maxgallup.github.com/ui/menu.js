import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {StatusSection} from './section-status.js';
import {NodesSection} from './section-nodes.js';
import {AccountsSection} from './section-accounts.js';
import {ExitNodesSection} from './section-exit-nodes.js';
import {TogglesSection} from './section-toggles.js';
import {FilesSection} from './section-files.js';
import {AboutSection} from './section-about.js';

/**
 * The panel menu. Owns the single service signal connection and fans state
 * out to sections; every section cleans up after itself via destroy().
 */
export const TailscaleMenu = GObject.registerClass(
    {
        GTypeName: 'TailscaleMenu',
    },
    class TailscaleMenu extends PanelMenu.Button {
        constructor({service, settings, extensionPath}) {
            super(0);

            const icon = new St.Icon({
                gicon: Gio.icon_new_for_string(`${extensionPath}/icon-down.svg`),
                style_class: 'system-status-icon',
            });
            this.add_child(icon);
            this._icon = icon;
            this._icons = {
                down: Gio.icon_new_for_string(`${extensionPath}/icon-down.svg`),
                up: Gio.icon_new_for_string(`${extensionPath}/icon-up.svg`),
                exit: Gio.icon_new_for_string(`${extensionPath}/icon-exit-node.svg`),
            };

            this._service = service;
            this._sections = [
                new StatusSection({service}),
                new NodesSection({service, settings}),
                new AccountsSection({service}),
                new TogglesSection({service}),
                new FilesSection({service}),
                new ExitNodesSection({service}),
                new AboutSection({service}),
            ];

            // Order matters — mirrors the original menu layout.
            const separator = () => new PopupMenu.PopupSeparatorMenuItem();
            this.menu.addMenuItem(this._sections[0]); // status
            this.menu.addMenuItem(separator());
            this.menu.addMenuItem(this._sections[1]); // nodes
            this.menu.addMenuItem(this._sections[2]); // accounts
            this.menu.addMenuItem(separator());
            this.menu.addMenuItem(this._sections[3]); // toggles
            this.menu.addMenuItem(separator());
            this.menu.addMenuItem(this._sections[4]); // files
            this.menu.addMenuItem(this._sections[5]); // exit nodes
            this.menu.addMenuItem(separator());
            this.menu.addMenuItem(new LogoutItem({service}));
            this.menu.addMenuItem(this._sections[6]); // about

            this._stateChangedId = service.connect('state-changed', (_svc, state) => this._update(state));
            this._errorId = service.connect('error', (_svc, error) => {
                Main.notify('Tailscale error', error.message ?? String(error));
            });

            this.menu.connect('open-state-changed', (_menu, open) => {
                if (open) {
                    service.refresh();
                }
            });

            this._update(service.state);
        }

        _update(state) {
            for (const section of this._sections) {
                section.update(state);
            }
            if (state.error) {
                this._icon.gicon = this._icons.down;
            } else if (state.backendState === 'Running' && state.usesExitNode) {
                this._icon.gicon = this._icons.exit;
            } else if (state.backendState === 'Running') {
                this._icon.gicon = this._icons.up;
            } else {
                this._icon.gicon = this._icons.down;
            }
        }

        destroy() {
            this._service.disconnect(this._stateChangedId);
            this._service.disconnect(this._errorId);
            super.destroy();
        }
    }
);

const LogoutItem = GObject.registerClass(
    {
        GTypeName: 'TailscaleLogoutItem',
    },
    class LogoutItem extends PopupMenu.PopupMenuItem {
        constructor({service}) {
            super('Log Out');
            this._service = service;
            this.connect('activate', () => {
                service.logout();
            });
        }
    }
);
