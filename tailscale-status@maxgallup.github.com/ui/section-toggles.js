import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * The three behaviour switches: shields, subnet routes, direct LAN access
 * under an exit node. States come from prefs read during refresh.
 */
export const TogglesSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleTogglesSection',
    },
    class TogglesSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;
            this._syncing = false;

            this._shieldItem = new PopupMenu.PopupSwitchMenuItem('Block Incoming', false);
            this._shieldItem.connect('activate', () => {
                this._apply('setShieldsUp', this._shieldItem.state, this._shieldItem);
            });

            this._routesItem = new PopupMenu.PopupSwitchMenuItem('Accept Routes', false);
            this._routesItem.connect('activate', () => {
                this._apply('setAcceptRoutes', this._routesItem.state, this._routesItem);
            });

            this._lanItem = new PopupMenu.PopupSwitchMenuItem('Allow Direct LAN Access', false);
            this._lanItem.connect('activate', () => {
                this._apply('setAllowLanAccess', this._lanItem.state, this._lanItem);
            });

            this.addMenuItem(this._shieldItem);
            this.addMenuItem(this._routesItem);
            this.addMenuItem(this._lanItem);
        }

        update(state) {
            if (state.error || state.backendState !== 'Running') {
                this._shieldItem.sensitive = false;
                this._routesItem.sensitive = false;
                this._lanItem.sensitive = false;
                return;
            }
            const prefs = state.prefs;
            this._shieldItem.sensitive = true;
            this._routesItem.sensitive = true;
            // direct LAN access only makes sense with an exit node
            this._lanItem.sensitive = Boolean(state.usesExitNode);
            if (!prefs) {
                return; // prefs unavailable; leave switches as-is
            }
            this._syncing = true;
            this._shieldItem.setToggleState(Boolean(prefs.ShieldsUp));
            this._routesItem.setToggleState(Boolean(prefs.RouteAll));
            this._lanItem.setToggleState(Boolean(prefs.ExitNodeAllowLANAccess));
            this._syncing = false;
        }

        async _apply(method, value, item) {
            if (this._syncing) {
                return;
            }
            try {
                await this._service[method](value);
            } catch {
                Main.notify('Tailscale change failed', 'the daemon rejected the request; state was re-synced');
            }
        }
    }
);
