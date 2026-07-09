defmodule MineSweeperWorldWeb.GameLive do
  @moduledoc """
  A single Minesweeper playthrough on the spherical board.

  The server owns all game state; it ships per-index cell states (plus the
  current phase) to the `SphereBoard` JS hook, which reconstructs the geometry
  client-side and renders it. Clicks come back as `"reveal"`/`"flag"` events.

  The flow: the board opens in the *picking* phase with the pentagons flashing;
  the first reveal must be a pentagon, which seeds the mines. From there the
  player reveals tiles until they hit a mine (lose), flag exactly the mines
  (win), or the countdown runs out (lose). Every move is persisted, so a
  reload resumes the game where it left off.
  """
  use MineSweeperWorldWeb, :live_view

  alias MineSweeperWorld.Games
  alias MineSweeperWorld.Games.Engine

  @tick_ms 1000

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    case load_game(id, socket.assigns.current_user) do
      {:ok, game} ->
        if connected?(socket), do: schedule_tick(game)

        socket
        |> assign_game(game)
        |> wrap(:ok)

      :error ->
        socket
        |> put_flash(:error, "That game could not be found.")
        |> push_navigate(to: ~p"/")
        |> wrap(:ok)
    end
  end

  @impl true
  def handle_event("reveal", %{"index" => index}, socket) do
    apply_move(socket, &Engine.reveal(&1, to_index(index)))
  end

  def handle_event("flag", %{"index" => index}, socket) do
    apply_move(socket, &Engine.flag(&1, to_index(index)))
  end

  def handle_event("play_again", _params, socket) do
    game = socket.assigns.game
    attrs = Map.take(game, [:subdivisions, :mine_count, :time_limit_seconds])

    case Engine.create_game(attrs, socket.assigns.current_user) do
      {:ok, new_game} -> socket |> push_navigate(to: ~p"/games/#{new_game.id}") |> wrap(:noreply)
      _ -> socket |> put_flash(:error, "Could not start a new game.") |> wrap(:noreply)
    end
  end

  @impl true
  def handle_info(:tick, socket) do
    game = socket.assigns.game

    cond do
      game.state != :playing ->
        wrap(socket, :noreply)

      time_left(game) <= 0 ->
        {:ok, game} = Engine.time_up(game)

        socket
        |> put_flash(:error, "Time's up! The world got the better of you.")
        |> assign_game(game)
        |> wrap(:noreply)

      true ->
        schedule_tick(game)

        socket
        |> assign(:time_left, time_left(game))
        |> wrap(:noreply)
    end
  end

  # Runs a move, then either refreshes the board or surfaces why it was rejected.
  defp apply_move(socket, fun) do
    previous = socket.assigns.game

    case fun.(previous) do
      {:ok, game} ->
        socket
        |> flash_outcome(previous, game)
        |> assign_game(game)
        |> wrap(:noreply)

      {:error, :must_start_on_pentagon} ->
        socket
        |> put_flash(:error, "Start on a flashing pentagon - they're always mine-free.")
        |> wrap(:noreply)

      {:error, _reason} ->
        wrap(socket, :noreply)
    end
  end

  defp flash_outcome(socket, %{state: :playing}, %{state: :won}),
    do: put_flash(socket, :info, "Cleared! Every mine flagged 🎉")

  defp flash_outcome(socket, %{state: :playing}, %{state: :lost}),
    do: put_flash(socket, :error, "Boom - you have hit a mine. 💥")

  defp flash_outcome(socket, _previous, _game), do: socket

  # Reload cells, push the board snapshot to the hook, and refresh the HUD.
  defp assign_game(socket, game) do
    snapshot = Engine.snapshot(game)
    flagged = Enum.count(snapshot.states, &(&1 == "flagged"))

    socket
    |> assign(:game, game)
    |> assign(:phase, snapshot.phase)
    |> assign(:cell_count, length(snapshot.states))
    |> assign(:flags_left, game.mine_count - flagged)
    |> assign(:time_left, time_left(game))
    |> push_event("board_update", snapshot)
  end

  defp load_game(id, user) do
    case Games.get_game(id, load: [:users], authorize?: false) do
      {:ok, %{} = game} ->
        if Enum.any?(game.users, &(&1.id == user.id)), do: {:ok, game}, else: :error

      _ ->
        :error
    end
  end

  defp to_index(index) when is_integer(index), do: index
  defp to_index(index) when is_binary(index), do: String.to_integer(index)

  defp schedule_tick(%{time_limit_seconds: nil}), do: :ok
  defp schedule_tick(_game), do: Process.send_after(self(), :tick, @tick_ms)

  defp time_left(%{time_limit_seconds: nil}), do: nil

  defp time_left(%{state: :playing, time_limit_seconds: limit, started_at: started}) do
    max(limit - DateTime.diff(DateTime.utc_now(), started, :second), 0)
  end

  defp time_left(_game), do: nil

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={%{user: @current_user}}>
      <div class="mx-auto max-w-3xl">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold">MineSweeperWorld</h1>
          <div class="flex items-center gap-4 text-sm tabular-nums">
            <span class="flex items-center gap-1" title="Mines left to flag">
              <.icon name="hero-flag-mini" class="size-4" /> {@flags_left}
            </span>
            <span :if={@game.time_limit_seconds} class="flex items-center gap-1" title="Time left">
              <.icon name="hero-clock-mini" class="size-4" /> {format_clock(@time_left)}
            </span>
          </div>
        </div>

        <p class="mt-1 text-sm opacity-70">{status_line(assigns)}</p>

        <div class="relative mt-4">
          <div
            id="sphere-board"
            phx-hook="SphereBoard"
            phx-update="ignore"
            class="aspect-square w-full touch-none rounded-2xl border border-base-content/10 bg-base-200"
          >
            <canvas class="h-full w-full"></canvas>
          </div>

          <div
            :if={@game.state in [:won, :lost, :abandoned]}
            id="game-over"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-base-100/80 backdrop-blur-sm"
          >
            <div class="text-center">
              <p class="text-3xl font-bold">{outcome_title(@game.state)}</p>
              <p class="mt-1 text-sm opacity-70">{outcome_subtitle(@game.state)}</p>
            </div>
            <div class="flex gap-3">
              <button id="play-again" phx-click="play_again" class="btn btn-primary">
                Play again
              </button>
              <.link navigate={~p"/"} class="btn btn-ghost">Change difficulty</.link>
            </div>
          </div>
        </div>
      </div>
    </Layouts.app>
    """
  end

  defp status_line(%{game: %{state: :playing}, phase: :picking}),
    do: "Tap a flashing pentagon to begin - pentagons are always mine-free."

  defp status_line(%{game: %{state: :playing}}),
    do: "Left-click a tile to reveal it. Right-click to flag a mine."

  defp status_line(_assigns), do: "Game over."

  defp outcome_title(:won), do: "You won! 🎉"
  defp outcome_title(:lost), do: "Boom! 💥"
  defp outcome_title(_), do: "Game over"

  defp outcome_subtitle(:won), do: "Every mine flagged, none missed."
  defp outcome_subtitle(:lost), do: "You uncovered a mine - or ran out of time."
  defp outcome_subtitle(_), do: ""

  defp format_clock(nil), do: "--:--"

  defp format_clock(seconds) do
    :io_lib.format("~b:~2..0b", [div(seconds, 60), rem(seconds, 60)]) |> to_string()
  end
end
