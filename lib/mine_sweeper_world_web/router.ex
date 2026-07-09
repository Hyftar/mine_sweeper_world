defmodule MineSweeperWorldWeb.Router do
  use MineSweeperWorldWeb, :router

  use AshAuthentication.Phoenix.Router

  import AshAuthentication.Plug.Helpers

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {MineSweeperWorldWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :load_from_session
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :load_from_bearer
    plug :set_actor, :user
  end

  scope "/", MineSweeperWorldWeb do
    pipe_through :browser

    ash_authentication_live_session :authenticated_routes,
      on_mount: [{MineSweeperWorldWeb.LiveUserAuth, :live_user_required}] do
      # Difficulty selection and a single playthrough. Both require a signed-in
      # user; games are owned by the player who creates them.
      live "/", GameSetupLive
      live "/games/:id", GameLive
    end
  end

  scope "/", MineSweeperWorldWeb do
    pipe_through :browser

    auth_routes AuthController, MineSweeperWorld.Accounts.User, path: "/auth"
    sign_out_route AuthController

    # Remove these if you'd like to use your own authentication views
    sign_in_route register_path: "/register",
                  reset_path: "/reset",
                  auth_routes_prefix: "/auth",
                  on_mount: [{MineSweeperWorldWeb.LiveUserAuth, :live_no_user}],
                  overrides: [
                    MineSweeperWorldWeb.AuthOverrides,
                    Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
                  ]

    # Remove this if you do not want to use the reset password feature
    reset_route auth_routes_prefix: "/auth",
                overrides: [
                  MineSweeperWorldWeb.AuthOverrides,
                  Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
                ]

    # Remove this if you do not use the confirmation strategy
    confirm_route MineSweeperWorld.Accounts.User, :confirm_new_user,
      auth_routes_prefix: "/auth",
      overrides: [
        MineSweeperWorldWeb.AuthOverrides,
        Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
      ]
  end

  # Other scopes may use custom stacks.
  # scope "/api", MineSweeperWorldWeb do
  #   pipe_through :api
  # end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:mine_sweeper_world, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: MineSweeperWorldWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
