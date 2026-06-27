// WebGL renderer for the MineSweeperWorld board (Three.js).
//
// Receives derived geometry (unit-sphere cell centres + adjacency edges) from
// the server via the "board" event, derives the Goldberg polyhedron wireframe,
// and renders it with Three.js + OrbitControls (drag-to-rotate, auto-spin).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const COLORS = {
  dark: {
    hiddenFill: new THREE.Color(0x1a2740),
    revealedFill: new THREE.Color(0x0d1424),
    border: new THREE.Color(0x2b3d60),
    flag: new THREE.Color(0xffc53d),
    mine: new THREE.Color(0xff4d6d),
    one: new THREE.Color(0x4da6ff),
    two: new THREE.Color(0x4dff88),
    three: new THREE.Color(0xff5c7c),
    four: new THREE.Color(0xb388ff),
    five: new THREE.Color(0xffb84d),
    six: new THREE.Color(0x26dde0),
    seven: new THREE.Color(0xff8ac4),
    eight: new THREE.Color(0x9fb3d1),
  },
  light: {
    hiddenFill: new THREE.Color(0xd4e6e8),
    revealedFill: new THREE.Color(0xf5fafb),
    border: new THREE.Color(0xb8d4d6),
    flag: new THREE.Color(0xea8c00),
    mine: new THREE.Color(0xff4d6d),
    one: new THREE.Color(0x1565c0),
    two: new THREE.Color(0x2e7d32),
    three: new THREE.Color(0xd32f4a),
    four: new THREE.Color(0x6a3db8),
    five: new THREE.Color(0xc77700),
    six: new THREE.Color(0x0e9ca8),
    seven: new THREE.Color(0xb83280),
    eight: new THREE.Color(0x546e7a),
  },
};

// State -> overlay glyph. States with no entry render as a plain coloured tile.
const DIGIT_STATES = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

// Glyphs packed into the texture atlas, in row-major order.
const ATLAS_GLYPHS = ["flag", "mine", "1", "2", "3", "4", "5", "6", "7", "8"];
const ATLAS_COLS = 5;
const ATLAS_ROWS = 2;
const ATLAS_CELL = 256; // px per glyph cell
const ATLAS_GLYPH_SCALE = 0.55; // How large the glyph is drawn within its tile

export default {
  mounted() {
    this.canvas = this.el.querySelector("canvas");
    this.board = { cells: [], edges: [] };

    this.initScene();

    this.handleEvent("board", (board) => {
      this.board = board;
      // Goldberg geometry only depends on the cell layout, so cache it and reuse
      // it for cheap recolours (e.g. theme changes).
      this.goldberg = this.buildGoldbergGeometry();
      this.buildMeshes();
    });

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();

    // Recolour (without recomputing geometry) when the daisyUI theme changes.
    this.onThemeChange = () => this.goldberg && this.buildMeshes();
    this.themeObserver = new MutationObserver(this.onThemeChange);
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    this.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    this.themeMedia.addEventListener("change", this.onThemeChange);

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
    this.themeObserver.disconnect();
    this.themeMedia.removeEventListener("change", this.onThemeChange);

    this.disposeBoardMeshes();
    if (this.glyphAtlas) this.glyphAtlas.dispose();
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

    this.boardMeshes = [];
    // Lazily built atlas of white glyph masks (tinted per-face via vertex color).
    this.glyphAtlas = null;
  },

  resize() {
    const rect = this.el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
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
    if (!cells || cells.length === 0 || !this.goldberg) return;

    const scheme = this.activeScheme();

    this.boardMeshes.push(this.buildFaces(cells, this.goldberg, scheme));
    this.boardMeshes.push(this.buildBorders(this.goldberg, scheme));

    const glyphs = this.buildGlyphs(cells, this.goldberg, scheme);
    if (glyphs) this.boardMeshes.push(glyphs);

    this.boardMeshes.forEach((mesh) => this.scene.add(mesh));
  },

  // Resolves the active palette from the daisyUI `data-theme` attribute, falling
  // back to the OS preference when the theme is "system" (attribute absent).
  activeScheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    const dark = attr === "dark" || (attr !== "light" && this.themeMedia.matches);

    return dark ? COLORS.dark : COLORS.light;
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

  // Filled hexagon/pentagon faces. Each cell is one face whose corners are the
  // Goldberg vertices that share the cell as a parent; corners are sorted around
  // the cell normal and triangulated as a fan. The fill colour comes from the
  // cell state: hidden/flagged use `hiddenFill`, everything else `revealedFill`.
  buildFaces(cells, { vertices }, scheme) {
    const cellCorners = Array.from({ length: cells.length }, () => []);
    for (let vi = 0; vi < vertices.length; vi++) {
      for (const c of vertices[vi].parents) cellCorners[c].push(vi);
    }

    const positions = [];
    const colors = [];
    for (let ci = 0; ci < cells.length; ci++) {
      const corners = cellCorners[ci];
      if (corners.length < 3) continue;

      const fill = this.faceFill(cells[ci].state, scheme);
      const { ordered } = this.faceFrame(cells[ci], corners, vertices);

      // Triangle fan from the first corner.
      const v0 = ordered[0];
      for (let k = 1; k < ordered.length - 1; k++) {
        const va = ordered[k];
        const vb = ordered[k + 1];
        positions.push(v0.x, v0.y, v0.z, va.x, va.y, va.z, vb.x, vb.y, vb.z);

        for (let t = 0; t < 3; t++) {
          colors.push(fill.r, fill.g, fill.b);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      // Push fills slightly back so the border lines sit cleanly on top.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    return new THREE.Mesh(geometry, material);
  },

  // Base fill for a cell: only "hidden" and "flagged" read as covered tiles;
  // open/mine/numbered cells share the revealed background.
  faceFill(state, scheme) {
    return state === "hidden" || state === "flagged" ? scheme.hiddenFill : scheme.revealedFill;
  },

  // Builds a tangent frame for a face and returns its corners sorted into a
  // simple (convex) polygon, each annotated with 2D tangent coords, plus the
  // circumradius. The frame's "up" axis points toward the world north pole
  // (projected onto the tangent plane) so glyph textures share a consistent
  // upright orientation across tiles instead of a per-tile arbitrary one.
  faceFrame(center, corners, vertices) {
    const nx = center.x;
    const ny = center.y;
    const nz = center.z;

    // Up reference: world +Y, swapped near the poles where it aligns with n.
    const up = Math.abs(ny) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    const ud = up[0] * nx + up[1] * ny + up[2] * nz;
    let uy_x = up[0] - nx * ud;
    let uy_y = up[1] - ny * ud;
    let uy_z = up[2] - nz * ud;
    const ulen = Math.sqrt(uy_x * uy_x + uy_y * uy_y + uy_z * uy_z) || 1;
    uy_x /= ulen;
    uy_y /= ulen;
    uy_z /= ulen;

    // Right axis = up × n, so (right, up, n-outward) reads upright to the viewer.
    const ux_x = uy_y * nz - uy_z * ny;
    const ux_y = uy_z * nx - uy_x * nz;
    const ux_z = uy_x * ny - uy_y * nx;

    let radius = 0;
    const annotated = corners.map((vi) => {
      const v = vertices[vi];
      const d = v.x * nx + v.y * ny + v.z * nz;
      const px = v.x - nx * d;
      const py = v.y - ny * d;
      const pz = v.z - nz * d;
      const a = px * ux_x + py * ux_y + pz * ux_z;
      const b = px * uy_x + py * uy_y + pz * uy_z;
      radius = Math.max(radius, Math.hypot(a, b));
      return { x: v.x, y: v.y, z: v.z, a, b, angle: Math.atan2(b, a) };
    });

    annotated.sort((p, q) => p.angle - q.angle);
    return { ordered: annotated, radius: radius || 1 };
  },

  buildBorders({ vertices, edges }, scheme) {
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

    const material = new THREE.LineBasicMaterial({ color: scheme.border });

    return new THREE.LineSegments(geometry, material);
  },

  // Glyphs painted directly onto the tile faces (a flag on flagged cells, a bomb
  // on mines, the adjacency digit on numbered cells). Each face's corners are
  // UV-mapped into that glyph's cell in a shared white-mask atlas, then tinted by
  // the state colour via per-vertex colours — so the glyph sits flat on the
  // surface, rotates with the sphere, and stays theme-aware without re-baking.
  // The whole layer is a single draw call, pushed a hair outward to sit cleanly
  // above the fill.
  buildGlyphs(cells, { vertices }, scheme) {
    const cellCorners = Array.from({ length: cells.length }, () => []);
    for (let vi = 0; vi < vertices.length; vi++) {
      for (const c of vertices[vi].parents) cellCorners[c].push(vi);
    }

    const positions = [];
    const uvs = [];
    const colors = [];
    const lift = 1.002; // radial offset so glyphs render just above the fill

    for (let ci = 0; ci < cells.length; ci++) {
      const glyph = this.overlayGlyph(cells[ci].state);
      if (!glyph || cellCorners[ci].length < 3) continue;

      const col = this.glyphColor(glyph, scheme);
      const rect = this.atlasRect(glyph);
      const { ordered, radius } = this.faceFrame(cells[ci], cellCorners[ci], vertices);
      // Map a tile's circumradius to exactly its atlas cell edge — full cell, no
      // bleed. Glyph size is controlled by ATLAS_GLYPH_SCALE in the atlas, not here.
      const scale = 1 / (2 * radius);

      // Per-corner UV: place the corner's tangent coords within the glyph's cell,
      // centred at (0.5, 0.5); v grows downward to match the canvas atlas.
      const uvOf = (p) => [rect.u0 + (0.5 + p.a * scale) * rect.du, rect.v0 + (0.5 - p.b * scale) * rect.dv];

      const v0 = ordered[0];
      const uv0 = uvOf(v0);
      for (let k = 1; k < ordered.length - 1; k++) {
        const va = ordered[k];
        const vb = ordered[k + 1];
        for (const p of [v0, va, vb]) {
          positions.push(p.x * lift, p.y * lift, p.z * lift);
          colors.push(col.r, col.g, col.b);
        }
        const ua = uvOf(va);
        const ub = uvOf(vb);
        uvs.push(uv0[0], uv0[1], ua[0], ua[1], ub[0], ub[1]);
      }
    }

    if (positions.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

    const material = new THREE.MeshBasicMaterial({
      map: this.glyphAtlasTexture(),
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: false,
    });

    return new THREE.Mesh(geometry, material);
  },

  // UV sub-rectangle (inset half a texel to avoid bleeding into neighbours) for a
  // glyph's cell in the atlas.
  atlasRect(glyph) {
    const i = ATLAS_GLYPHS.indexOf(glyph);
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const inset = 0.5 / (ATLAS_CELL * ATLAS_COLS);
    return {
      u0: col / ATLAS_COLS + inset,
      v0: row / ATLAS_ROWS + inset,
      du: 1 / ATLAS_COLS - 2 * inset,
      dv: 1 / ATLAS_ROWS - 2 * inset,
    };
  },

  // Builds (once) the white-glyph atlas. flipY is off so canvas pixel rows map
  // directly to V, keeping the UV maths above straightforward.
  glyphAtlasTexture() {
    if (this.glyphAtlas) return this.glyphAtlas;

    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_CELL * ATLAS_COLS;
    canvas.height = ATLAS_CELL * ATLAS_ROWS;
    const ctx = canvas.getContext("2d");

    ATLAS_GLYPHS.forEach((glyph, i) => {
      const x = (i % ATLAS_COLS) * ATLAS_CELL;
      const y = Math.floor(i / ATLAS_COLS) * ATLAS_CELL;
      ctx.save();
      ctx.translate(x, y);
      // Scale the glyph about the cell centre so it occupies ATLAS_GLYPH_SCALE of the
      // cell, leaving transparent margin (the rest of the cell maps to the tile).
      ctx.translate(ATLAS_CELL / 2, ATLAS_CELL / 2);
      ctx.scale(ATLAS_GLYPH_SCALE, ATLAS_GLYPH_SCALE);
      ctx.translate(-ATLAS_CELL / 2, -ATLAS_CELL / 2);
      if (glyph === "mine") {
        this.drawMine(ctx, ATLAS_CELL, "#ffffff");
      } else if (glyph === "flag") {
        this.drawFlag(ctx, ATLAS_CELL, "#ffffff");
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${ATLAS_CELL * 0.7}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(glyph, ATLAS_CELL / 2, ATLAS_CELL / 2 + ATLAS_CELL * 0.04);
      }
      ctx.restore();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.glyphAtlas = tex;
    return tex;
  },

  overlayGlyph(state) {
    if (state === "flagged") return "flag";
    if (state === "mine") return "mine";
    const digit = DIGIT_STATES.indexOf(state);
    return digit >= 0 ? String(digit + 1) : null;
  },

  glyphColor(glyph, scheme) {
    if (glyph === "flag") return scheme.flag;
    if (glyph === "mine") return scheme.mine;
    return scheme[DIGIT_STATES[Number(glyph) - 1]];
  },

  drawMine(ctx, size, hex) {
    const c = size / 2;
    const r = size * 0.26;
    ctx.strokeStyle = hex;
    ctx.fillStyle = hex;
    ctx.lineWidth = size * 0.06;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * r * 1.7, c + Math.sin(a) * r * 1.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
  },

  drawFlag(ctx, size, color) {
    const poleX = size * 0.4;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.07;
    // Pole.
    ctx.beginPath();
    ctx.moveTo(poleX, size * 0.18);
    ctx.lineTo(poleX, size * 0.82);
    ctx.stroke();
    // Triangular pennant.
    ctx.beginPath();
    ctx.moveTo(poleX, size * 0.2);
    ctx.lineTo(size * 0.78, size * 0.35);
    ctx.lineTo(poleX, size * 0.5);
    ctx.closePath();
    ctx.fill();
  },
};
