// Cell-state colour palettes and theme resolution for the sphere board.
import * as THREE from "three";

// One palette per daisyUI theme. Keys map to cell states (see `glyph_atlas`).
export const COLORS = {
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

// Numbered states in order, used to map state names <-> digits and colours.
export const DIGIT_STATES = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

// Resolves the active palette from the daisyUI `data-theme` attribute, falling
// back to the OS preference when the theme is "system" (attribute absent).
export function activeScheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  const dark = attr === "dark" || (attr !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return dark ? COLORS.dark : COLORS.light;
}
