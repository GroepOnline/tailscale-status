import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {launchUri} from './util.js';

const statusString = 'Status: ';

/**
 * Top of the menu: master switch, status line, login actions, account line.
 */
export const StatusSection = GObject.registerClass(
    {
        GTypeName: 'TailscaleStatusSection',
    },
    class StatusSection extends PopupMenu.PopupMenuSection {
        constructor({service}) {
            super();
            this._service = service;
            this._launching = false;

            this._switchItem = new PopupMenu.PopupSwitchMenuItem('Tailscale', false);
            this._switchItem.connect('activate', () => {
                this._service.setUp(this._switchItem.state);
            });

            this._statusItem = new PopupMenu.PopupMenuItem(statusString, {reactive: false});

            this._loginItem = new PopupMenu.PopupMenuItem('Open login page');
            this._loginItem.connect('activate', () => {
                this._openLogin();
            });

            this._accountItem = new PopupMenu.PopupMenuItem('Account: ', {reactive: false});

            this.addMenuItem(this._switchItem);
            this.addMenuItem(this._statusItem);
            this.addMenuItem(this._loginItem);
            this.addMenuItem(this._accountItem);
        }

        update(state) {
            if (state.error) {
                this._statusItem.label.text = `${statusString}unreachable (${state.error.message})`;
                this._setSensitive(false);
                return;
            }
            this._accountItem.label.text = 'Account: ' + (state.username ?? 'unknown');
            switch (state.backendState) {
                case 'Running':
                    this._switchItem.setToggleState(true);
                    this._statusItem.label.text = state.usesExitNode
                        ? `${statusString}up (exit-node: ${state.usesExitNode})`
                        : `${statusString}up (no exit-node)`;
                    this._loginItem.visible = false;
                    this._setSensitive(true);
                    break;
                case 'Stopped':
                    this._switchItem.setToggleState(false);
                    this._statusItem.label.text = `${statusString}down`;
                    this._loginItem.visible = false;
                    this._setSensitive(true);
                    break;
                case 'NeedsLogin':
                    this._switchItem.setToggleState(false);
                    this._statusItem.label.text = `${statusString}needs login`;
                    this._loginItem.label.text = state.authUrl ? 'Open login page' : 'Log in';
                    this._loginItem.visible = true;
                    this._setSensitive(false);
                    break;
                default:
                    this._statusItem.label.text = `${statusString}unknown state (${state.backendState ?? 'null'})`;
                    this._setSensitive(false);
            }
        }

        _setSensitive(active) {
            this._switchItem.sensitive = active;
        }

        async _openLogin() {
            const state = this._service.state;
            if (state.authUrl) {
                this._launch(state.authUrl);
                return;
            }
            try {
                await this._service.loginInteractive();
            } catch (e) {
                // error signal carries it to the user; nothing else to do here
            }
        }

        async _launch(url) {
            if (this._launching || !url) {
                return;
            }
            this._launching = true;
            try {
                await launchUri(url);
            } catch (e) {
                console.error(`[tailscale-status] failed to open login URL: ${e.message}`);
            } finally {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                    this._launching = false;
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }
);
