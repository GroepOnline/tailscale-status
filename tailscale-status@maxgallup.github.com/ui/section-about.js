import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {launchUri} from './util.js';

const REPO_URL = 'https://github.com/GroepOnline/tailscale-status';

export const AboutSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleAboutSection',
    },
    class AboutSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;

            const aboutMenu = new PopupMenu.PopupSubMenuMenuItem('About');

            this._healthItem = new PopupMenu.PopupMenuItem('Health');
            this._healthItem.connect('activate', () => {
                const health = this._service.state.health;
                if (health && health.length > 0) {
                    Main.notify('Tailscale health', health.join('\n'));
                } else if (health) {
                    Main.notify('Tailscale health', 'no problems reported');
                } else {
                    Main.notify('Tailscale health', 'unknown');
                }
            });

            const sourceItem = new PopupMenu.PopupMenuItem('Source code');
            sourceItem.connect('activate', () => {
                launchUri(REPO_URL).catch((e) => console.error(`[tailscale-status] open URL failed: ${e.message}`));
            });

            const infoItem = new PopupMenu.PopupMenuItem('This extension is in no way affiliated with Tailscale Inc.', {reactive: false});

            aboutMenu.menu.addMenuItem(infoItem);
            aboutMenu.menu.addMenuItem(sourceItem);
            aboutMenu.menu.addMenuItem(this._healthItem);
            this.addMenuItem(aboutMenu);
        }

        update(state) {
            this._healthItem.sensitive = !state.error && state.backendState === 'Running';
        }
    }
);
