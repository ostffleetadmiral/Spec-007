#!/bin/sh
# space-serve.sh — launch the local Space Agent runtime that spaces.os
# iframes. Space Agent is a donor checkout (MIT, Jan Tomasek), not a
# vendored subtree: this wrapper only knows where it lives and how the
# desk expects it bound — loopback, single-user, the port the organ
# probes. Honest failure when the clone or node is absent.
set -eu

SPC_DIR="${SPACE_AGENT_DIR:-$HOME/Music/Paul/space-agent}"
SPC_PORT="${SPACE_AGENT_PORT:-3000}"
SPC_HOST="${SPACE_AGENT_HOST:-127.0.0.1}"

[ -f "$SPC_DIR/space" ] || {
    echo "space-serve: no space-agent checkout at $SPC_DIR" >&2
    echo "  set SPACE_AGENT_DIR to the clone path (MIT donor, Jan Tomasek)" >&2
    exit 1
}
command -v node >/dev/null 2>&1 || {
    echo "space-serve: node >= 20 required (space-agent engines)" >&2
    exit 1
}

echo "space-serve: $SPC_DIR on http://$SPC_HOST:$SPC_PORT (single-user)"
echo "space-serve: desk organ spaces.os probes this address — Ctrl-C to stop"
exec node "$SPC_DIR/space" serve \
    "HOST=$SPC_HOST" "PORT=$SPC_PORT" "SINGLE_USER_APP=true"
