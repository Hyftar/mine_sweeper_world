// White-mask glyph atlas (flag, bomb, digits 1-8) painted onto tile faces and
// tinted per-cell via vertex colours. Built once, lazily, and reused.
import * as THREE from "three";
import { DIGIT_STATES } from "./theme.js";

// Glyphs packed into the atlas, in row-major order.
const ATLAS_GLYPHS = ["flag", "mine", "1", "2", "3", "4", "5", "6", "7", "8"];
const ATLAS_COLS = 5;
const ATLAS_ROWS = 2;
const ATLAS_CELL = 256; // px per glyph cell
const ATLAS_GLYPH_SCALE = 0.55; // how large the glyph is drawn within its tile

// Maps a cell state to its overlay glyph, or null for a plain tile.
export function glyphForState(state) {
  if (state === "flagged") return "flag";
  if (state === "mine") return "mine";
  const digit = DIGIT_STATES.indexOf(state);
  return digit >= 0 ? String(digit + 1) : null;
}

// The scheme colour a given glyph should be tinted with.
export function glyphColor(glyph, scheme) {
  if (glyph === "flag") return scheme.flag;
  if (glyph === "mine") return scheme.mine;
  return scheme[DIGIT_STATES[Number(glyph) - 1]];
}

export class GlyphAtlas {
  constructor() {
    this.texture_ = null;
  }

  // UV sub-rectangle (inset half a texel to avoid bleeding into neighbours) for
  // a glyph's cell in the atlas.
  rect(glyph) {
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
  }

  // Builds (once) the white-glyph atlas. flipY is off so canvas pixel rows map
  // directly to V, keeping the UV maths in the mesh builder straightforward.
  texture() {
    if (this.texture_) return this.texture_;

    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_CELL * ATLAS_COLS;
    canvas.height = ATLAS_CELL * ATLAS_ROWS;
    const ctx = canvas.getContext("2d");

    ATLAS_GLYPHS.forEach((glyph, i) => {
      const x = (i % ATLAS_COLS) * ATLAS_CELL;
      const y = Math.floor(i / ATLAS_COLS) * ATLAS_CELL;
      ctx.save();
      ctx.translate(x, y);
      // Scale about the cell centre so the glyph occupies ATLAS_GLYPH_SCALE of
      // the cell, leaving transparent margin (the rest maps onto the tile).
      ctx.translate(ATLAS_CELL / 2, ATLAS_CELL / 2);
      ctx.scale(ATLAS_GLYPH_SCALE, ATLAS_GLYPH_SCALE);
      ctx.translate(-ATLAS_CELL / 2, -ATLAS_CELL / 2);
      drawGlyph(ctx, glyph);
      ctx.restore();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.texture_ = tex;
    return tex;
  }

  dispose() {
    if (this.texture_) this.texture_.dispose();
    this.texture_ = null;
  }
}

function drawGlyph(ctx, glyph) {
  if (glyph === "mine") return drawMine(ctx, ATLAS_CELL);
  if (glyph === "flag") return drawFlag(ctx, ATLAS_CELL);
  return drawDigit(ctx, glyph, ATLAS_CELL);
}

function drawDigit(ctx, digit, size) {
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${size * 0.7}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(digit, size / 2, size / 2 + size * 0.04);
}

function drawMine(ctx, size) {
  const c = size / 2;
  const r = size * 0.26;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
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
}

function drawFlag(ctx, size) {
  const poleX = size * 0.4;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
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
}
