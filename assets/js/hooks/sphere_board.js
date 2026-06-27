// Phoenix LiveView hook for the MineSweeperWorld board. Receives derived
// geometry (unit-sphere cell centres + adjacency edges) from the server via the
// "board" event and hands it to the Three.js renderer. This hook only wires DOM
// lifecycle/events; all rendering lives in `../sphere/sphere_renderer`.
import { SphereRenderer } from "../sphere/sphere_renderer.js";

export default {
  mounted() {
    const canvas = this.el.querySelector("canvas");
    this.renderer = new SphereRenderer(canvas);

    this.handleEvent("board_update", (board) => this.renderer.setBoard(board));
    // Sparse per-index state updates: `{ updates: [{ index, state }, ...] }`.
    this.handleEvent("cells_update", ({ updates }) => this.renderer.updateCells(updates));

    this.onResize = () => {
      const rect = this.el.getBoundingClientRect();
      this.renderer.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", this.onResize);
    this.onResize();

    // Recolour (without recomputing geometry) when the daisyUI theme changes.
    this.onThemeChange = () => this.renderer.rebuild();
    this.themeObserver = new MutationObserver(this.onThemeChange);
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    this.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    this.themeMedia.addEventListener("change", this.onThemeChange);

    this.renderer.start();
  },

  destroyed() {
    window.removeEventListener("resize", this.onResize);
    this.themeObserver.disconnect();
    this.themeMedia.removeEventListener("change", this.onThemeChange);
    this.renderer.dispose();
  },
};
