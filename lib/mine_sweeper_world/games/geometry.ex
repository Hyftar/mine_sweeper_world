defmodule MineSweeperWorld.Games.Geometry do
  @moduledoc """
  Topology of the spherical board, addressed by a structured cell index.

  The board is a Goldberg polyhedron: subdivide each face of an icosahedron into
  a triangular lattice of frequency `n` and treat the resulting vertices as cell
  centres. The twelve original icosahedron vertices are pentagons; every other
  cell is a hexagon.

  Rather than numbering cells in generation order, the index *encodes where the
  cell lives*, so adjacency is pure integer arithmetic with no coordinates and no
  per-board build:

      corners (pentagons):  0 .. 11
      edge interiors:       12 + edge_id*(n-1) + (slot-1)        edge_id 0..29
      face interiors:       12 + 30*(n-1) + face*F + ordinal     face 0..19

  where `F = (n-1)(n-2)/2`. Because corners occupy `0..11`, `pentagon?/1` is just
  `index < 12`, and `neighbours/2` is O(1). The JS renderer mirrors this scheme so
  both sides share one index space; the legacy float generator survives only as
  the golden-test oracle.
  """

  # The 20 triangular faces as icosahedron-vertex triples. Only this incidence
  # matters for adjacency — the 3D coordinates never appear here.
  @faces [
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

  @faces_tuple List.to_tuple(@faces)

  # The 30 icosahedron edges as sorted {min, max} vertex pairs, in a canonical
  # order so the client and server agree on edge ids without coordinating.
  @edge_list (
               @faces
               |> Enum.flat_map(fn {a, b, c} ->
                 [{min(a, b), max(a, b)}, {min(b, c), max(b, c)}, {min(a, c), max(a, c)}]
               end)
               |> Enum.uniq()
               |> Enum.sort()
             )

  @edges_tuple List.to_tuple(@edge_list)
  @edge_id (for {pair, id} <- Enum.with_index(@edge_list), into: %{}, do: {pair, id})

  # edge id -> the two faces that share it.
  @edge_faces (for {pair, id} <- Enum.with_index(@edge_list), into: %{} do
                 faces =
                   for {{a, b, c}, fid} <- Enum.with_index(@faces),
                       pair in [{min(a, b), max(a, b)}, {min(b, c), max(b, c)}, {min(a, c), max(a, c)}],
                       do: fid

                 {id, faces}
               end)

  # vertex 0..11 -> the five faces around it.
  @vertex_faces (for v <- 0..11, into: %{} do
                   {v, for({{a, b, c}, fid} <- Enum.with_index(@faces), v in [a, b, c], do: fid)}
                 end)

  # The six triangular-lattice steps in (i, j) space.
  @dirs [{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, -1}, {-1, 1}]

  @doc "Number of cells on a board with the given subdivision frequency."
  @spec cell_count(pos_integer()) :: pos_integer()
  def cell_count(n) when is_integer(n) and n >= 1, do: 10 * n * n + 2

  @doc "Whether the cell at `index` is a pentagon (the twelve icosahedron vertices)."
  @spec pentagon?(non_neg_integer()) :: boolean()
  def pentagon?(index) when is_integer(index) and index >= 0, do: index < 12

  @doc "Tile kind at `index`: `:pentagon` for the twelve corners, else `:hexagon`."
  @spec tile_kind(non_neg_integer()) :: :pentagon | :hexagon
  def tile_kind(index), do: if(pentagon?(index), do: :pentagon, else: :hexagon)

  @doc """
  Adjacent cell indices for `index` on a board of subdivision frequency `n`.

  Every pair of adjacent cells shares a lattice edge inside some face, so each
  neighbour is an ordinary in-face step from one of the faces this cell belongs
  to. We visit those faces, take the local steps that stay in-bounds, and let
  `encode/4` canonicalise shared points — no seam transforms required.
  """
  @spec neighbours(pos_integer(), non_neg_integer()) :: [non_neg_integer()]
  def neighbours(n, index)
      when is_integer(n) and n >= 1 and is_integer(index) and index >= 0 and index < 10 * n * n + 2 do
    n
    |> incident_reps(index)
    |> Enum.flat_map(fn {f, i, j} ->
      for {di, dj} <- @dirs,
          i2 = i + di,
          j2 = j + dj,
          i2 >= 0 and j2 >= 0 and i2 + j2 <= n,
          do: encode(n, f, i2, j2)
    end)
    |> Enum.uniq()
    |> Enum.reject(&(&1 == index))
    |> Enum.sort()
  end

  @doc """
  Cell index of the lattice point `(i, j)` on face `f` (`0 <= i`, `0 <= j`,
  `i + j <= n`). Exposed mainly for tooling and the golden test.
  """
  @spec index_at(pos_integer(), 0..19, non_neg_integer(), non_neg_integer()) :: non_neg_integer()
  def index_at(n, f, i, j)
      when is_integer(n) and n >= 1 and f in 0..19 and i >= 0 and j >= 0 and i + j <= n do
    encode(n, f, i, j)
  end

  # (face, i, j) -> canonical cell index. Corners collapse to a vertex id, edge
  # points to a slot keyed by global vertex order (so both incident faces agree),
  # interior points to a per-face ordinal.
  defp encode(n, f, i, j) do
    {g0, g1, g2} = elem(@faces_tuple, f)
    w0 = n - i - j

    cond do
      w0 == n -> g0
      i == n -> g1
      j == n -> g2
      w0 == 0 -> edge_index(n, g1, g2, i, j)
      i == 0 -> edge_index(n, g0, g2, w0, j)
      j == 0 -> edge_index(n, g0, g1, w0, i)
      true -> face_index(n, f, i, j)
    end
  end

  defp edge_index(n, p, q, wp, wq) do
    {lo, hi, slot} = if p < q, do: {p, q, wq}, else: {q, p, wp}
    12 + Map.fetch!(@edge_id, {lo, hi}) * (n - 1) + (slot - 1)
  end

  defp face_index(n, f, i, j) do
    per = div((n - 1) * (n - 2), 2)
    offset = (i - 1) * (n - 1) - div((i - 1) * i, 2)
    12 + 30 * (n - 1) + f * per + offset + (j - 1)
  end

  # One (face, i, j) representation per face incident to the cell: 1 for an
  # interior cell, 2 for an edge cell, 5 for a corner.
  defp incident_reps(n, index) do
    edge_total = 30 * (n - 1)

    cond do
      index < 12 ->
        for f <- Map.fetch!(@vertex_faces, index), do: corner_ij(n, f, index)

      index < 12 + edge_total ->
        rel = index - 12
        eid = div(rel, n - 1)
        slot = rem(rel, n - 1) + 1
        {lo, hi} = elem(@edges_tuple, eid)
        for f <- Map.fetch!(@edge_faces, eid), do: edge_ij(n, f, lo, hi, slot)

      true ->
        per = div((n - 1) * (n - 2), 2)
        rel = index - 12 - edge_total
        {i, j} = interior_ij(n, rem(rel, per))
        [{div(rel, per), i, j}]
    end
  end

  defp corner_ij(n, f, v) do
    {g0, g1, _g2} = elem(@faces_tuple, f)

    cond do
      v == g0 -> {f, 0, 0}
      v == g1 -> {f, n, 0}
      true -> {f, 0, n}
    end
  end

  defp edge_ij(n, f, lo, hi, slot) do
    {_g0, g1, g2} = elem(@faces_tuple, f)
    {f, edge_weight(g1, lo, hi, slot, n), edge_weight(g2, lo, hi, slot, n)}
  end

  defp edge_weight(v, lo, hi, slot, n) do
    cond do
      v == hi -> slot
      v == lo -> n - slot
      true -> 0
    end
  end

  # Inverse of the interior ordinal: row i has (n-1-i) interior points.
  defp interior_ij(n, p) do
    Enum.reduce_while(1..(n - 2), p, fn i, rem_p ->
      row = n - 1 - i
      if rem_p < row, do: {:halt, {i, rem_p + 1}}, else: {:cont, rem_p - row}
    end)
  end
end
