// Deterministic board geometry: cell centres + adjacency for a subdivision
// frequency `n`. Cells are addressed by the structured index from `board_index`
import { FACES, cellCount, indexAt } from "./board_index.js";

export { cellCount };

const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSA_VERTICES = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];

const NEIGHBOUR_DELTAS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

export function buildBoardGeometry(n) {
  const cells = new Array(cellCount(n));
  const edgeSet = new Set();

  for (let f = 0; f < FACES.length; f++) {
    const [ia, ib, ic] = FACES[f];
    const a = ICOSA_VERTICES[ia];
    const b = ICOSA_VERTICES[ib];
    const c = ICOSA_VERTICES[ic];

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const index = indexAt(n, f, i, j);

        if (cells[index] === undefined) {
          const p = normalize(bary(a, b, c, n, i, j));
          cells[index] = { x: p[0], y: p[1], z: p[2], kind: index < 12 ? "pentagon" : "hexagon" };
        }

        for (const [di, dj] of NEIGHBOUR_DELTAS) {
          const i2 = i + di;
          const j2 = j + dj;
          if (i2 >= 0 && j2 >= 0 && i2 + j2 <= n) {
            const other = indexAt(n, f, i2, j2);
            edgeSet.add(index < other ? `${index},${other}` : `${other},${index}`);
          }
        }
      }
    }
  }

  const edges = [...edgeSet].map((e) => e.split(",").map(Number));
  return { cells, edges };
}

function bary(a, b, c, n, i, j) {
  const wa = (n - i - j) / n;
  const wb = i / n;
  const wc = j / n;
  return [wa * a[0] + wb * b[0] + wc * c[0], wa * a[1] + wb * b[1] + wc * c[1], wa * a[2] + wb * b[2] + wc * c[2]];
}

function normalize([x, y, z]) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}
