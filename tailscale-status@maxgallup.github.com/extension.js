import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {LocalApiClient} from './lib/localapi.js';
import {TailscaleService} from './lib/service.js';
import {TailscaleMenu} from './ui/menu.js';

/**
 * Entry point only: builds the object graph with explicit ownership
 * (extension → service → client, extension → menu → service) and tears it
 * down completely in disable(). No module-level state.
 */
export default class TailscaleStatusExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.tailscale-status');
        this._settingsSignal = this._settings.connect('changed::poll-interval', () => {
            this._service?.setPollInterval(this._settings.get_uint('poll-interval'));
        });

        this._client = new LocalApiClient({
            socketPath: this._settings.get_string('socket-path'),
        });
        this._service = new TailscaleService({
            client: this._client,
            pollInterval: this._settings.get_uint('poll-interval'),
        });
        this._service.start();

        this._menu = new TailscaleMenu({
            service: this._service,
            settings: this._settings,
            extensionPath: this.path,
        });
        Main.panel.addToStatusArea('tailscale', this._menu, 1);
    }

    disable() {
        if (this._menu) {
            this._menu.destroy();
            this._menu = null;
        }
        if (this._service) {
            this._service.stop();
            this._service = null;
        }
        this._client = null;
        if (this._settings) {
            if (this._settingsSignal) {
                this._settings.disconnect(this._settingsSignal);
                this._settingsSignal = null;
            }
            this._settings = null;
        }
    }
}
