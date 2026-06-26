#!/usr/bin/env bash
# Prepares the app each time the dev container starts, then hands off to the
# given command (default: mix phx.server). deps/_build live on named volumes,
# so this is fast after the first run.
set -euo pipefail

echo "==> Fetching dependencies"
mix deps.get

echo "==> Setting up Ash resources / database (idempotent)"
mix ash.setup

echo "==> Starting: $*"
exec "$@"
