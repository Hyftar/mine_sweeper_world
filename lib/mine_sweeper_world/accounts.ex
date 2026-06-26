defmodule MineSweeperWorld.Accounts do
  use Ash.Domain,
    otp_app: :mine_sweeper_world

  resources do
    resource MineSweeperWorld.Accounts.Token
    resource MineSweeperWorld.Accounts.User
  end
end
