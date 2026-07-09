defmodule MineSweeperWorldWeb.GameLiveTest do
  use MineSweeperWorldWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  require Ash.Query

  alias MineSweeperWorld.Games.{Cell, Engine}

  defp create_game(user, attrs \\ %{}) do
    attrs = Map.merge(%{subdivisions: 4, mine_count: 6, seed: 12_345}, attrs)
    {:ok, game} = Engine.create_game(attrs, user)
    game
  end

  defp mines(game) do
    Cell
    |> Ash.Query.filter(game_id == ^game.id and mine? == true)
    |> Ash.read!()
  end

  test "requires an authenticated user", %{conn: conn} do
    user = MineSweeperWorld.DataCase.create_user()
    game = create_game(user)

    assert {:error, {:redirect, %{to: path}}} = live(conn, ~p"/games/#{game.id}")
    assert path =~ "sign-in"
  end

  describe "when signed in" do
    setup :register_and_log_in_user

    test "renders the board in the picking phase", %{conn: conn, user: user} do
      game = create_game(user)
      {:ok, view, html} = live(conn, ~p"/games/#{game.id}")

      assert has_element?(view, "#sphere-board[phx-hook='SphereBoard']")
      assert html =~ "flashing pentagon"
    end

    test "the first reveal starts play", %{conn: conn, user: user} do
      game = create_game(user)
      {:ok, view, _html} = live(conn, ~p"/games/#{game.id}")

      render_hook(view, "reveal", %{"index" => 0})

      assert render(view) =~ "Right-click"
    end

    test "revealing a mine ends the game", %{conn: conn, user: user} do
      game = create_game(user)
      {:ok, view, _html} = live(conn, ~p"/games/#{game.id}")

      render_hook(view, "reveal", %{"index" => 0})
      mine = hd(mines(game))
      render_hook(view, "reveal", %{"index" => mine.index})

      assert has_element?(view, "#game-over")
      assert has_element?(view, "#play-again")
    end

    test "cannot open someone else's game", %{conn: conn} do
      stranger = MineSweeperWorld.DataCase.create_user()
      game = create_game(stranger)

      assert {:error, {:live_redirect, %{to: "/"}}} = live(conn, ~p"/games/#{game.id}")
    end
  end
end
