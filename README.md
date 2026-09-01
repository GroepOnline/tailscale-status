# Gnome Extension: tailscale-status
**This extension is in no way affiliated with Tailscale Inc.**

Easily manage your tailnets from a GUI gnome extension.
Thus, this requires that you have **setup tailscale beforehand**. 

![menu image](pics/screenshot.png)

### Compatibility: post-gnome45
* Due to breaking changes addded in Gnome45, two versions of this extension will have to be supported: [pre-gnome45](https://github.com/maxgallup/tailscale-status/tree/pre-gnome45) and [post-gnome45](https://github.com/maxgallup/tailscale-status/tree/post-gnome45). **This branch is post-gnome45.**

### Architecture
This fork talks to the **Tailscale LocalAPI** over the tailscaled unix socket
(`/run/tailscale/tailscaled.sock` by default) instead of spawning `tailscale`
commands. That means: no privileged subprocesses, no shell parsing, no
first-run `pkexec` prompt. If the daemon rejects a request with HTTP 403 the
menu shows the one-time fix: `sudo tailscale up --operator=<your-user>`.

The code is split into modules under the extension directory:
`lib/localapi.js` (socket client), `lib/nodes.js` (pure node model),
`lib/service.js` (state + polling, owned by the extension), `lib/portal.js`
(file chooser via xdg-desktop-portal), and `ui/` (one GObject section per
menu part).

### Features
* Copy address of any node by clicking it in the menu
    * 💻 - your own computer
    * 🟢 - online or idle
    * ⚫ - offline
* enable/disable tailnet (WantRunning)
* accept/reject subnet routes
* *if exit node:* allow direct access to local network
* block incoming connections (shields)
* connect through an available [exit node](https://tailscale.com/kb/1103/exit-nodes/) (personal nodes and Mullvad)
* switch accounts (via the LocalAPI profiles endpoints)
* send or receive files with Taildrop (system file chooser + LocalAPI — no helper tools)
* open the login page from the menu when login is needed
* check reported health problems
* preferences: poll interval, copy-confirmation, socket path, Headscale server URL

### Dependencies
This obviously **requires** [tailscale](https://tailscale.com) to work! 
Grant your user access once so the extension may talk to the daemon without root:

```
sudo tailscale up --operator=$USER
```

### Installation
Download the `tailscale-status@maxgallup.github.com` directory and move it to `~/.local/share/gnome-shell/extensions/`.
Enable the extension in *Extensions* or *Extension Manager*.
You might have to log in and out for the extension to be loaded.

### Development

```
make test        # unit tests (gjs against a mock LocalAPI on a unix socket)
make lint        # eslint
make check       # lint + guards + tests
make schemas     # compile the GSettings schema
make test-wayland
make zip
```

Unit tests run in `gjs -m tests/run.js` against a mock server and are
merge-blocking in CI (`.github/workflows/ci.yml`). The CI also fails when
`pkexec`/`zenity`/`xdg-open` appear in the extension, when `prefs.js`
imports `St`/`Clutter`, or when the schema fails to compile — keeping the
extension within the [gjs review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).

### Contribute
Sadly, we must maintain two separate branches for before and after gnome 45 due to breaking changes. Make pull requests to the correct respective branch. Additionally, please adhere to the [review guidlines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#basics) as much as possible.

### TODOs
- [x] Rewrite extension to utilize tailscale api instead of running `tailscale` commands.
- [ ] Upstream the LocalAPI rewrite to maxgallup/tailscale-status.
- [ ] Exit-node suggestion (LocalAPI `suggest-exit-node` endpoint is wired in the client; UI pending).
