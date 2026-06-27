// Owns the board's Three.js meshes and the (lifetime-long) glyph atlas, and
// knows how to build them all or update a subset of cells efficiently. Returns
// plain THREE objects for the renderer to add to / remove from the scene.
import { GlyphAtlas } from "./glyph_atlas.js";
import { buildFaces, buildBorders, buildGlyphs, updateFaceColors } from "./board_meshes.js";

export class BoardView {
  constructor() {
    this.atlas = new GlyphAtlas();
    this.objects = [];
    this.faces = null; // { mesh, ranges }
    this.borders = null;
    this.glyphs = null;
  }

  // Full (re)build from cached geometry. Returns the objects to add to the scene.
  build(cells, goldberg, scheme) {
    this.disposeObjects();
    this.faces = buildFaces(cells, goldberg, scheme);
    this.borders = buildBorders(goldberg, scheme);
    this.glyphs = buildGlyphs(cells, goldberg, scheme, this.atlas);
    this.objects = [this.faces.mesh, this.borders, this.glyphs].filter(Boolean);
    return this.objects;
  }

  // Partial update for a subset of changed cell indices: recolour those faces in
  // place and rebuild only the (small) glyph layer, since glyph membership can
  // change. Borders are state-independent. Returns the scene swap to apply.
  update(cells, indices, goldberg, scheme) {
    updateFaceColors(this.faces, cells, indices, scheme);

    const remove = this.glyphs ? [this.glyphs] : [];
    disposeMesh(this.glyphs);
    this.glyphs = buildGlyphs(cells, goldberg, scheme, this.atlas);
    this.objects = [this.faces.mesh, this.borders, this.glyphs].filter(Boolean);

    return { add: this.glyphs ? [this.glyphs] : [], remove };
  }

  disposeObjects() {
    disposeMesh(this.faces && this.faces.mesh);
    disposeMesh(this.borders);
    disposeMesh(this.glyphs);
    this.objects = [];
    this.faces = null;
    this.borders = null;
    this.glyphs = null;
  }

  dispose() {
    this.disposeObjects();
    this.atlas.dispose();
  }
}

function disposeMesh(mesh) {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.material.dispose();
}
