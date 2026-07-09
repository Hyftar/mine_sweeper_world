export const FACES = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

const EDGE_LIST = (() => {
  const byKey = new Map();
  for (const [a, b, c] of FACES) {
    for (const [x, y] of [
      [a, b],
      [b, c],
      [a, c],
    ]) {
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      byKey.set(`${lo},${hi}`, [lo, hi]);
    }
  }
  return [...byKey.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
})();

const EDGE_ID = new Map(EDGE_LIST.map(([lo, hi], id) => [`${lo},${hi}`, id]));

const EDGE_FACES = EDGE_LIST.map(([lo, hi]) =>
  FACES.reduce((acc, [a, b, c], fid) => {
    const edges = [
      [a, b],
      [b, c],
      [a, c],
    ];
    if (edges.some(([x, y]) => Math.min(x, y) === lo && Math.max(x, y) === hi)) acc.push(fid);
    return acc;
  }, []),
);

const VERTEX_FACES = Array.from({ length: 12 }, (_, v) => FACES.reduce((acc, face, fid) => (face.includes(v) ? [...acc, fid] : acc), []));

export function cellCount(n) {
  return 10 * n * n + 2;
}

// The twelve icosahedron vertices occupy indices 0..11.
export function pentagon(index) {
  return index < 12;
}

export function tileKind(index) {
  return pentagon(index) ? "pentagon" : "hexagon";
}

export function indexAt(n, f, i, j) {
  const [g0, g1, g2] = FACES[f];
  const w0 = n - i - j;

  if (w0 === n) return g0;
  if (i === n) return g1;
  if (j === n) return g2;
  if (w0 === 0) return edgeIndex(n, g1, g2, i, j);
  if (i === 0) return edgeIndex(n, g0, g2, w0, j);
  if (j === 0) return edgeIndex(n, g0, g1, w0, i);
  return faceIndex(n, f, i, j);
}

// Adjacent cell indices for `index` on a board of frequency `n`. Each neighbour
// is an in-face lattice step from one of the faces the cell belongs to; `indexAt`
// canonicalises shared points, so no seam transforms are needed.
export function neighbours(n, index) {
  const out = new Set();
  for (const [f, i, j] of incidentReps(n, index)) {
    for (const [di, dj] of DIRS) {
      const i2 = i + di;
      const j2 = j + dj;
      if (i2 >= 0 && j2 >= 0 && i2 + j2 <= n) out.add(indexAt(n, f, i2, j2));
    }
  }
  out.delete(index);
  return [...out].sort((a, b) => a - b);
}

function edgeIndex(n, p, q, wp, wq) {
  const [lo, hi, slot] = p < q ? [p, q, wq] : [q, p, wp];
  return 12 + EDGE_ID.get(`${lo},${hi}`) * (n - 1) + (slot - 1);
}

function faceIndex(n, f, i, j) {
  const per = ((n - 1) * (n - 2)) / 2;
  const offset = (i - 1) * (n - 1) - ((i - 1) * i) / 2;
  return 12 + 30 * (n - 1) + f * per + offset + (j - 1);
}

// One [face, i, j] representation per incident face: 1 interior, 2 edge, 5 corner.
function incidentReps(n, index) {
  const edgeTotal = 30 * (n - 1);

  if (index < 12) {
    return VERTEX_FACES[index].map((f) => cornerIJ(n, f, index));
  }

  if (index < 12 + edgeTotal) {
    const rel = index - 12;
    const eid = Math.floor(rel / (n - 1));
    const slot = (rel % (n - 1)) + 1;
    const [lo, hi] = EDGE_LIST[eid];
    return EDGE_FACES[eid].map((f) => edgeIJ(n, f, lo, hi, slot));
  }

  const per = ((n - 1) * (n - 2)) / 2;
  const rel = index - 12 - edgeTotal;
  const [i, j] = interiorIJ(n, rel % per);
  return [[Math.floor(rel / per), i, j]];
}

function cornerIJ(n, f, v) {
  const [g0, g1] = FACES[f];
  if (v === g0) return [f, 0, 0];
  if (v === g1) return [f, n, 0];
  return [f, 0, n];
}

function edgeIJ(n, f, lo, hi, slot) {
  const [, g1, g2] = FACES[f];
  return [f, edgeWeight(g1, lo, hi, slot, n), edgeWeight(g2, lo, hi, slot, n)];
}

function edgeWeight(v, lo, hi, slot, n) {
  if (v === hi) return slot;
  if (v === lo) return n - slot;
  return 0;
}

// Inverse of the interior ordinal: row i has (n-1-i) interior points.
function interiorIJ(n, p) {
  let rem = p;
  for (let i = 1; i <= n - 2; i++) {
    const row = n - 1 - i;
    if (rem < row) return [i, rem + 1];
    rem -= row;
  }
  return [0, 0];
}
