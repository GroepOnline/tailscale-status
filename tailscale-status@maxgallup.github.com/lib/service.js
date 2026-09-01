import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {extractNodes, getUsername, activeExitNodeName} from './nodes.js';

/**
 * Owns tailnet state: one refresh actor, one poll timer, derived nodes.
 * Created by extension.js in enable(), destroyed in disable() — never a
 * module-level global (plan KTD8).
 *
 * Signals:
 *   state-changed(state)   — after every successful refresh; state snapshot below.
 *   error(error)           — refresh or write failure surfaced to the UI.
 */
export const TailscaleService = GObject.registerClass(
    {
        GTypeName: 'TailscaleStatusService',
        Signals: {
            'state-changed': {param_types: [GObject.TYPE_JSOBJECT]},
            error: {param_types: [GObject.TYPE_JSOBJECT]},
        },
    },
    class TailscaleService extends GObject.Object {
        /**
         * @param {object} opts
         * @param {object} opts.client LocalApiClient instance (injected).
         * @param {number} [opts.pollInterval] seconds between refreshes; 0 disables polling.
         */
        constructor({client, pollInterval = 60} = {}) {
            super();
            this._client = client;
            this._pollInterval = pollInterval;
            this._pollSource = null;
            this._destroyed = false;
            this._state = this._emptyState();
        }

        get state() {
            return this._state;
        }

        get client() {
            return this._client;
        }

        start() {
            this.refresh();
            this._armPoll();
        }

        stop() {
            this._destroyed = true;
            this._disarmPoll();
            this._state = this._emptyState();
        }

        setPollInterval(seconds) {
            this._pollInterval = seconds;
            this._armPoll();
        }

        // ---- read ---------------------------------------------------------------

        async refresh() {
            if (this._destroyed) {
                return;
            }
            try {
                const status = await this._client.status();
                if (this._destroyed) {
                    return;
                }
                const {nodes, tree} = extractNodes(status);
                let prefs = null;
                try {
                    prefs = await this._client.getPrefs();
                } catch {
                    // toggles will show as unknown; status display must not depend on prefs
                }
                if (this._destroyed) {
                    return;
                }
                this._state = {
                    backendState: status.BackendState,
                    authUrl: status.AuthURL ?? '',
                    health: status.Health ?? null,
                    username: getUsername(status),
                    nodes,
                    tree,
                    usesExitNode: activeExitNodeName(nodes),
                    prefs,
                    error: null,
                };
                this.emit('state-changed', this._state);
            } catch (e) {
                if (this._destroyed) {
                    return;
                }
                this._state = {...this._state, error: {code: e.code ?? 'unknown', message: e.message ?? String(e)}};
                this.emit('error', this._state.error);
            }
        }

        // ---- write --------------------------------------------------------------

        async _write(applyPrefs, afterAction) {
            if (this._destroyed) {
                return;
            }
            try {
                await applyPrefs();
                if (afterAction) {
                    await afterAction();
                }
                await this.refresh();
            } catch (e) {
                if (!this._destroyed) {
                    this.emit('error', {code: e.code ?? 'unknown', message: e.message ?? String(e), status: e.status ?? null});
                }
                throw e;
            }
        }

        setUp(wantRunning) {
            return this._write(() => this._client.patchPrefs({WantRunning: wantRunning}));
        }

        setShieldsUp(shieldsUp) {
            return this._write(() => this._client.patchPrefs({ShieldsUp: shieldsUp}));
        }

        setAcceptRoutes(acceptRoutes) {
            return this._write(() => this._client.patchPrefs({RouteAll: acceptRoutes}));
        }

        setAllowLanAccess(allowLan) {
            return this._write(() => this._client.patchPrefs({ExitNodeAllowLANAccess: allowLan}));
        }

        setExitNode(address) {
            return this._write(() => this._client.patchPrefs({ExitNodeIP: address ?? ''}));
        }

        switchToProfile(profileKey) {
            return this._write(() => this._client.switchProfile(profileKey));
        }

        logout() {
            return this._write(() => this._client.logout());
        }

        loginInteractive() {
            return this._write(() => this._client.loginInteractive());
        }

        // ---- polling ------------------------------------------------------------

        _armPoll() {
            this._disarmPoll();
            if (!this._pollInterval || this._pollInterval <= 0 || this._destroyed) {
                return;
            }
            this._pollSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._pollInterval, () => {
                this.refresh();
                return GLib.SOURCE_CONTINUE;
            });
        }

        _disarmPoll() {
            if (this._pollSource !== null) {
                GLib.source_remove(this._pollSource);
                this._pollSource = null;
            }
        }

        _emptyState() {
            return {
                backendState: null,
                authUrl: '',
                health: null,
                username: null,
                nodes: [],
                tree: {nodes: [], subTrees: {}},
                usesExitNode: null,
                prefs: null,
                error: null,
            };
        }
    }
);
