defmodule MineSweeperWorld.Repo do
  use Ecto.Repo,
    otp_app: :mine_sweeper_world,
    adapter: Ecto.Adapters.Postgres
end
