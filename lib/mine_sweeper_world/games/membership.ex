defmodule MineSweeperWorld.Games.Membership do
  @moduledoc """
  Join resource linking players (`MineSweeperWorld.Accounts.User`) to the
  `Game`s they take part in. Because games are multiplayer, a user can belong
  to many games and a game can have many users; this resource is the
  many-to-many bridge between them.
  """
  use Ash.Resource,
    otp_app: :mine_sweeper_world,
    domain: MineSweeperWorld.Games,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "game_memberships"
    repo MineSweeperWorld.Repo

    references do
      reference :game, on_delete: :delete
      reference :user, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:game_id, :user_id]
    end
  end

  attributes do
    uuid_primary_key :id
    create_timestamp :joined_at
  end

  relationships do
    belongs_to :game, MineSweeperWorld.Games.Game do
      allow_nil? false
      attribute_writable? true
    end

    belongs_to :user, MineSweeperWorld.Accounts.User do
      allow_nil? false
      attribute_writable? true
    end
  end

  identities do
    identity :unique_membership, [:game_id, :user_id]
  end
end
