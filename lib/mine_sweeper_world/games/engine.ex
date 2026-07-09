defmodule MineSweeperWorld.Games.Engine do
  @moduledoc """
  The Minesweeper game loop, stitched on top of the `Games` resources.

  Everything the player does flows through here:

    * `create_game/2` builds a `Game` and its (mine-less) `Cell`s and moves it
      into `:playing`. The board opens in the *picking* phase - mines are not
      placed yet and the client flashes the pentagons.
    * `reveal/2` handles a left-click. The very first reveal must land on a
      pentagon; that pick seeds the mines (never under a pentagon, never under
      the pick itself), then flood-fills open space. Later reveals uncover a
      cell, flood-fill on a zero count, or end the game on a mine.
    * `flag/2` toggles a flag; the game is *won* the moment the flagged cells
      are exactly the mines.
    * `time_up/1` loses a game whose timer has elapsed.

  Neighbour topology is derived on demand from `Geometry`, so no adjacency rows
  are persisted. Every mutation is written to the database, so a game can be
  reloaded and resumed at any point.
  """
  require Ash.Query

  alias MineSweeperWorld.Games
  alias MineSweeperWorld.Games.{Cell, Geometry}

  @doc """
  Creates a game for `actor` with the given difficulty attributes
  (`:subdivisions`, `:mine_count`, optional `:time_limit_seconds`), generates
  its board, and starts it. Returns `{:ok, game}`.
  """
  def create_game(attrs, actor) do
    attrs = Map.put_new_lazy(attrs, :seed, fn -> :rand.uniform(1_000_000_000) end)

    # The engine is trusted server-side code and enforces its own access rules
    # (membership is checked in the LiveView). We disable Ash authorization here
    # so enrolling the actor into the game's `:users` relationship doesn't trip
    # the `User` resource's policies.
    with {:ok, game} <- Games.create_game(attrs, actor: actor, authorize?: false) do
      generate_cells(game)
      Games.start_game(game, actor: actor, authorize?: false)
    end
  end

  defp generate_cells(game) do
    count = Geometry.cell_count(game.subdivisions)

    cells =
      for index <- 0..(count - 1) do
        %{index: index, kind: Geometry.tile_kind(index), game_id: game.id}
      end

    Ash.bulk_create!(cells, Cell, :create, return_records?: false)
  end

  @doc """
  Reveals the cell at `index` (a left-click).

  Returns `{:ok, game}` with the (possibly transitioned) game, or `{:error,
  reason}` when the move is not allowed - `:not_playing`,
  `:must_start_on_pentagon`, or `:unknown_cell`.
  """
  def reveal(game, index) do
    cells = load_cells(game)
    cell = cells[index]

    cond do
      game.state != :playing -> {:error, :not_playing}
      is_nil(cell) -> {:error, :unknown_cell}
      cell.state != :hidden -> {:ok, game}
      not mines_placed?(cells) -> first_reveal(game, cells, index)
      cell.mine? -> reveal_mine(game, cell)
      true -> flood_reveal(game, cells, index)
    end
  end

  # First click of the game: only a pentagon is a legal opening move, since
  # pentagons never hide a mine. The pick seeds the board, then opens up.
  defp first_reveal(game, cells, index) do
    if Geometry.pentagon?(index) do
      cells = place_mines(game, cells, index)
      flood_reveal(game, cells, index)
    else
      {:error, :must_start_on_pentagon}
    end
  end

  defp reveal_mine(game, cell) do
    Games.reveal_cell!(cell)
    Games.lose_game(game)
  end

  # Randomly (but deterministically, from the game seed) scatter mines over the
  # hexagons, avoiding the opening pick, then stamp each cell's neighbour count.
  defp place_mines(game, cells, start_index) do
    n = game.subdivisions

    # Cells touching a pentagon (indices 0..11). Pentagons never hide a mine and
    # neither do their neighbours, so the opening pick always uncovers a small
    # mine-free pocket around the flashed pentagon.
    near_pentagon =
      Enum.flat_map(0..11, fn pentagon_index ->
        Geometry.neighbours(n, pentagon_index)
      end)
      |> Enum.into(MapSet.new())

    candidates =
      cells
      |> Map.keys()
      |> Enum.reject(fn index ->
        Geometry.pentagon?(index) or MapSet.member?(near_pentagon, index)
      end)

    :rand.seed(:exsss, {game.seed, game.seed + 1, game.seed + 2})

    mines =
      candidates
      |> Enum.shuffle()
      |> Enum.take(game.mine_count)
      |> MapSet.new()

    persist_mines(cells, mines)
    persist_counts(cells, n, mines)

    # Rebuild the in-memory board so the flood-fill that follows sees the mines
    # and counts we just wrote.
    Map.new(cells, fn {index, cell} ->
      count = Enum.count(Geometry.neighbours(n, index), &MapSet.member?(mines, &1))
      {index, %{cell | mine?: MapSet.member?(mines, index), adjacent_mine_count: count}}
    end)
  end

  defp persist_mines(cells, mines) do
    mine_cells = for index <- mines, do: cells[index]

    Ash.bulk_update!(mine_cells, :place, %{mine?: true},
      strategy: :stream,
      return_records?: false
    )
  end

  defp persist_counts(cells, n, mines) do
    cells
    |> Enum.reject(fn {index, _} -> MapSet.member?(mines, index) end)
    |> Enum.map(fn {index, cell} ->
      {index, cell, Enum.count(Geometry.neighbours(n, index), &MapSet.member?(mines, &1))}
    end)
    |> Enum.reject(fn {_, _, count} -> count == 0 end)
    |> Enum.group_by(fn {_, _, count} -> count end, fn {_, cell, _} -> cell end)
    |> Enum.each(fn {count, group} ->
      Ash.bulk_update!(group, :place, %{adjacent_mine_count: count},
        strategy: :stream,
        return_records?: false
      )
    end)
  end

  # Reveal the clicked cell and, when it has no adjacent mines, cascade outward
  # over the connected zero-count region (classic Minesweeper flood fill).
  defp flood_reveal(game, cells, index) do
    collect(game.subdivisions, cells, index)
    |> Enum.map(&cells[&1])
    |> Ash.bulk_update!(:reveal, %{}, strategy: :stream, return_records?: false)

    {:ok, game}
  end

  defp collect(n, cells, start) do
    frontier = if zero?(cells[start]), do: [start], else: []
    bfs(frontier, MapSet.new([start]), n, cells)
  end

  defp bfs([], seen, _n, _cells), do: seen

  defp bfs([index | rest], seen, n, cells) do
    {seen, added} =
      n
      |> Geometry.neighbours(index)
      |> Enum.reduce({seen, []}, fn nb, {seen, added} ->
        cell = cells[nb]

        cond do
          MapSet.member?(seen, nb) -> {seen, added}
          is_nil(cell) or cell.state != :hidden or cell.mine? -> {seen, added}
          zero?(cell) -> {MapSet.put(seen, nb), [nb | added]}
          true -> {MapSet.put(seen, nb), added}
        end
      end)

    bfs(added ++ rest, seen, n, cells)
  end

  defp zero?(cell), do: cell.adjacent_mine_count == 0

  @doc """
  Toggles a flag on the cell at `index` (a right-click / long-press).

  Flagging every mine (and nothing else) wins the game. Returns `{:ok, game}`.
  """
  def flag(game, index) do
    cells = load_cells(game)
    cell = cells[index]

    cond do
      game.state != :playing -> {:error, :not_playing}
      is_nil(cell) -> {:error, :unknown_cell}
      cell.state == :hidden -> flag_and_check(game, cells, cell)
      cell.state == :flagged -> unflag(game, cell)
      true -> {:ok, game}
    end
  end

  defp flag_and_check(game, cells, cell) do
    Games.flag_cell!(cell)
    cells = Map.put(cells, cell.index, %{cell | state: :flagged})

    if won?(cells), do: Games.win_game(game), else: {:ok, game}
  end

  defp unflag(game, cell) do
    Games.unflag_cell!(cell)
    {:ok, game}
  end

  # A win is when the flagged cells are exactly the mines: every mine flagged
  # and no mistaken flags. Mines only exist once the board is seeded.
  defp won?(cells) do
    mines_placed?(cells) and
      MapSet.equal?(indices(cells, &(&1.state == :flagged)), indices(cells, & &1.mine?))
  end

  @doc "Loses `game` because its time limit elapsed. Returns `{:ok, game}`."
  def time_up(%{state: :playing} = game), do: Games.lose_game(game)
  def time_up(game), do: {:ok, game}

  @doc """
  A snapshot for the client: `%{subdivisions, phase, states}` where `states` is
  a per-index list of cell-state strings the renderer understands.

    * `phase` is `:picking` before the first reveal (client flashes pentagons),
      `:playing` mid-game, or `:over` once the game has ended.
  """
  def snapshot(game) do
    cells = load_cells(game)
    seeded? = mines_placed?(cells)

    phase =
      cond do
        game.state != :playing -> :over
        seeded? -> :playing
        true -> :picking
      end

    reveal_all? = game.state in [:lost]

    states =
      0..(map_size(cells) - 1)
      |> Enum.map(&state_string(cells[&1], reveal_all?))

    %{subdivisions: game.subdivisions, phase: phase, states: states}
  end

  @number ~w(open one two three four five six seven eight)

  defp state_string(%{state: :revealed, mine?: true}, _), do: "mine"
  defp state_string(%{mine?: true} = cell, true) when cell.state != :flagged, do: "mine"
  defp state_string(%{state: :revealed} = cell, _), do: Enum.at(@number, cell.adjacent_mine_count)
  defp state_string(%{state: :flagged}, _), do: "flagged"
  defp state_string(_cell, _), do: "hidden"

  defp load_cells(game) do
    Cell
    |> Ash.Query.filter(game_id == ^game.id)
    |> Ash.read!()
    |> Map.new(&{&1.index, &1})
  end

  defp mines_placed?(cells), do: Enum.any?(cells, fn {_i, cell} -> cell.mine? end)

  defp indices(cells, pred) do
    for {index, cell} <- cells, pred.(cell), into: MapSet.new(), do: index
  end
end
