#!/bin/sh
# desk.sh — launch the Admiralty desk.
# ELECTRON_RUN_AS_NODE leaks into this shell from the dev environment and
# turns the runtime into plain Node; strip it before launch.
cd "$(dirname "$0")"
exec env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron . "$@"
