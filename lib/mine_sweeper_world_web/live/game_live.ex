defmodule MineSweeperWorldWeb.GameLive do
  @moduledoc """
  Skeleton renderer for the spherical board.

  This is a preview, not the game yet: it builds a board purely from
  `MineSweeperWorld.Games.Geometry` (no database, no mines) and ships the
  derived cell positions and adjacency to the `SphereBoard` JS hook, which
  draws them on a `<canvas>`. Use the slider to change resolution and drag to
  rotate.
  """
  use MineSweeperWorldWeb, :live_view

  alias MineSweeperWorld.Games.Geometry

  @default_subdivisions 3
  @min_subdivisions 1
  @max_subdivisions 18

  @impl true
  def mount(_params, _session, socket) do
    socket
    |> assign(min_subdivisions: @min_subdivisions)
    |> assign(max_subdivisions: @max_subdivisions)
    |> assign(subdivisions: @default_subdivisions)
    |> push_board()
    |> wrap(:ok)
  end

  @impl true
  def handle_event("set_subdivisions", %{"subdivisions" => value}, socket) do
    subdivisions =
      value
      |> String.to_integer()
      |> max(@min_subdivisions)
      |> min(@max_subdivisions)

    socket
    |> assign(subdivisions: subdivisions)
    |> push_board()
    |> wrap(:noreply)
  end

  # Derives the board geometry and pushes it to the hook. Positions/adjacency
  # come straight from `Geometry`, the same generator the rest of the app uses.
  defp push_board(socket) do
    n = socket.assigns.subdivisions

    cells =
      Geometry.cells(n)
      |> Enum.map(
        fn %{index: index, kind: kind, position: {x, y, z}} ->
          %{index: index, kind: kind, x: x, y: y, z: z, state: mock_state(index)}
        end
      )

    board = %{
      subdivisions: n,
      cells: cells,
      edges:
        Geometry.edges(n)
        |> Enum.map(&Tuple.to_list/1)
    }

    socket
    |> assign(:cell_count, length(cells))
    |> push_event("board", board)
  end

  # Mock cell states until the real game logic exists. Deterministic per index
  # (stable across re-renders) and weighted toward hidden/open, with a sprinkle
  # of every other state so the client colour scheme is fully exercised.
  @mock_states ~w(hidden hidden hidden hidden open open open flagged mine one two three four five six seven eight)a

  defp mock_state(index) do
    Enum.at(@mock_states, :erlang.phash2(index, length(@mock_states)))
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto max-w-3xl">
        <h1 class="text-2xl font-semibold">MineSweeperWorld — board preview</h1>
        <p class="mt-1 text-sm opacity-70">
          {@cell_count} cells (subdivisions {@subdivisions}). Tile colours show mock cell state; drag to rotate.
        </p>

        <form phx-change="set_subdivisions" class="mt-4 flex items-center gap-3">
          <label for="subdivisions" class="text-sm">Resolution</label>
          <input
            type="range"
            id="subdivisions"
            name="subdivisions"
            min={@min_subdivisions}
            max={@max_subdivisions}
            value={@subdivisions}
            class="w-64"
          />
          <span class="text-sm tabular-nums">{@subdivisions}</span>
        </form>

        <div
          id="sphere-board"
          phx-hook="SphereBoard"
          phx-update="ignore"
          class="mt-4 aspect-square w-full touch-none rounded-2xl border border-base-content/10 bg-base-200"
        >
          <canvas class="h-full w-full"></canvas>
        </div>
      </div>
    </Layouts.app>
    """
  end
end
