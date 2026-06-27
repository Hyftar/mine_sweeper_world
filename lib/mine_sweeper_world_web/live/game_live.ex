defmodule MineSweeperWorldWeb.GameLive do
  @moduledoc """
  Skeleton renderer for the spherical board.

  This is a preview, not the game yet (no database, no real mines). The server
  manages only cell *state* by index: it ships `{subdivisions, states}` to the
  `SphereBoard` JS hook, which reconstructs all geometry (positions/adjacency)
  client-side from the subdivision count. Use the slider to change resolution and
  drag to rotate.
  """
  use MineSweeperWorldWeb, :live_view

  alias MineSweeperWorld.Games.Geometry

  @default_subdivisions 3
  @min_subdivisions 1
  @max_subdivisions 18

  # Distinct states the client understands, for the scatter demo.
  @cell_states ~w(hidden open flagged mine one two three four five six seven eight)

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

  # Demonstrates partial updates: flips a handful of random cells and pushes only
  # those via the "cells" event (no full board re-send, no geometry).
  def handle_event("scatter_cells", _params, socket) do
    count = socket.assigns.cell_count

    updates =
      Enum.map(
        1..min(12, count),
        fn _ ->
          %{index: :rand.uniform(count) - 1, state: Enum.random(@cell_states)}
        end
      )

    socket
    |> push_event("cells_update", %{updates: updates})
    |> wrap(:noreply)
  end

  # Pushes the per-index cell states to the hook. No geometry is sent: the client
  # reconstructs positions/adjacency from `subdivisions` alone. Indices match
  # `Geometry`'s canonical ordering, which the JS generator mirrors.
  defp push_board(socket) do
    n = socket.assigns.subdivisions
    count = Geometry.cell_count(n)
    states = Enum.map(0..(count - 1), &mock_state/1)

    socket
    |> assign(:cell_count, count)
    |> push_event("board_update", %{subdivisions: n, states: states})
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

          <button type="button" phx-click="scatter_cells" class="btn btn-sm btn-primary">
            Scatter cells
          </button>
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
