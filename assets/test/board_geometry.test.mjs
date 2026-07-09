// Golden/parity tests for the structured board index, run with Node's built-in
// test runner: `npm test --prefix assets` (or `node --test` from assets/).
// Requires Node >= 20 (ESM auto-detection of the .js sources); the app
// container's Node 18 is for asset bundling only — run these on the host.
//
// They guard three things:
//   1. Golden — structured adjacency equals a float "oracle" (the legacy
//      generation) in position space, mirroring the Elixir golden test.
//   2. neighbours() matches the generated edge graph; degrees are 5/6.
//   3. Parity — indexAt() reproduces the exact numbering of the Elixir module,
//      verified against checksums generated from `Geometry.index_at/4`.
import test from "node:test";
import assert from "node:assert/strict";

import { buildBoardGeometry } from "../js/sphere/board_geometry.js";
import { FACES, cellCount, indexAt, neighbours, pentagon, tileKind } from "../js/sphere/board_index.js";

const FREQS = [1, 2, 3, 4, 5, 7, 10, 18];

// Checksums of the index_at sequence (f=0..19, i=0..n, j=0..n-i), folded as
// acc = acc*31 + v (mod 2^32). Generated from MineSweeperWorld.Games.Geometry.
const ELIXIR_INDEX_CHECKSUMS = {
  1: 111123756,
  2: 2819414386,
  3: 1834919690,
  4: 3745667628,
  5: 3897097444,
  7: 358720098,
  10: 3225357466,
  18: 2589592130,
};

// --- float oracle (legacy generation), as a set of position-key edge pairs ----

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTS = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

const roundHalfAway = (v) => (v < 0 ? -Math.round(-v) : Math.round(v));

function facePoint(f, n, i, j) {
  const [ia, ib, ic] = FACES[f];
  const [a, b, c] = [VERTS[ia], VERTS[ib], VERTS[ic]];
  const wa = (n - i - j) / n;
  const wb = i / n;
  const wc = j / n;
  const x = wa * a[0] + wb * b[0] + wc * c[0];
  const y = wa * a[1] + wb * b[1] + wc * c[1];
  const z = wa * a[2] + wb * b[2] + wc * c[2];
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return `${roundHalfAway((x / len) * 1e6)},${roundHalfAway((y / len) * 1e6)},${roundHalfAway((z / len) * 1e6)}`;
}

const canon = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

function oracleEdges(n) {
  const edges = new Set();
  for (let f = 0; f < FACES.length; f++) {
    const local = new Map();
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) local.set(`${i},${j}`, facePoint(f, n, i, j));
    }
    for (const [ij, key] of local) {
      const [i, j] = ij.split(",").map(Number);
      for (const [di, dj] of DELTAS) {
        const nb = local.get(`${i + di},${j + dj}`);
        if (nb !== undefined) edges.add(canon(key, nb));
      }
    }
  }
  return edges;
}

// --- tests -------------------------------------------------------------------

test("cell array is dense and complete (one cell per structured index)", () => {
  for (const n of FREQS) {
    const { cells } = buildBoardGeometry(n);
    assert.equal(cells.length, cellCount(n), `n=${n} length`);
    assert.ok(cells.every(Boolean), `n=${n} has an unfilled index`);
  }
});

test("structured adjacency matches the float oracle in position space", () => {
  for (const n of FREQS) {
    const { cells, edges } = buildBoardGeometry(n);
    const key = (idx) => facePointKey(cells[idx]);

    const structured = new Set();
    for (const [a, b] of edges) structured.add(canon(key(a), key(b)));

    const oracle = oracleEdges(n);
    assert.equal(structured.size, oracle.size, `n=${n} edge count`);
    for (const e of structured) assert.ok(oracle.has(e), `n=${n} extra edge ${e}`);
    assert.equal(structured.size, 3 * cellCount(n) - 6, `n=${n} edge count != 3N-6`);
  }

  // Position key straight from a generated cell (already unit-normalised).
  function facePointKey({ x, y, z }) {
    return `${roundHalfAway(x * 1e6)},${roundHalfAway(y * 1e6)},${roundHalfAway(z * 1e6)}`;
  }
});

test("neighbours() matches the edge graph with degrees 5 (pentagon) / 6 (hexagon)", () => {
  for (const n of FREQS) {
    const count = cellCount(n);
    const { edges } = buildBoardGeometry(n);

    const adj = Array.from({ length: count }, () => new Set());
    for (const [a, b] of edges) {
      adj[a].add(b);
      adj[b].add(a);
    }

    for (let idx = 0; idx < count; idx++) {
      const fromGraph = [...adj[idx]].sort((x, y) => x - y);
      assert.deepEqual(neighbours(n, idx), fromGraph, `n=${n} neighbours(${idx})`);
      assert.equal(adj[idx].size, pentagon(idx) ? 5 : 6, `n=${n} degree of ${idx}`);
    }
  }
});

test("indexAt numbering matches the Elixir module (checksum parity)", () => {
  for (const n of FREQS) {
    let hash = 0;
    for (let f = 0; f < 20; f++) {
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) hash = (hash * 31 + indexAt(n, f, i, j)) % 4294967296;
      }
    }
    assert.equal(hash, ELIXIR_INDEX_CHECKSUMS[n], `n=${n} index checksum`);
  }
});

test("pentagons are exactly indices 0..11", () => {
  for (const n of FREQS) {
    const pents = [];
    for (let idx = 0; idx < cellCount(n); idx++) if (pentagon(idx)) pents.push(idx);
    assert.deepEqual(pents, Array.from({ length: 12 }, (_, i) => i), `n=${n}`);
  }
  assert.equal(tileKind(0), "pentagon");
  assert.equal(tileKind(12), "hexagon");
});
