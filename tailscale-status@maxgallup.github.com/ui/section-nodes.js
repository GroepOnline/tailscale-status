import GObject from 'gi://GObject';

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * Tailnet node list; clicking a node copies its address. Mullvad exit nodes
 * are omitted here (they live in the exit-node section).
 */
export const NodesSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleNodesSection',
    },
    class NodesSection extends PopupMenu.PopupMenuSection {
        constructor({service, settings}) {
            super();
            this._service = service;
            this._settings = settings;

            this._nodesMenu = new PopupMenu.PopupSubMenuMenuItem('Nodes');
            this.addMenuItem(this._nodesMenu);
        }

        update(state) {
            this._nodesMenu.menu.removeAll();
            if (state.error || state.backendState !== 'Running') {
                this._nodesMenu.sensitive = false;
                return;
            }
            this._nodesMenu.sensitive = true;
            for (const node of state.nodes) {
                if (node.isMullvadExitNode) {
                    continue;
                }
                const item = new PopupMenu.PopupMenuItem(node.line);
                item.connect('activate', () => this._copyAddress(node));
                this._nodesMenu.menu.addMenuItem(item);
            }
        }

        _copyAddress(node) {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, node.address);
            if (this._settings?.get_boolean('auto-copy-node-address') ?? true) {
                Main.notify(`Copied ${node.address} to clipboard (${node.name})`);
            }
        }
    }
);
