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

    // Game phase drives the pentagon "pick your start" flashing. One of
    // "picking" | "playing" | "over"; defaults to playing (the mock preview).
    this.phase = "playing";
    this.markers = [];

    // Picking: a click is turned into the nearest cell by intersecting the
    // camera ray with the unit sphere and taking the closest cell centre.
    this.raycaster = new THREE.Raycaster();
    this.unitSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

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

  // Receives `{ subdivisions, states, phase }`. Geometry is (re)generated only
  // when the subdivision count changes; otherwise just the per-index states are
  // updated. `phase` (optional) toggles the pentagon flashing.
  setBoard({ subdivisions, states, phase }) {
    if (subdivisions !== this.subdivisions || this.cells.length === 0) {
      this.subdivisions = subdivisions;
      const { cells, edges } = buildBoardGeometry(subdivisions);
      this.cells = cells;
      this.goldberg = buildGoldbergGeometry(cells, edges);
      this.buildMarkers();
    }

    if (phase !== undefined) this.phase = phase;
    this.applyStates(states);
    this.rebuild();
  }

  // Pick the cell nearest to where a screen-space click meets the sphere.
  // Returns a cell index, or null when the click misses the sphere.
  pickCell(clientX, clientY) {
    if (this.cells.length === 0) return null;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectSphere(this.unitSphere, hit)) return null;

    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const dot = hit.x * c.x + hit.y * c.y + hit.z * c.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    return best === -1 ? null : best;
  }

  // Small glowing dots over the twelve pentagons, pulsed while the player is
  // choosing a starting pentagon. Built once per geometry; hidden otherwise.
  buildMarkers() {
    this.disposeMarkers();
    const geometry = new THREE.SphereGeometry(0.045, 12, 12);
    for (let i = 0; i < 12 && i < this.cells.length; i++) {
      const c = this.cells[i];
      const material = new THREE.MeshBasicMaterial({ transparent: true });
      const marker = new THREE.Mesh(geometry.clone(), material);
      marker.position.set(c.x * 1.01, c.y * 1.01, c.z * 1.01);
      marker.visible = false;
      this.markers.push(marker);
      this.scene.add(marker);
    }
    geometry.dispose();
  }

  disposeMarkers() {
    this.markers.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this.markers = [];
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
      this.animateMarkers();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // Flash the pentagon markers while picking; keep them hidden otherwise.
  animateMarkers() {
    if (this.markers.length === 0) return;

    const picking = this.phase === "picking";
    if (!picking) {
      this.markers.forEach((m) => (m.visible = false));
      return;
    }

    const scheme = activeScheme();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    for (const m of this.markers) {
      m.visible = true;
      m.material.color.copy(scheme.flag);
      m.material.opacity = 0.35 + 0.55 * pulse;
      const s = 0.85 + 0.4 * pulse;
      m.scale.setScalar(s);
    }
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.meshes.forEach((mesh) => this.scene.remove(mesh));
    this.meshes = [];
    this.disposeMarkers();
    this.view.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
