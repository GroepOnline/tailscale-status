
# Run this in a terminal window to see the logs from the extensions and if on X11
# hit F2 and type "r" to restart gnome-shell to apply any changes.
debug:
	journalctl -f -o cat /usr/bin/gnome-shell

# Development in wayland is a bit nicer, this opens a separate gnome session
test-wayland:
	env GNOME_SHELL_SLOWDOWN_FACTOR=2 MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 dbus-run-session -- gnome-shell --nested --wayland

# Unit tests against the mock LocalAPI (merge-blocking in CI).
# TMPDIR points at the home dir: /tmp is quota-hot on some dev machines.
test:
	TMPDIR=$$HOME/tmp gjs -m tests/run.js

# Lint the extension + tests with eslint.
lint:
	npx --no-install eslint tailscale-status@maxgallup.github.com tests

# Guard: the rewrite must stay subprocess-free.
check-no-subprocess:
	@! grep -rnE 'pkexec|zenity|xdg-open' tailscale-status@maxgallup.github.com | grep -vE ':[0-9]+:\s*(//|\*|/\*)' || \
	( echo "FAIL: pkexec/zenity/xdg-open found in the extension"; exit 1 )

# gjs.guide: the prefs process must not import St/Clutter.
check-prefs-imports:
	@! grep -nE "from 'gi://(St|Clutter)'" tailscale-status@maxgallup.github.com/prefs.js || \
	( echo "FAIL: prefs.js must not import St/Clutter"; exit 1 )

check: lint check-no-subprocess check-prefs-imports test

# Compile the GSettings schema in place (required before installing/testing).
schemas:
	glib-compile-schemas tailscale-status@maxgallup.github.com/schemas/

# Use this command to temporary install the extension. Note, it might be easier to rename
# it since I've experienced some kind of caching or automated upgrading which would update
# the extension to the latest version.
link: schemas
	ln -s $$PWD/tailscale-status@maxgallup.github.com $$HOME/.local/share/gnome-shell/extensions/tailscale-status@maxgallup.github.com

# Resulting zip used to submit to gnome extensions
zip: schemas
	cd tailscale-status@maxgallup.github.com && zip -r ../tailscale-status@maxgallup.github.com.zip *

clean:
	rm -f tailscale-status@maxgallup.github.com.zip
