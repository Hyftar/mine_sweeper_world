defmodule MineSweeperWorld.Games.Adjacency do
  @moduledoc """
  Join resource describing which `Cell`s border one another on the sphere.

  Edges are stored directionally (`cell` -> `neighbor`); board generation
  inserts both directions so the `Cell.neighbors` relationship reads
  symmetrically. By definition, hexagons have six neighbors and the pentagons have
  five.
  """
  use Ash.Resource,
    otp_app: :mine_sweeper_world,
    domain: MineSweeperWorld.Games,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "cell_adjacencies"
    repo MineSweeperWorld.Repo

    references do
      reference :cell, on_delete: :delete
      reference :neighbor, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:cell_id, :neighbor_id]
    end
  end

  attributes do
    uuid_primary_key :id
  end

  relationships do
    belongs_to :cell, MineSweeperWorld.Games.Cell do
      allow_nil? false
      attribute_writable? true
    end

    belongs_to :neighbor, MineSweeperWorld.Games.Cell do
      allow_nil? false
      attribute_writable? true
    end
  end

  identities do
    identity :unique_edge, [:cell_id, :neighbor_id]
  end
end
