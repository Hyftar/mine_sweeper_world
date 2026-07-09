defmodule MineSweeperWorld.Games.Cell do
  @moduledoc """
  A single cell on the spherical board.

  A hexagonal grid cannot tile a sphere on its own - closing it requires
  exactly twelve pentagons (Euler's formula) - so each cell's `kind` is either
  `:hexagon` or `:pentagon`.

  No geometry is persisted. The board layout is a pure function of the game's
  `subdivisions`, so a cell's position (and adjacency) is derived on demand
  from its stable `index` via `MineSweeperWorld.Games.Geometry`. The `Cell`
  record only stores game state.

  Which cells border one another is captured by a self-referential
  many-to-many `:neighbors` relationship through
  `MineSweeperWorld.Games.Adjacency`. The per-cell reveal/flag lifecycle is
  managed by AshStateMachine:

      hidden --> reveal --> revealed
        |--- flag --> flagged --> unflag --> hidden
  """
  use Ash.Resource,
    otp_app: :mine_sweeper_world,
    domain: MineSweeperWorld.Games,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshStateMachine]

  postgres do
    table "cells"
    repo MineSweeperWorld.Repo

    references do
      reference :game, on_delete: :delete
    end
  end

  state_machine do
    initial_states [:hidden]
    default_initial_state :hidden

    transitions do
      transition :reveal, from: :hidden, to: :revealed
      transition :flag, from: :hidden, to: :flagged
      transition :unflag, from: :flagged, to: :hidden
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:index, :kind, :mine?, :adjacent_mine_count, :game_id]
    end

    # Board setup only: stamp mines and neighbour counts onto freshly-created
    # cells. Not part of the reveal/flag lifecycle, so it is a plain update.
    update :place do
      accept [:mine?, :adjacent_mine_count]
    end

    update :reveal do
      change transition_state(:revealed)
    end

    update :flag do
      change transition_state(:flagged)
    end

    update :unflag do
      change transition_state(:hidden)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :index, :integer do
      description "Stable ordinal of this cell within its game's board."
      allow_nil? false
      public? true
      constraints min: 0
    end

    attribute :kind, :atom do
      allow_nil? false
      default :hexagon
      public? true
      constraints one_of: [:hexagon, :pentagon]
    end

    attribute :mine?, :boolean do
      allow_nil? false
      default false
      public? true
    end

    attribute :adjacent_mine_count, :integer do
      description "Number of neighboring cells that contain a mine."
      allow_nil? false
      default 0
      public? true
      constraints min: 0, max: 6
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :game, MineSweeperWorld.Games.Game do
      allow_nil? false
      attribute_writable? true
    end

    many_to_many :neighbors, MineSweeperWorld.Games.Cell do
      through MineSweeperWorld.Games.Adjacency
      source_attribute_on_join_resource :cell_id
      destination_attribute_on_join_resource :neighbor_id
    end
  end

  identities do
    identity :unique_cell_index, [:game_id, :index]
  end
end
