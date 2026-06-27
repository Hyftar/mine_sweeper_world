// Owns the Three.js scene for the sphere board: camera, renderer, controls, the
// render loop, and (re)building the board meshes. DOM event wiring lives in the
// Phoenix hook; this class is pure rendering.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { activeScheme } from "./theme.js";
import { buildBoardGeometry } from "./board_geometry.js";
import { buildGoldbergGeometry } from "./goldberg.js";
import { BoardView } from "./board_view.js";

export class SphereRenderer {
  constructor(canvas) {
    // Geometry is constructed client-side from the subdivision count; the
    // server only sends per-index cell states. Cells and goldberg geometry are
    // cached and reused across state-only and theme changes.
    this.subdivisions = null;
    this.cells = [];
    this.goldberg = null;
    this.meshes = [];
    this.view = new BoardView();
    this.running = false;
    this.raf = null;

    this.initScene(canvas);
  }

  initScene(canvas) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 2.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true, // keep the element's bg-base-200 visible behind the sphere
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.rotateSpeed = 0.6;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.2;
  }

  // Receives `{ subdivisions, states }`. Geometry is (re)generated only when the
  // subdivision count changes; otherwise just the per-index states are updated.
  setBoard({ subdivisions, states }) {
    if (subdivisions !== this.subdivisions || this.cells.length === 0) {
      this.subdivisions = subdivisions;
      const { cells, edges } = buildBoardGeometry(subdivisions);
      this.cells = cells;
      this.goldberg = buildGoldbergGeometry(cells, edges);
    }

    this.applyStates(states);
    this.rebuild();
  }

  applyStates(states) {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].state = (states && states[i]) || "hidden";
    }
  }

  // Applies a sparse `[{ index, state }]` update: mutates only those cells, then
  // recolours them and rebuilds the glyph layer in place — no full geometry pass.
  updateCells(updates) {
    if (this.cells.length === 0 || !this.goldberg) return;

    const indices = [];
    for (const { index, state } of updates) {
      if (index >= 0 && index < this.cells.length) {
        this.cells[index].state = state;
        indices.push(index);
      }
    }
    if (indices.length === 0) return;

    const { add, remove } = this.view.update(this.cells, indices, this.goldberg, activeScheme());
    remove.forEach((mesh) => this.scene.remove(mesh));
    add.forEach((mesh) => this.scene.add(mesh));
    this.meshes = this.view.objects;
  }

  // Full rebuild from cached geometry and the current theme. Safe to call before
  // any board has arrived.
  rebuild() {
    this.meshes.forEach((mesh) => this.scene.remove(mesh));
    this.meshes = [];

    if (this.cells.length === 0 || !this.goldberg) return;

    this.meshes = this.view.build(this.cells, this.goldberg, activeScheme());
    this.meshes.forEach((mesh) => this.scene.add(mesh));
  }

  resize(width, height) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.meshes.forEach((mesh) => this.scene.remove(mesh));
    this.meshes = [];
    this.view.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
