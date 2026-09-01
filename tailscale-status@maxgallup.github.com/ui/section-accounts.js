import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * Account switcher backed by the LocalAPI profiles endpoints — no more
 * email-regex scraping of `tailscale switch --list` output.
 */
export const AccountsSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleAccountsSection',
    },
    class AccountsSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;
            this._profiles = [];

            this._updateButton = new PopupMenu.PopupMenuItem('Update Accounts List');
            this._updateButton.connect('activate', () => this._loadProfiles());

            this._accountsMenu = new PopupMenu.PopupSubMenuMenuItem('Accounts');
            this.addMenuItem(this._updateButton);
            this.addMenuItem(this._accountsMenu);
        }

        update(state) {
            const active = !state.error && state.backendState === 'Running';
            this._updateButton.sensitive = active;
            this._accountsMenu.sensitive = active;
            // reflect profile changes (e.g. after a switch) without re-fetching
            this._render(state.username);
        }

        async _loadProfiles() {
            try {
                this._profiles = await this._service.client.listProfiles();
                this._render(this._service.state.username);
            } catch (e) {
                Main.notify('Could not list accounts', e.message ?? String(e));
            }
        }

        _render(currentUsername) {
            this._accountsMenu.menu.removeAll();
            for (const profile of this._profiles) {
                const isCurrent = profile.Name === currentUsername;
                const item = new PopupMenu.PopupMenuItem(
                    isCurrent ? `✓ ${profile.Name}` : profile.Name
                );
                if (isCurrent) {
                    item.sensitive = false;
                } else {
                    item.connect('activate', () => {
                        Main.notify(`Switching to ${profile.Name}`);
                        this._service.switchToProfile(profile.Key);
                    });
                }
                this._accountsMenu.menu.addMenuItem(item);
            }
            if (this._profiles.length === 0) {
                const hint = new PopupMenu.PopupMenuItem('(click Update Accounts List)', {reactive: false});
                this._accountsMenu.menu.addMenuItem(hint);
            }
        }
    }
);
