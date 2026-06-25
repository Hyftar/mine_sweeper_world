defmodule MineSweeperWorldWeb.PageController do
  use MineSweeperWorldWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
