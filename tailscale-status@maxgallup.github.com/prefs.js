import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TailscaleStatusExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const connectionGroup = new Adw.PreferencesGroup({title: _('Connection')});
        const behaviourGroup = new Adw.PreferencesGroup({title: _('Behaviour')});
        page.add(connectionGroup);
        page.add(behaviourGroup);

        const loginServerRow = new Adw.EntryRow({title: _('Login-Server URL')});
        loginServerRow.text = settings.get_string('login-server');
        loginServerRow.connect('changed', () => {
            settings.set_string('login-server', loginServerRow.text);
        });
        connectionGroup.add(loginServerRow);

        const socketPathRow = new Adw.EntryRow({title: _('tailscaled socket path')});
        socketPathRow.text = settings.get_string('socket-path');
        socketPathRow.connect('changed', () => {
            settings.set_string('socket-path', socketPathRow.text);
        });
        connectionGroup.add(socketPathRow);

        const pollRow = new Adw.SpinRow.new_with_range(0, 600, 10);
        pollRow.title = _('Poll interval (seconds)');
        pollRow.subtitle = _('0 disables periodic polling; the menu refreshes on open');
        pollRow.adjustment.value = settings.get_uint('poll-interval');
        pollRow.connect('changed', () => {
            settings.set_uint('poll-interval', pollRow.value);
        });
        behaviourGroup.add(pollRow);

        const copyRow = new Adw.SwitchRow({title: _('Notify after copying a node address')});
        settings.bind('auto-copy-node-address', copyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviourGroup.add(copyRow);

        window.add(page);
    }
}
