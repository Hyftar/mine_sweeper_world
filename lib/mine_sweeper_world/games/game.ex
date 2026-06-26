defmodule MineSweeperWorld.Games.Game do
  @moduledoc """
  A single playthrough of MineSweeperWorld.

  Instead of a flat 2D grid, the board is a hexagonal grid wrapped around a
  sphere (a Goldberg polyhedron). `subdivisions` controls the resolution of
  that sphere and therefore how many `Cell`s the board has.

  The game lifecycle is managed by AshStateMachine:

      setup --> start --> playing --> win --> won
        |                 |  |─ lose --> lost
        |                 v
        |------------> abandon --> abandoned
  """
  use Ash.Resource,
    otp_app: :mine_sweeper_world,
    domain: MineSweeperWorld.Games,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshStateMachine]

  postgres do
    table "games"
    repo MineSweeperWorld.Repo
  end

  state_machine do
    initial_states [:setup]
    default_initial_state :setup

    transitions do
      transition :start, from: :setup, to: :playing
      transition :win, from: :playing, to: :won
      transition :lose, from: :playing, to: :lost
      transition :abandon, from: [:setup, :playing], to: :abandoned
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:subdivisions, :mine_count, :seed]

      # Enroll the creating user as the game's first player. `relate_actor`
      # only supports to-one relationships, so we append the actor to the
      # many-to-many `:users` relationship ourselves.
      change fn changeset, %{actor: actor} ->
        case actor do
          nil -> changeset
          user -> Ash.Changeset.manage_relationship(changeset, :users, [user], type: :append)
        end
      end
    end

    update :start do
      change transition_state(:playing)
    end

    update :win do
      change transition_state(:won)
    end

    update :lose do
      change transition_state(:lost)
    end

    update :abandon do
      change transition_state(:abandoned)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :subdivisions, :integer do
      description "Goldberg polyhedron subdivision frequency; higher means a finer board."
      allow_nil? false
      default 4
      public? true
      constraints min: 1
    end

    attribute :mine_count, :integer do
      allow_nil? false
      public? true
      constraints min: 1
    end

    attribute :seed, :integer do
      description "Seed for deterministic board/mine generation."
      allow_nil? false
      public? true
    end

    attribute :started_at, :utc_datetime_usec, public?: true, allow_nil?: true
    attribute :finished_at, :utc_datetime_usec, public?: true, allow_nil?: true

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    # Games are multiplayer: many players can share a single game, and each
    # player can be in many games, joined through MineSweeperWorld.Games.Membership.
    many_to_many :users, MineSweeperWorld.Accounts.User do
      through MineSweeperWorld.Games.Membership
      source_attribute_on_join_resource :game_id
      destination_attribute_on_join_resource :user_id
    end

    has_many :memberships, MineSweeperWorld.Games.Membership

    has_many :cells, MineSweeperWorld.Games.Cell
  end
end
