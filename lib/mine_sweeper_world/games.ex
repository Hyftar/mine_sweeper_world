defmodule MineSweeperWorld.Games do
  @moduledoc """
  The Games domain holds everything to do with playing MineSweeperWorld: a
  `Game` (one playthrough), the `Cell`s that make up its spherical board, and
  the `Adjacency` edges describing which cells border one another.
  """
  use Ash.Domain, otp_app: :mine_sweeper_world

  resources do
    resource MineSweeperWorld.Games.Game do
      define :create_game, action: :create
      define :get_game, action: :read, get_by: [:id]
      define :list_games, action: :read
      define :start_game, action: :start
      define :win_game, action: :win
      define :lose_game, action: :lose
      define :abandon_game, action: :abandon
    end

    resource MineSweeperWorld.Games.Cell do
      define :create_cell, action: :create
      define :place_cell, action: :place
      define :reveal_cell, action: :reveal
      define :flag_cell, action: :flag
      define :unflag_cell, action: :unflag
    end

    resource MineSweeperWorld.Games.Adjacency do
      define :create_adjacency, action: :create
    end

    resource MineSweeperWorld.Games.Membership do
      define :join_game, action: :create
      define :leave_game, action: :destroy
    end
  end
end
