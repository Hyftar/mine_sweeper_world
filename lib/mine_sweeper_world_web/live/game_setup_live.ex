defmodule MineSweeperWorldWeb.GameSetupLive do
  @moduledoc """
  Difficulty selection - the entry point of the game loop.

  The player picks a difficulty and presses Start; we create and start a game
  (generating its board) and navigate to the playthrough at `/games/:id`.
  """
  use MineSweeperWorldWeb, :live_view

  alias MineSweeperWorld.Games.{Difficulty, Engine}

  @impl true
  def mount(_params, _session, socket) do
    socket
    |> assign(:presets, Difficulty.all())
    |> assign(:selected, "medium")
    |> wrap(:ok)
  end

  @impl true
  def handle_event("select", %{"difficulty" => key}, socket) do
    socket
    |> assign(:selected, key)
    |> wrap(:noreply)
  end

  def handle_event("start", %{"difficulty" => key}, socket) do
    with {:ok, preset} <- Difficulty.fetch(key),
         {:ok, game} <- Difficulty.attrs(preset) |> Engine.create_game(socket.assigns.current_user) do
      socket
      |> push_navigate(to: ~p"/games/#{game.id}")
      |> wrap(:noreply)
    else
      _ ->
        socket
        |> put_flash(:error, "Could not start that game. Please try again.")
        |> wrap(:noreply)
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash} current_scope={%{user: @current_user}}>
      <div class="mx-auto max-w-2xl">
        <h1 class="text-2xl font-semibold">New game</h1>
        <p class="mt-1 text-sm opacity-70">
          Choose a difficulty. Bigger worlds hide more mines and give you more time.
        </p>

        <form id="difficulty-form" phx-submit="start" class="mt-6">
          <fieldset class="grid gap-3 sm:grid-cols-3">
            <label
              :for={preset <- @presets}
              class={[
                "cursor-pointer rounded-2xl border p-4 transition",
                if(@selected == preset.key,
                  do: "border-primary bg-primary/5 ring-2 ring-primary/40",
                  else: "border-base-content/10 hover:border-base-content/30"
                )
              ]}
            >
              <input
                type="radio"
                name="difficulty"
                value={preset.key}
                checked={@selected == preset.key}
                phx-click="select"
                phx-value-difficulty={preset.key}
                class="sr-only"
              />
              <div class="text-lg font-semibold">{preset.label}</div>
              <dl class="mt-2 space-y-1 text-sm opacity-70">
                <div class="flex justify-between">
                  <dt>Tiles</dt>
                  <dd class="tabular-nums">{preset.cell_count}</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Mines</dt>
                  <dd class="tabular-nums">{preset.mine_count}</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Time</dt>
                  <dd class="tabular-nums">{format_time(preset.time_limit_seconds)}</dd>
                </div>
              </dl>
            </label>
          </fieldset>

          <button
            id="start-button"
            type="submit"
            class="btn btn-primary mt-6 w-full sm:w-auto"
          >
            Start
          </button>
        </form>
      </div>
    </Layouts.app>
    """
  end

  defp format_time(seconds) do
    minutes = div(seconds, 60)
    rem_seconds = rem(seconds, 60)
    :io_lib.format("~b:~2..0b", [minutes, rem_seconds]) |> to_string()
  end
end
