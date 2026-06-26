# Development image for MineSweeperWorld.
#
# Built for live-reload development: the source is bind-mounted by
# docker-compose and `mix phx.server` recompiles + reloads on change. The
# toolchain matches the project's nix flake (Erlang/OTP 29, Elixir 1.20).
#
# hexpm does not publish an elixir image for 1.20 yet, so we base on the
# verified hexpm/erlang image and lay the matching precompiled Elixir on top.
ARG ERLANG_IMAGE=hexpm/erlang:29.0.2-debian-bookworm-20260623-slim
FROM ${ERLANG_IMAGE}

ARG ELIXIR_VERSION=1.20.0
# OTP major the precompiled Elixir archive targets (matches the base image).
ARG ELIXIR_OTP=29

# System deps:
#   - inotify-tools: required by phoenix_live_reload to watch files on Linux
#   - git, build-essential: compiling hex deps with native code
#   - curl, unzip, ca-certificates: fetching the Elixir archive
#   - postgresql-client: pg_isready / psql for convenience
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
     inotify-tools git build-essential curl unzip ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Install the exact Elixir version, precompiled for this OTP release.
RUN curl -fsSL -o /tmp/elixir.zip \
      "https://github.com/elixir-lang/elixir/releases/download/v${ELIXIR_VERSION}/elixir-otp-${ELIXIR_OTP}.zip" \
  && unzip -q /tmp/elixir.zip -d /usr/local/elixir \
  && rm /tmp/elixir.zip
ENV PATH="/usr/local/elixir/bin:${PATH}"

# Hex + rebar, baked into the image so startup doesn't need to fetch them.
ENV MIX_HOME=/root/.mix
RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=dev \
    LANG=C.UTF-8

WORKDIR /app

# Fetch deps on container start (the source, including mix.exs/lock, is
# bind-mounted), then run whatever command compose passes (default: server).
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["mix", "phx.server"]
