// WebGL renderer for the MineSweeperWorld board (Three.js).
//
// Receives derived geometry (unit-sphere cell centres + adjacency edges) from
// the server via the "board" event, derives the Goldberg polyhedron wireframe,
// and renders it with Three.js + OrbitControls (drag-to-rotate, auto-spin).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const COLORS = {
  pentagon: new THREE.Color(0xf472b6),
  hexagon: new THREE.Color(0x38bdf8),
  edge: new THREE.Color(0x64748b),
};

export default {
  mounted() {
    this.canvas = this.el.querySelector("canvas");
    this.board = { cells: [], edges: [] };

    this.initScene();

    this.handleEvent("board", (board) => {
      this.board = board;
      this.buildMeshes();
    });

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();

    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  },

  destroyed() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);

    this.disposeBoardMeshes();
    if (this.pointTexture) this.pointTexture.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  },

  initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 2.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true, // keep the element's bg-base-200 visible behind the sphere
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.6;

    this.pointTexture = this.makeCircleTexture();
    this.boardMeshes = [];
  },

  resize() {
    const rect = this.el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  },

  // A soft round sprite so Points render as dots rather than squares.
  makeCircleTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.7, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  },

  disposeBoardMeshes() {
    for (const mesh of this.boardMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.boardMeshes = [];
  },

  buildMeshes() {
    this.disposeBoardMeshes();

    const cells = this.board.cells;
    if (!cells || cells.length === 0) return;

    const goldberg = this.buildGoldbergGeometry();

    if (goldberg) {
      this.boardMeshes.push(this.buildWireframe(goldberg));
    }

    this.boardMeshes.push(this.buildCellPoints(cells));

    this.boardMeshes.forEach((mesh) => this.scene.add(mesh));
  },

  // Derives the Goldberg polyhedron (corners of the hexagon/pentagon faces) from
  // the dual cell-adjacency graph the server sends.
  //
  // Each Goldberg vertex is the centroid of a triangle of three mutually adjacent
  // cells; each Goldberg edge is a cell-pair shared by exactly two such vertices.
  //
  // Triangle membership uses neighbour Sets (O(1) lookups), and edges are found by
  // bucketing vertices on their shared cell-pair keys — O(V)
  buildGoldbergGeometry() {
    const cells = this.board.cells;

    const neighbors = Array.from({ length: cells.length }, () => new Set());
    for (const [a, b] of this.board.edges) {
      neighbors[a].add(b);
      neighbors[b].add(a);
    }

    // Enumerate triangles (a < b < c) of mutually adjacent cells.
    const vertices = [];
    for (let a = 0; a < cells.length; a++) {
      for (const b of neighbors[a]) {
        if (b <= a) continue;
        for (const c of neighbors[b]) {
          if (c <= b) continue;
          if (!neighbors[a].has(c)) continue;

          const ca = cells[a];
          const cb = cells[b];
          const cc = cells[c];
          let mx = (ca.x + cb.x + cc.x) / 3;
          let my = (ca.y + cb.y + cc.y) / 3;
          let mz = (ca.z + cb.z + cc.z) / 3;
          const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
          vertices.push({ x: mx / len, y: my / len, z: mz / len, parents: [a, b, c] });
        }
      }
    }

    // Bucket vertices by each of their three cell-pairs; a pair touched by two
    // vertices is a Goldberg edge between them.
    const pairToVertex = new Map();
    const edges = [];
    const addPair = (p, q, vi) => {
      const key = p < q ? p * cells.length + q : q * cells.length + p;
      const other = pairToVertex.get(key);
      if (other === undefined) {
        pairToVertex.set(key, vi);
      } else {
        edges.push([other, vi]);
      }
    };
    for (let vi = 0; vi < vertices.length; vi++) {
      const [a, b, c] = vertices[vi].parents;
      addPair(a, b, vi);
      addPair(b, c, vi);
      addPair(a, c, vi);
    }

    return { vertices, edges };
  },

  buildWireframe({ vertices, edges }) {
    const positions = new Float32Array(edges.length * 6);
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const va = vertices[a];
      const vb = vertices[b];
      const o = i * 6;
      positions[o] = va.x;
      positions[o + 1] = va.y;
      positions[o + 2] = va.z;
      positions[o + 3] = vb.x;
      positions[o + 4] = vb.y;
      positions[o + 5] = vb.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: COLORS.edge,
      transparent: true,
      opacity: 0.5,
    });

    return new THREE.LineSegments(geometry, material);
  },

  buildCellPoints(cells) {
    const positions = new Float32Array(cells.length * 3);
    const colors = new Float32Array(cells.length * 3);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const o = i * 3;
      positions[o] = cell.x;
      positions[o + 1] = cell.y;
      positions[o + 2] = cell.z;

      const color = cell.kind === "pentagon" ? COLORS.pentagon : COLORS.hexagon;
      colors[o] = color.r;
      colors[o + 1] = color.g;
      colors[o + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      map: this.pointTexture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.5,
      sizeAttenuation: true,
    });

    return new THREE.Points(geometry, material);
  },
};
