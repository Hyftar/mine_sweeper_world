defmodule MineSweeperWorldWeb.GameSetupLiveTest do
  use MineSweeperWorldWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  test "requires an authenticated user", %{conn: conn} do
    assert {:error, {:redirect, %{to: path}}} = live(conn, ~p"/")
    assert path =~ "sign-in"
  end

  describe "when signed in" do
    setup :register_and_log_in_user

    test "lists the difficulty presets", %{conn: conn} do
      {:ok, view, html} = live(conn, ~p"/")

      assert html =~ "New game"
      assert has_element?(view, "#start-button")

      for key <- ~w(easy medium hard) do
        assert has_element?(view, "input[name='difficulty'][value='#{key}']")
      end
    end

    test "starting a game navigates to the playthrough", %{conn: conn} do
      {:ok, view, _html} = live(conn, ~p"/")

      assert {:error, {:live_redirect, %{to: to}}} =
               view
               |> form("#difficulty-form", difficulty: "easy")
               |> render_submit()

      assert to =~ ~r"^/games/"
    end
  end
end
