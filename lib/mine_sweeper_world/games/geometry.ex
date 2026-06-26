defmodule MineSweeperWorld.Games.Geometry do
  @moduledoc """
  Deterministic generator for the spherical board — the single source of truth
  for cell positions and adjacency.

  The board is a Goldberg polyhedron, built by subdividing an icosahedron
  `subdivisions` times (a geodesic sphere) and treating the resulting vertices
  as the *cell centres*. The twelve original icosahedron vertices become
  pentagons (five neighbours); every other vertex is a hexagon (six neighbours).

  Because the entire layout is a pure function of `subdivisions`, no geometry is
  stored in the database: a `Cell` keeps only its stable `index`, and both the
  server and the renderer reconstruct positions/adjacency from this module.

  For a subdivision frequency `n` there are `10*n^2 + 2` cells.
  """

  @phi (1 + :math.sqrt(5)) / 2

  # The 12 icosahedron vertices (unnormalised); cyclic permutations of
  # (0, ±1, ±phi). Interpolation uses these raw coordinates so that points shared
  # along an edge by two faces compute identically and deduplicate cleanly.
  @icosa_vertices [
    {-1, @phi, 0},
    {1, @phi, 0},
    {-1, -@phi, 0},
    {1, -@phi, 0},
    {0, -1, @phi},
    {0, 1, @phi},
    {0, -1, -@phi},
    {0, 1, -@phi},
    {@phi, 0, -1},
    {@phi, 0, 1},
    {-@phi, 0, -1},
    {-@phi, 0, 1}
  ]

  # The 20 triangular faces, as indices into @icosa_vertices.
  @icosa_faces [
    {0, 11, 5},
    {0, 5, 1},
    {0, 1, 7},
    {0, 7, 10},
    {0, 10, 11},
    {1, 5, 9},
    {5, 11, 4},
    {11, 10, 2},
    {10, 7, 6},
    {7, 1, 8},
    {3, 9, 4},
    {3, 4, 2},
    {3, 2, 6},
    {3, 6, 8},
    {3, 8, 9},
    {4, 9, 5},
    {2, 4, 11},
    {6, 2, 10},
    {8, 6, 7},
    {9, 8, 1}
  ]

  @neighbour_deltas [{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, -1}, {-1, 1}]

  @doc "Number of cells on a board with the given subdivision frequency."
  @spec cell_count(pos_integer()) :: pos_integer()
  def cell_count(n) when is_integer(n) and n >= 1, do: 10 * n * n + 2

  @doc """
  Returns the cells in index order, each as
  `%{index: i, kind: :hexagon | :pentagon, position: {x, y, z}}` where the
  position is a unit vector on the sphere.
  """
  @spec cells(pos_integer()) :: [
          %{index: non_neg_integer(), kind: atom(), position: {float(), float(), float()}}
        ]
  def cells(n) do
    %{positions: positions, kinds: kinds} = build(n)

    Enum.map(positions, fn {index, position} ->
      %{index: index, kind: Map.fetch!(kinds, index), position: position}
    end)
  end

  @doc """
  Returns the undirected adjacency edges as a list of `{a, b}` index pairs
  with `a < b`.
  """
  @spec edges(pos_integer()) :: [{non_neg_integer(), non_neg_integer()}]
  def edges(n) do
    n |> build() |> Map.fetch!(:edges) |> MapSet.to_list()
  end

  # Builds the whole board once: a map of positions (ordered list of
  # {index, {x, y, z}}), kinds (index => atom), and edges (MapSet of {a, b}).
  defp build(n) when is_integer(n) and n >= 1 do
    init = %{keys: %{}, positions: [], kinds: %{}, count: 0, edges: MapSet.new()}

    acc =
      Enum.reduce(@icosa_faces, init, fn face, acc ->
        {acc, local} = register_face_points(face, n, acc)
        add_face_edges(acc, local)
      end)

    %{positions: Enum.reverse(acc.positions), kinds: acc.kinds, edges: acc.edges}
  end

  # Registers every lattice point of one face, deduplicating shared
  # corners/edges, and returns the updated accumulator plus a local map of
  # `{i, j} => global_index` used to wire up edges.
  defp register_face_points({ia, ib, ic}, n, acc) do
    a = Enum.at(@icosa_vertices, ia)
    b = Enum.at(@icosa_vertices, ib)
    c = Enum.at(@icosa_vertices, ic)

    for i <- 0..n, j <- 0..(n - i), reduce: {acc, %{}} do
      {acc, local} ->
        position = a |> bary(b, c, n, i, j) |> normalize()
        key = quantize(position)
        corner? = (i == 0 and j == 0) or (i == n and j == 0) or (i == 0 and j == n)

        {acc, index} =
          case Map.fetch(acc.keys, key) do
            {:ok, index} ->
              {acc, index}

            :error ->
              index = acc.count

              acc = %{
                acc
                | keys: Map.put(acc.keys, key, index),
                  positions: [{index, position} | acc.positions],
                  kinds: Map.put(acc.kinds, index, if(corner?, do: :pentagon, else: :hexagon)),
                  count: acc.count + 1
              }

              {acc, index}
          end

        {acc, Map.put(local, {i, j}, index)}
    end
  end

  defp add_face_edges(acc, local) do
    edges =
      Enum.reduce(local, acc.edges, fn {{i, j}, index}, edges ->
        Enum.reduce(@neighbour_deltas, edges, fn {di, dj}, edges ->
          case Map.fetch(local, {i + di, j + dj}) do
            {:ok, neighbor} -> MapSet.put(edges, edge_key(index, neighbor))
            :error -> edges
          end
        end)
      end)

    %{acc | edges: edges}
  end

  # Barycentric interpolation: weights (n-i-j, i, j) over corners (a, b, c).
  defp bary({ax, ay, az}, {bx, by, bz}, {cx, cy, cz}, n, i, j) do
    wa = (n - i - j) / n
    wb = i / n
    wc = j / n
    {wa * ax + wb * bx + wc * cx, wa * ay + wb * by + wc * cy, wa * az + wb * bz + wc * cz}
  end

  defp normalize({x, y, z}) do
    len = :math.sqrt(x * x + y * y + z * z)
    {x / len, y / len, z / len}
  end

  # Quantise a unit-sphere point to an integer key so that the "same" point
  # generated from adjacent faces deduplicates despite float rounding.
  defp quantize({x, y, z}) do
    {round(x * 1_000_000), round(y * 1_000_000), round(z * 1_000_000)}
  end

  defp edge_key(a, b) when a < b, do: {a, b}
  defp edge_key(a, b), do: {b, a}
end
