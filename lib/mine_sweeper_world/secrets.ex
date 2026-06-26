defmodule MineSweeperWorld.Secrets do
  use AshAuthentication.Secret

  def secret_for(
        [:authentication, :tokens, :signing_secret],
        MineSweeperWorld.Accounts.User,
        _opts,
        _context
      ) do
    Application.fetch_env(:mine_sweeper_world, :token_signing_secret)
  end
end
