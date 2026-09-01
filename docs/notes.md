 
# Local API 

`curl --unix-socket /run/tailscale/tailscaled.sock http://localhost/`
* "/localapi/v0/whois"
* "/localapi/v0/goroutines"  
* "/localapi/v0/profile"
* "/localapi/v0/status"
* "/localapi/v0/logout"
* "/localapi/v0/login-interactive"  
* "/localapi/v0/prefs"  
* "/localapi/v0/ping"  
* "/localapi/v0/check-prefs"  
* "/localapi/v0/check-ip-forwarding"  
* "/localapi/v0/bugreport"  
* "/localapi/v0/file-targets"  
* "/localapi/v0/set-dns"  
* "/localapi/v0/derpmap"  
* "/localapi/v0/metrics"  
* "/localapi/v0/debug"  
* "/localapi/v0/set-expiry-sooner"  
* "/localapi/v0/dial"  
* "/localapi/v0/id-token"  

# commands
``` bash
#!/bin/bash

DATA=$(curl --silent --unix-socket /run/tailscale/tailscaled.sock http://localhost/localapi/v0/status)

BACKENDSTATE=$(echo "$DATA" | jq -r .BackendState)

echo $BACKENDSTATE


```


# password-less command
`tailscale up --operator=$USER || pkexec tailscale up --operator=$USER`

## Rewrite notes (2026-09-01, LocalAPI migration)

Verified endpoint table (live tailscaled 1.102.3 + upstream source):
`.compound-engineering/artifacts/evidence/localapi-endpoint-verification-2026-09-01.md`.

Gotchas encoded in `lib/localapi.js`:
- `profiles/` and `files/` are prefix-match routes — trailing slash required, else 404.
- Prefs updates use `PATCH /localapi/v0/prefs` (merge semantics).
- Profile switch is `POST /localapi/v0/profiles/<Key>` (the Key like `profile-ce7e`, not the email).
- Taildrop send: `GET file-targets` (StableID) then `PUT file-put/<stableID>/<url-escaped name>`.
- Requests use `Connection: close`; body read to EOF, chunked + content-length both handled.
- Non-root needs `tailscale up --operator=<user>` once; 403 surfaces as an instruction, never pkexec.

Test runner quirk: `gjs -m` only spins the GLib main loop while the module is
awaiting — `tests/run.js` uses top-level await for that reason.
