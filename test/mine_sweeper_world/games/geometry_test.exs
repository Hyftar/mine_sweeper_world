defmodule MineSweeperWorld.Games.GeometryTest do
  use ExUnit.Case, async: true

  alias MineSweeperWorld.Games.Geometry

  @frequencies [1, 2, 3, 4, 5, 7, 10, 18]

  describe "cell_count/1" do
    test "matches 10n^2 + 2 and the number of distinct structured indices" do
      for n <- @frequencies do
        assert Geometry.cell_count(n) == 10 * n * n + 2

        distinct =
          for(f <- 0..19, i <- 0..n, j <- 0..(n - i), do: Geometry.index_at(n, f, i, j))
          |> MapSet.new()

        assert MapSet.size(distinct) == Geometry.cell_count(n)
        # Indices are contiguous 0..count-1.
        assert Enum.min(distinct) == 0
        assert Enum.max(distinct) == Geometry.cell_count(n) - 1
      end
    end
  end

  describe "neighbours/2 (golden test against the float generator)" do
    test "adjacency matches the oracle's geometric adjacency in position space" do
      for n <- @frequencies do
        assert structured_edges(n) == oracle_edges(n),
               "structured adjacency diverged from the float oracle at n=#{n}"
      end
    end

    test "edge count is 3N - 6 and degrees are 5 for pentagons, 6 for hexagons" do
      for n <- @frequencies do
        count = Geometry.cell_count(n)
        assert MapSet.size(structured_edges(n)) == 3 * count - 6

        for index <- 0..(count - 1) do
          degree = length(Geometry.neighbours(n, index))
          expected = if Geometry.pentagon?(index), do: 5, else: 6
          assert degree == expected, "index #{index} (n=#{n}) had degree #{degree}"
        end
      end
    end
  end

  describe "pentagon?/1 and tile_kind/1" do
    test "exactly the twelve corners are pentagons" do
      for n <- @frequencies do
        count = Geometry.cell_count(n)
        pentagons = for index <- 0..(count - 1), Geometry.pentagon?(index), do: index

        assert pentagons == Enum.to_list(0..11)
        assert Enum.all?(0..11, &(Geometry.tile_kind(&1) == :pentagon))
        assert Geometry.tile_kind(12) == :hexagon or count == 12
      end
    end
  end

  defp structured_edges(n) do
    pos_by_index =
      for f <- 0..19, i <- 0..n, j <- 0..(n - i), into: %{} do
        {Geometry.index_at(n, f, i, j), pos_key(face_point(f, n, i, j))}
      end

    count = Geometry.cell_count(n)

    for index <- 0..(count - 1),
        neighbour <- Geometry.neighbours(n, index),
        into: MapSet.new() do
      canon(Map.fetch!(pos_by_index, index), Map.fetch!(pos_by_index, neighbour))
    end
  end

  @phi (1 + :math.sqrt(5)) / 2

  @oracle_vertices {
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
  }

  @oracle_faces [
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

  @oracle_deltas [{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, -1}, {-1, 1}]

  defp oracle_edges(n) do
    Enum.reduce(@oracle_faces, MapSet.new(), fn {ia, ib, ic}, acc ->
      a = elem(@oracle_vertices, ia)
      b = elem(@oracle_vertices, ib)
      c = elem(@oracle_vertices, ic)

      local =
        for i <- 0..n, j <- 0..(n - i), into: %{} do
          {{i, j}, pos_key(normalize(bary(a, b, c, n, i, j)))}
        end

      Enum.reduce(local, acc, fn {{i, j}, key}, acc ->
        Enum.reduce(@oracle_deltas, acc, fn {di, dj}, acc ->
          case Map.fetch(local, {i + di, j + dj}) do
            {:ok, neighbour_key} -> MapSet.put(acc, canon(key, neighbour_key))
            :error -> acc
          end
        end)
      end)
    end)
  end

  defp face_point(f, n, i, j) do
    {ia, ib, ic} = Enum.at(@oracle_faces, f)
    a = elem(@oracle_vertices, ia)
    b = elem(@oracle_vertices, ib)
    c = elem(@oracle_vertices, ic)
    normalize(bary(a, b, c, n, i, j))
  end

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

  defp pos_key({x, y, z}), do: {round(x * 1_000_000), round(y * 1_000_000), round(z * 1_000_000)}

  defp canon(a, b) when a <= b, do: {a, b}
  defp canon(a, b), do: {b, a}
end
