import GObject from 'gi://GObject';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const CHECK = 1; // PopupMenu.Ornament.CHECK — avoid depending on the enum's name across versions

/**
 * Exit-node picker. Kept FLAT (no nested submenus): GNOME's PopupMenu breaks
 * on submenu-in-submenu trees — the old extension monkey-patched private APIs
 * to work around that. Personal exit nodes come first, then Mullvad cities as
 * "Country — City" entries.
 */
export const ExitNodesSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleExitNodesSection',
    },
    class ExitNodesSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;
            this._exitMenu = new PopupMenu.PopupSubMenuMenuItem('Exit Nodes');
            this.addMenuItem(this._exitMenu);
        }

        update(state) {
            this._exitMenu.menu.removeAll();
            if (state.error || state.backendState !== 'Running') {
                this._exitMenu.sensitive = false;
                return;
            }
            this._exitMenu.sensitive = true;

            const noneItem = new PopupMenu.PopupMenuItem('None');
            noneItem.setOrnament(state.usesExitNode ? 0 : CHECK);
            noneItem.connect('activate', () => this._service.setExitNode(null));
            this._exitMenu.menu.addMenuItem(noneItem);

            const personal = state.nodes.filter((n) => !n.isSelf && n.offersExit && !n.isMullvadExitNode);
            for (const node of personal) {
                const item = new PopupMenu.PopupMenuItem(node.name);
                item.setOrnament(node.usesExit ? CHECK : 0);
                item.connect('activate', () => this._service.setExitNode(node.address));
                this._exitMenu.menu.addMenuItem(item);
            }

            // Mullvad: group cities by country, one flat "Country — City" entry per city
            const byCountry = new Map();
            for (const node of state.nodes) {
                if (!node.isMullvadExitNode || !node.offersExit) {
                    continue;
                }
                const country = node.groupPath[1] ?? 'Unknown';
                const city = node.groupPath[2] ?? node.name;
                if (!byCountry.has(country)) {
                    byCountry.set(country, new Map());
                }
                const cities = byCountry.get(country);
                if (!cities.has(city)) {
                    cities.set(city, node);
                }
            }
            for (const country of [...byCountry.keys()].sort()) {
                for (const [city, node] of byCountry.get(country)) {
                    const item = new PopupMenu.PopupMenuItem(`Mullvad: ${country} — ${city}`);
                    item.setOrnament(node.usesExit ? CHECK : 0);
                    item.connect('activate', () => this._service.setExitNode(node.address));
                    this._exitMenu.menu.addMenuItem(item);
                }
            }
        }
    }
);
