defmodule MineSweeperWorldWeb.RegistrationTest do
  use MineSweeperWorldWeb.ConnCase, async: true

  import Phoenix.LiveViewTest
  require Ash.Query

  test "the register page renders a registration form", %{conn: conn} do
    {:ok, _view, html} = live(conn, ~p"/register")

    assert html =~ "Register"
    assert html =~ "Email"
    assert html =~ "/auth/user/password/register"
  end

  test "the sign-in page links to registration", %{conn: conn} do
    {:ok, _view, html} = live(conn, ~p"/sign-in")

    assert html =~ ~p"/register"
  end

  test "registering creates a user", %{conn: conn} do
    email = "new-player-#{System.unique_integer([:positive])}@example.com"

    conn =
      post(conn, ~p"/auth/user/password/register", %{
        "user" => %{
          "email" => email,
          "password" => "password1234",
          "password_confirmation" => "password1234"
        }
      })

    # On success the AuthController signs the user in and redirects.
    assert redirected_to(conn) == ~p"/"

    assert {:ok, _user} =
             MineSweeperWorld.Accounts.User
             |> Ash.Query.filter(email == ^email)
             |> Ash.read_one(authorize?: false)
  end
end
