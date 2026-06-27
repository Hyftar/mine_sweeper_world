// Deterministic board geometry: cell centres + adjacency for a subdivision
// frequency `n`. This is a faithful port of `MineSweeperWorld.Games.Geometry`
// (Elixir) so cell indices match the server's index space exactly — the server
// only sends per-index states; the client reconstructs all positions/adjacency.
//
// The board is a Goldberg polyhedron built by subdividing an icosahedron `n`
// times (a geodesic sphere) and treating the resulting vertices as cell centres.
// The twelve original icosahedron vertices become pentagons; the rest hexagons.

const PHI = (1 + Math.sqrt(5)) / 2;

// The 12 icosahedron vertices (unnormalised); cyclic permutations of
// (0, ±1, ±phi). Raw coords so points shared along an edge compute identically.
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

// The 20 triangular faces, as indices into ICOSA_VERTICES.
const ICOSA_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const NEIGHBOUR_DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// Number of cells on a board with the given subdivision frequency.
export function cellCount(n) {
  return 10 * n * n + 2;
}

// Returns `{ cells, edges }`: cells as `{ x, y, z, kind }` in index order, edges
// as `[a, b]` index pairs (a < b). Cell index == position in the array.
export function buildBoardGeometry(n) {
  const keys = new Map(); // quantised position -> global index
  const cells = [];
  const edgeSet = new Set();

  for (const [ia, ib, ic] of ICOSA_FACES) {
    const a = ICOSA_VERTICES[ia];
    const b = ICOSA_VERTICES[ib];
    const c = ICOSA_VERTICES[ic];
    const local = new Map(); // "i,j" -> global index, for wiring edges

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const p = normalize(bary(a, b, c, n, i, j));
        const key = quantize(p);
        const corner = (i === 0 && j === 0) || (i === n && j === 0) || (i === 0 && j === n);

        let index = keys.get(key);
        if (index === undefined) {
          index = cells.length;
          keys.set(key, index);
          cells.push({ x: p[0], y: p[1], z: p[2], kind: corner ? "pentagon" : "hexagon" });
        }
        local.set(`${i},${j}`, index);
      }
    }

    for (const [ij, index] of local) {
      const [i, j] = ij.split(",").map(Number);
      for (const [di, dj] of NEIGHBOUR_DELTAS) {
        const neighbour = local.get(`${i + di},${j + dj}`);
        if (neighbour !== undefined) {
          edgeSet.add(index < neighbour ? `${index},${neighbour}` : `${neighbour},${index}`);
        }
      }
    }
  }

  const edges = [...edgeSet].map((e) => e.split(",").map(Number));
  return { cells, edges };
}

// Barycentric interpolation: weights (n-i-j, i, j) over corners (a, b, c).
function bary(a, b, c, n, i, j) {
  const wa = (n - i - j) / n;
  const wb = i / n;
  const wc = j / n;
  return [
    wa * a[0] + wb * b[0] + wc * c[0],
    wa * a[1] + wb * b[1] + wc * c[1],
    wa * a[2] + wb * b[2] + wc * c[2],
  ];
}

function normalize([x, y, z]) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

// Quantise a unit-sphere point to an integer key so the "same" point generated
// from adjacent faces deduplicates despite float rounding. Rounds half away from
// zero to match Elixir's `round/1`.
function quantize([x, y, z]) {
  return `${roundHalfAway(x * 1e6)},${roundHalfAway(y * 1e6)},${roundHalfAway(z * 1e6)}`;
}

function roundHalfAway(v) {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}
