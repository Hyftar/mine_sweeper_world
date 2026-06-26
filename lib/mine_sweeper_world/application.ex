defmodule MineSweeperWorld.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      MineSweeperWorldWeb.Telemetry,
      MineSweeperWorld.Repo,
      {DNSCluster,
       query: Application.get_env(:mine_sweeper_world, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: MineSweeperWorld.PubSub},
      # Start a worker by calling: MineSweeperWorld.Worker.start_link(arg)
      # {MineSweeperWorld.Worker, arg},
      # Start to serve requests, typically the last entry
      MineSweeperWorldWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :mine_sweeper_world]}
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: MineSweeperWorld.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    MineSweeperWorldWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
