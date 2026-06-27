// Owns the Three.js scene for the sphere board: camera, renderer, controls, the
// render loop, and (re)building the board meshes. DOM event wiring lives in the
// Phoenix hook; this class is pure rendering.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { activeScheme } from "./theme.js";
import { buildGoldbergGeometry } from "./goldberg.js";
import { BoardMeshFactory } from "./board_meshes.js";

export class SphereRenderer {
  constructor(canvas) {
    this.board = { cells: [], edges: [] };
    // Goldberg geometry only depends on the cell layout, so cache it and reuse
    // it for cheap recolours (e.g. theme changes).
    this.goldberg = null;
    this.meshes = [];
    this.factory = new BoardMeshFactory();
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
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;
  }

  setBoard(board) {
    this.board = board;
    this.goldberg = buildGoldbergGeometry(board.cells, board.edges);
    this.rebuild();
  }

  // Rebuilds the meshes from cached geometry and the current theme. Safe to call
  // before any board has arrived.
  rebuild() {
    this.disposeMeshes();

    const { cells } = this.board;
    if (!cells || cells.length === 0 || !this.goldberg) return;

    this.meshes = this.factory.build(cells, this.goldberg, activeScheme());
    this.meshes.forEach((mesh) => this.scene.add(mesh));
  }

  disposeMeshes() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes = [];
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
    this.disposeMeshes();
    this.factory.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
