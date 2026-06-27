// Builds the Three.js meshes for the board: filled faces, borders, and glyphs.
import * as THREE from "three";
import { cellCornersOf, faceFrame } from "./goldberg.js";
import { GlyphAtlas, glyphForState, glyphColor } from "./glyph_atlas.js";

const GLYPH_LIFT = 1.002; // radial offset so glyphs render just above the fill

// Owns the glyph atlas and assembles the per-board mesh list. One factory lives
// for the renderer's lifetime; `dispose` releases the shared atlas texture.
export class BoardMeshFactory {
  constructor() {
    this.atlas = new GlyphAtlas();
  }

  build(cells, goldberg, scheme) {
    const meshes = [buildFaces(cells, goldberg, scheme), buildBorders(goldberg, scheme)];
    const glyphs = buildGlyphs(cells, goldberg, scheme, this.atlas);
    if (glyphs) meshes.push(glyphs);
    return meshes;
  }

  dispose() {
    this.atlas.dispose();
  }
}

// Base fill for a cell: only "hidden" and "flagged" read as covered tiles;
// open/mine/numbered cells share the revealed background.
function faceFill(state, scheme) {
  return state === "hidden" || state === "flagged" ? scheme.hiddenFill : scheme.revealedFill;
}

// Filled hexagon/pentagon faces. Each cell is one face whose corners are the
// Goldberg vertices that share the cell as a parent; corners are sorted around
// the cell normal and triangulated as a fan, coloured by the cell state.
function buildFaces(cells, { vertices }, scheme) {
  const cellCorners = cellCornersOf(cells.length, vertices);

  const positions = [];
  const colors = [];
  for (let ci = 0; ci < cells.length; ci++) {
    const corners = cellCorners[ci];
    if (corners.length < 3) continue;

    const fill = faceFill(cells[ci].state, scheme);
    const { ordered } = faceFrame(cells[ci], corners, vertices);

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
}

function buildBorders({ vertices, edges }, scheme) {
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
}

// Glyphs painted directly onto the tile faces (a flag on flagged cells, a bomb
// on mines, the adjacency digit on numbered cells). Each face's corners are
// UV-mapped into that glyph's atlas cell, then tinted by the state colour via
// per-vertex colours — so the glyph sits flat on the surface, rotates with the
// sphere, and stays theme-aware without re-baking. The whole layer is a single
// draw call, pushed a hair outward to sit cleanly above the fill.
function buildGlyphs(cells, { vertices }, scheme, atlas) {
  const cellCorners = cellCornersOf(cells.length, vertices);

  const positions = [];
  const uvs = [];
  const colors = [];

  for (let ci = 0; ci < cells.length; ci++) {
    const glyph = glyphForState(cells[ci].state);
    if (!glyph || cellCorners[ci].length < 3) continue;

    const col = glyphColor(glyph, scheme);
    const rect = atlas.rect(glyph);
    const { ordered, radius } = faceFrame(cells[ci], cellCorners[ci], vertices);
    // Map a tile's circumradius to exactly its atlas cell edge — full cell, no
    // bleed. Glyph size is controlled in the atlas, not here.
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
        positions.push(p.x * GLYPH_LIFT, p.y * GLYPH_LIFT, p.z * GLYPH_LIFT);
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
    map: atlas.texture(),
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.4,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}
