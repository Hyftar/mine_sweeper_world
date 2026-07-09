defmodule MineSweeperWorld.Games.Difficulty do
  @moduledoc """
  The selectable difficulty presets that seed a new `Game`.

  Each preset fixes the board resolution (`subdivisions`), how many mines to
  hide, and the countdown (`time_limit_seconds`). The keys are stable strings so
  the setup form and tests can refer to them directly.
  """
  alias MineSweeperWorld.Games.Geometry

  @presets [
    %{key: "easy", label: "Easy", subdivisions: 4, mine_count: 25, time_limit_seconds: 240},
    %{key: "medium", label: "Medium", subdivisions: 6, mine_count: 50, time_limit_seconds: 300},
    %{key: "hard", label: "Hard", subdivisions: 8, mine_count: 150, time_limit_seconds: 360}
  ]

  @by_key Map.new(@presets, &{&1.key, &1})

  def all, do: Enum.map(@presets, &Map.put(&1, :cell_count, Geometry.cell_count(&1.subdivisions)))

  def fetch(key), do: Map.fetch(@by_key, key)

  def attrs(preset), do: Map.take(preset, [:subdivisions, :mine_count, :time_limit_seconds])
end
