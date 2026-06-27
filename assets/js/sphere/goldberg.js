// Goldberg-polyhedron geometry derived from the server's dual cell-adjacency
// graph. Pure maths — no Three.js — so it is cheap to recompute and easy to test.

// Maps each cell to the Goldberg vertices that share it as a parent, i.e. the
// corners of that cell's face.
export function cellCornersOf(cellCount, vertices) {
  const cellCorners = Array.from({ length: cellCount }, () => []);
  for (let vi = 0; vi < vertices.length; vi++) {
    for (const c of vertices[vi].parents) cellCorners[c].push(vi);
  }
  return cellCorners;
}

// Derives the Goldberg polyhedron (corners of the hexagon/pentagon faces).
//
// Each Goldberg vertex is the centroid of a triangle of three mutually adjacent
// cells; each Goldberg edge is a cell-pair shared by exactly two such vertices.
//
// Triangle membership uses neighbour Sets (O(1) lookups), and edges are found by
// bucketing vertices on their shared cell-pair keys — O(V).
export function buildGoldbergGeometry(cells, edges) {
  const neighbors = Array.from({ length: cells.length }, () => new Set());

  for (const [a, b] of edges) {
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
  const goldbergEdges = [];
  const addPair = (p, q, vi) => {
    const key = p < q ? p * cells.length + q : q * cells.length + p;
    const other = pairToVertex.get(key);
    if (other === undefined) {
      pairToVertex.set(key, vi);
    } else {
      goldbergEdges.push([other, vi]);
    }
  };

  for (let vi = 0; vi < vertices.length; vi++) {
    const [a, b, c] = vertices[vi].parents;
    addPair(a, b, vi);
    addPair(b, c, vi);
    addPair(a, c, vi);
  }

  return { vertices, edges: goldbergEdges };
}

// Builds a tangent frame for a face and returns its corners sorted into a simple
// (convex) polygon, each annotated with 2D tangent coords, plus the circumradius.
// The frame's "up" axis points toward the world north pole (projected onto the
// tangent plane) so glyph textures share a consistent upright orientation across
// tiles instead of a per-tile arbitrary one.
export function faceFrame(center, corners, vertices) {
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
}
