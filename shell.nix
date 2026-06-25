{
  pkgs,
  mixEnv,
  beamPackages,
  elixir
}: let
  # define packages to install
  basePackages = with pkgs; [
    git
    elixir
    beamPackages.hex
    beamPackages.expert
    rebar3
    mix2nix
    postgresql_16
    esbuild
    tailwindcss
    nodejs_24
    doppler
    sentry-cli
  ];

  # Add basePackages + optional system packages per system
  inputs =
   with pkgs;
    basePackages
    ++ lib.optionals stdenv.isLinux [inotify-tools];
    # Apple SDK frameworks (CoreFoundation, CoreServices, ...) are now provided
    # automatically by the Darwin stdenv, so no darwin-specific inputs are needed.

  # define shell startup command
  hooks = ''
    # this allows mix to work on the local directory
    mkdir -p .nix-mix .nix-hex
    export MIX_HOME=$PWD/.nix-mix
    export HEX_HOME=$PWD/.nix-mix
    export PATH=$MIX_HOME/bin:$HEX_HOME/bin:$PATH

    export MIX_ENV=${mixEnv}

    export LANG=en_US.UTF-8
    # keep your shell history in iex
    export ERL_AFLAGS="-kernel shell_history enabled"

    # phoenix related env vars
    export POOL_SIZE=15
    export PORT=4000
    export MIX_ENV=${mixEnv}
  '';
in
  pkgs.mkShell {
    buildInputs = inputs;
    shellHook = hooks;
  }
