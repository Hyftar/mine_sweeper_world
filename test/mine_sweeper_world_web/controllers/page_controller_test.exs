defmodule MineSweeperWorldWeb.PageControllerTest do
  use MineSweeperWorldWeb.ConnCase

  test "GET / redirects anonymous visitors to sign in", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert redirected_to(conn) =~ "sign-in"
  end
end
