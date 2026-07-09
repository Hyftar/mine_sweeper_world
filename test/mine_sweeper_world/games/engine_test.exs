defmodule MineSweeperWorld.Games.EngineTest do
  use MineSweeperWorld.DataCase, async: true

  require Ash.Query

  alias MineSweeperWorld.Games.{Cell, Engine, Geometry}

  # A hexagon index for subdivisions 3 (pentagons are 0..11).
  @hexagon 20

  # subdivisions 2 is too small once mines must also avoid pentagon-adjacent
  # cells (every hexagon on that board touches a pentagon), so tests run on 3.
  defp new_game(attrs \\ %{}) do
    attrs = Map.merge(%{subdivisions: 3, mine_count: 6, seed: 12_345}, attrs)
    {:ok, game} = Engine.create_game(attrs, nil)
    game
  end

  defp cells(game) do
    Cell
    |> Ash.Query.filter(game_id == ^game.id)
    |> Ash.read!()
  end

  defp mines(game), do: Enum.filter(cells(game), & &1.mine?)

  test "create_game builds a full, hidden, mine-free board and starts playing" do
    game = new_game()
    board = cells(game)

    assert length(board) == Geometry.cell_count(3)
    assert Enum.all?(board, &(&1.state == :hidden))
    refute Enum.any?(board, & &1.mine?)
    assert game.state == :playing
  end

  test "the first reveal must land on a pentagon" do
    game = new_game()

    assert {:error, :must_start_on_pentagon} = Engine.reveal(game, @hexagon)
    refute Enum.any?(cells(game), & &1.mine?)
  end

  test "opening a pentagon seeds mines away from pentagons and the pick, then reveals it" do
    game = new_game()

    assert {:ok, _game} = Engine.reveal(game, 0)

    seeded = mines(game)
    assert length(seeded) == 6
    refute Enum.any?(seeded, &Geometry.pentagon?(&1.index))
    refute Enum.any?(seeded, &(&1.index == 0))

    # No mine sits next to a pentagon either.
    near_pentagon =
      for p <- 0..11, nb <- Geometry.neighbours(game.subdivisions, p), into: MapSet.new(), do: nb

    refute Enum.any?(seeded, &MapSet.member?(near_pentagon, &1.index))

    assert Enum.find(cells(game), &(&1.index == 0)).state == :revealed
  end

  test "mine placement is deterministic for a given seed" do
    a = new_game(%{seed: 999})
    b = new_game(%{seed: 999})
    {:ok, _} = Engine.reveal(a, 0)
    {:ok, _} = Engine.reveal(b, 0)

    mine_set = fn game -> game |> mines() |> MapSet.new(& &1.index) end
    assert MapSet.equal?(mine_set.(a), mine_set.(b))
  end

  test "revealing a mine loses the game" do
    game = new_game()
    {:ok, game} = Engine.reveal(game, 0)

    mine = hd(mines(game))
    assert {:ok, game} = Engine.reveal(game, mine.index)
    assert game.state == :lost
  end

  test "flagging exactly the mines wins the game" do
    game = new_game()
    {:ok, game} = Engine.reveal(game, 0)

    game =
      game
      |> mines()
      |> Enum.reduce(game, fn mine, game ->
        {:ok, game} = Engine.flag(game, mine.index)
        game
      end)

    assert game.state == :won
  end

  test "flagging a non-mine does not win, and unflagging reverts" do
    game = new_game()
    {:ok, game} = Engine.reveal(game, 0)

    safe = Enum.find(cells(game), &(not &1.mine? and &1.state == :hidden))

    {:ok, game} = Engine.flag(game, safe.index)
    assert game.state == :playing
    assert Enum.find(cells(game), &(&1.index == safe.index)).state == :flagged

    {:ok, _game} = Engine.flag(game, safe.index)
    assert Enum.find(cells(game), &(&1.index == safe.index)).state == :hidden
  end

  test "time_up loses a playing game and is a no-op once finished" do
    game = new_game(%{time_limit_seconds: 60})
    {:ok, game} = Engine.time_up(game)
    assert game.state == :lost

    assert {:ok, %{state: :lost}} = Engine.time_up(game)
  end

  test "snapshot reports the phase and per-cell states" do
    game = new_game()
    picking = Engine.snapshot(game)

    assert picking.phase == :picking
    assert length(picking.states) == Geometry.cell_count(3)
    assert Enum.all?(picking.states, &(&1 == "hidden"))

    {:ok, game} = Engine.reveal(game, 0)
    playing = Engine.snapshot(game)
    assert playing.phase == :playing
    assert Enum.any?(playing.states, &(&1 != "hidden"))
  end
end
