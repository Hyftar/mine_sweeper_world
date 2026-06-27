defmodule MineSweeperWorld.Games.Geometry do
  @moduledoc """
  Deterministic generator for the spherical board — the single source of truth
  for cell positions and adjacency.

  The board is a Goldberg polyhedron, built by subdividing an icosahedron
  `subdivisions` times (a geodesic sphere) and treating the resulting vertices
  as the *cell centres*. The twelve original icosahedron vertices become
  pentagons (five neighbours); every other vertex is a hexagon (six neighbours).
  """

  @doc "Number of cells on a board with the given subdivision frequency."
  def cell_count(n) when is_integer(n) and n >= 1, do: 10 * n * n + 2
end
