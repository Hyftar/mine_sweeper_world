// Phoenix LiveView hook for the MineSweeperWorld board. Receives derived
// geometry (unit-sphere cell centres + adjacency edges) from the server via the
// "board" event and hands it to the Three.js renderer. This hook wires DOM
// lifecycle/events and translates pointer input into cell picks, which it pushes
// back to the LiveView as "reveal"/"flag" events; all rendering lives in
// `../sphere/sphere_renderer`.
import { SphereRenderer } from "../sphere/sphere_renderer.js";

// Pointer travel (px) below which a press counts as a click rather than a drag,
// and press duration (ms) above which a left press counts as a flag (long-press).
const DRAG_SLOP = 6;

export default {
  mounted() {
    const canvas = this.el.querySelector("canvas");
    this.renderer = new SphereRenderer(canvas);

    this.handleEvent("board_update", (board) => this.renderer.setBoard(board));
    // Sparse per-index state updates: `{ updates: [{ index, state }, ...] }`.
    this.handleEvent("cells_update", ({ updates }) => this.renderer.updateCells(updates));

    this.initPointer(canvas);

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

  // Turn pointer gestures into cell actions. A short, stationary tap reveals; a
  // right-click or a long-press flags. Drags fall through to OrbitControls.
  initPointer(canvas) {
    let down = null;

    this.onContextMenu = (e) => e.preventDefault();

    this.onPointerDown = (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
    };

    this.onPointerUp = (e) => {
      if (!down) return;

      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved <= DRAG_SLOP) {
        if (down.button === 2) this.flagAt(e.clientX, e.clientY);
        else if (down.button === 0) this.revealAt(e.clientX, e.clientY);
      }
      down = null;
    };

    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    // Listen on window so a release outside the canvas still cancels cleanly.
    window.addEventListener("pointerup", this.onPointerUp);
    this.pointerCanvas = canvas;
  },

  revealAt(x, y) {
    const index = this.renderer.pickCell(x, y);
    if (index != null) this.pushEvent("reveal", { index });
  },

  flagAt(x, y) {
    const index = this.renderer.pickCell(x, y);
    if (index != null) this.pushEvent("flag", { index });
  },

  destroyed() {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointerup", this.onPointerUp);
    if (this.pointerCanvas) {
      this.pointerCanvas.removeEventListener("contextmenu", this.onContextMenu);
      this.pointerCanvas.removeEventListener("pointerdown", this.onPointerDown);
    }
    this.themeObserver.disconnect();
    this.themeMedia.removeEventListener("change", this.onThemeChange);
    this.renderer.dispose();
  },
};
