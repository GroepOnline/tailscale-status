# LocalAPI endpoint verification — 2026-09-01

Purpose: prove every LocalAPI endpoint the rewrite (plan 2026-09-01-001) uses, against
(a) the live daemon on this machine and (b) upstream source at `main`, before any
implementation. Prompted by review feedback: profiles, profile switching and file APIs
were load-bearing but unverified; LocalAPI is documented as internal/unstable.

## Environment

- tailscale `1.102.3` (commit 9329c3677031109ff6d0b80abee0cddc8f35ff6f), live socket `/run/tailscale/tailscaled.sock`
- GNOME Shell 50.1, gjs 1.88.0
- Upstream sources fetched from github.com/tailscale/tailscale @ main:
  `ipn/localapi/localapi.go` (handler table + serveProfiles doc), `client/local/local.go` (client methods and exact methods/paths)

## Probe results (live daemon, read-only probes)

| Probe | Result |
|---|---|
| `GET /localapi/v0/status` | 200, JSON with Version 1.102.3, BackendState Running, Self, TailscaleIPs |
| `GET /localapi/v0/prefs` | 200, Prefs JSON (ControlURL, RouteAll, ExitNodeID, ExitNodeIP, ExitNodeAllowLANAccess, CorpDNS, WantRunning, ShieldsUp, ...) |
| `GET /localapi/v0/profiles` | **404 page not found** |
| `GET /localapi/v0/profiles/` | 200, JSON array of `ipn.LoginProfile` (ID, Key `profile-ce7e`, Name login email, NetworkProfile, UserProfile) |
| `GET /localapi/v0/profiles/current` | 200, current `ipn.LoginProfile` |
| `GET /localapi/v0/files/` | 200, `null` (no pending files; array when non-empty) |
| `GET /localapi/v0/files` | (implied 404 — prefix route needs slash; client uses `files/`) |
| `GET /localapi/v0/file-targets` | 200, array with `Node.StableID` per Taildrop-capable peer |
| `POST /localapi/v0/suggest-exit-node` | 200, `{"ID":"","Name":""}` |

## Upstream method/shape contract (client/local/local.go)

- Prefs read: `GET /localapi/v0/prefs` (line 965). Prefs update: **`PATCH /localapi/v0/prefs`** with merge body (line 984).
- Start: `POST /localapi/v0/start` (204). Logout: `POST /localapi/v0/logout` (204).
- Profiles (localapi.go serveProfiles doc, lines 1527–1533): `GET /localapi/v0/profiles/` list; `PUT /localapi/v0/profiles/` add; `GET /localapi/v0/profiles/current`; `GET /localapi/v0/profiles/<id>`; **`POST /localapi/v0/profiles/<id>` switch (204)**; `DELETE /localapi/v0/profiles/<id>` delete. Handler is registered as **prefix match** `"profiles/"` (line 73) — missing trailing slash = 404. Requires `PermitWrite` (operator grant).
- Waiting files: `GET /localapi/v0/files/?waitsec=<n>` (list, line 814); download `GET /localapi/v0/files/<url.PathEscape(name)>` (line 828); delete `DELETE /localapi/v0/files/<url.PathEscape(name)>` (204, line 823).
- Taildrop send: `GET /localapi/v0/file-targets` (line 849) then **`PUT /localapi/v0/file-put/<stableID>/<url.PathEscape(name)>`** (line 861). This removes the previously planned `tailscale file cp` CLI fallback entirely.
- Exit-node suggestion: `POST /localapi/v0/suggest-exit-node` (localapi.go line 115).

## Consequences adopted in the plan

1. All toggles (up/down via WantRunning, shields, accept-routes, exit-node, allow-LAN) are `PATCH /localapi/v0/prefs` merges — one write path, no `tailscale up --flag` choreography.
2. Account switch = `POST /localapi/v0/profiles/<profileKey>`; no email-regex scraping of `switch --list` output.
3. File send/receive are pure LocalAPI + DBus portal picker; R2 has **no exceptions**.
4. Gotchas encoded in the client: trailing-slash prefix routes (`profiles/`, `files/`), URL-escaped file names, `PermitWrite`/operator grant surfaces as HTTP 403 → UI shows `tailscale up --operator=<user>` instruction instead of pkexec.
5. HTTP transport uses `Connection: close` so the body is read to EOF (immune to chunked vs Content-Length differences of the Go http server).
