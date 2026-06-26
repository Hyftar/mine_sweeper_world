defmodule MineSweeperWorldWeb.GameLiveTest do
  use MineSweeperWorldWeb.ConnCase, async: true

  import Phoenix.LiveViewTest

  test "renders the spherical board preview", %{conn: conn} do
    {:ok, view, html} = live(conn, ~p"/play")

    assert html =~ "board preview"
    assert has_element?(view, "#sphere-board[phx-hook='SphereBoard']")
    # Default subdivisions = 3 -> 10 * 3^2 + 2 = 92 cells.
    assert render(view) =~ "92 cells"
  end

  test "changing resolution rederives the board", %{conn: conn} do
    {:ok, view, _html} = live(conn, ~p"/play")

    # Subdivisions 1 -> the bare icosahedron, 12 cells.
    html = view |> element("form") |> render_change(%{"subdivisions" => "1"})
    assert html =~ "12 cells"
  end
end
