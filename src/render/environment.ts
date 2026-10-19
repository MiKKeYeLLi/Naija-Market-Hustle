// Market stall backdrop (NMH-20): a Nigerian market behind the play plane, built from primitives.
// Everything is static and baked into one vertex-coloured geometry (plus the sky), so the whole
// backdrop costs two draw calls and no per-frame work. Flat shading is baked into the vertex colours
// and drawn unlit: the scene lights are tuned for the produce, and would grey the painted backdrop.
//
// Layout rules: every part sits behind the play plane (z <= BACKDROP_MAX_Z) except the ground, which
// lies below the play area's bottom edge. So nothing can overlap or hide a falling item.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAY_AREA } from '../game/playArea';

// Nearest z any upright backdrop part may reach; the play plane is z = 0.
export const BACKDROP_MAX_Z = -2.5;
// The ground is the one part in front of BACKDROP_MAX_Z; it stays below this height.
export const GROUND_Y = PLAY_AREA.bottom - 0.6;

// Bright but slightly softened, so the saturated produce in front always pops.
const COLORS = {
  ground: '#e7c48f',
  groundEdge: '#d9ae72',
  // Pale aqua, bluer than it looks under the warm lights. Kept lighter than every item, yellow ones
  // included, so produce reads against it by brightness as well as hue.
  wall: '#c8eef2',
  wallLine: '#acdde4',
  post: '#8a5a2b',
  // Pale wood: the dark woven basket sits in front of the counter and must stand out against it.
  counter: '#ead2a4',
  counterTop: '#f4e2bd',
  canopyGreen: '#2f9a5b',
  canopyWhite: '#f6f2e6',
  crate: '#cf9f62',
  crateSlat: '#a8743d',
  sack: '#eadbb3',
  sackTie: '#b08a52',
  umbrellaA: '#f2a93b',
  umbrellaB: '#e2574c',
  umbrellaC: '#4f8fd6',
  building: ['#efe1c8', '#e6d3b4', '#f3e7d3', '#dcc8a8'],
  roof: '#b9b2a6',
} as const;

// Baked light: a fixed sun direction, an ambient floor and how much facing the sun adds on top.
const SUN = new THREE.Vector3(0.45, 0.8, 0.6).normalize();
const AMBIENT = 0.74;
const DIRECT = 0.3;

const SKY_TOP = '#8fd3f4';
const SKY_HORIZON = '#fff1d6';

type Parts = THREE.BufferGeometry[];

// Bakes one primitive into the shared geometry: transformed into place and painted a flat colour.
function add(parts: Parts, geometry: THREE.BufferGeometry, color: string, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): void {
  const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  piece.deleteAttribute('uv');
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  piece.applyMatrix4(matrix);
  piece.deleteAttribute('normal');

  // Flat shading per triangle from its own face direction, baked into the colours.
  const base = new THREE.Color(color);
  const vertices = piece.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const normal = new THREE.Vector3();
  for (let i = 0; i < vertices.count; i += 3) {
    a.fromBufferAttribute(vertices, i);
    b.fromBufferAttribute(vertices, i + 1);
    c.fromBufferAttribute(vertices, i + 2);
    normal.subVectors(c, b).cross(a.sub(b)).normalize();
    const shade = AMBIENT + DIRECT * Math.max(0, normal.dot(SUN));
    for (let v = 0; v < 3; v++) colors.set([base.r * shade, base.g * shade, base.b * shade], (i + v) * 3);
  }
  piece.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(piece);
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function ground(parts: Parts): void {
  add(parts, new THREE.PlaneGeometry(160, 80), COLORS.ground, [0, GROUND_Y, -35], [-Math.PI / 2, 0, 0]);
  // A slightly darker swept strip along the stall fronts.
  add(parts, new THREE.PlaneGeometry(160, 3), COLORS.groundEdge, [0, GROUND_Y + 0.01, -6], [-Math.PI / 2, 0, 0]);
}

// One stall: painted plank wall, two posts, a counter and a striped tarpaulin sloping towards the camera.
function stall(parts: Parts, x: number, z: number, width: number, stripeA: string, stripeB: string): void {
  // Tall enough to meet the canopy, so no blank strip shows between them on tall phone screens.
  const wallHeight = 14;
  const wallY = GROUND_Y + wallHeight / 2;
  add(parts, box(width, wallHeight, 0.3), COLORS.wall, [x, wallY, z - 1.5]);
  for (let y = GROUND_Y + 1.2; y < GROUND_Y + wallHeight; y += 1.3) {
    add(parts, box(width, 0.08, 0.05), COLORS.wallLine, [x, y, z - 1.33]);
  }

  const postHeight = 15;
  for (const side of [-1, 1]) {
    add(parts, new THREE.CylinderGeometry(0.22, 0.26, postHeight, 6), COLORS.post, [x + side * (width / 2 + 0.2), GROUND_Y + postHeight / 2, z]);
  }

  // Counter with a lighter top board.
  add(parts, box(width - 2, 2.4, 1.6), COLORS.counter, [x, GROUND_Y + 1.2, z + 0.4]);
  add(parts, box(width - 1.6, 0.25, 1.9), COLORS.counterTop, [x, GROUND_Y + 2.5, z + 0.4]);

  // Tarpaulin: alternating stripes running front to back, tilted so the front edge hangs lower.
  const stripes = 9;
  const stripeWidth = (width + 1.5) / stripes;
  const canopyY = GROUND_Y + postHeight - 0.4;
  for (let i = 0; i < stripes; i++) {
    const sx = x - (width + 1.5) / 2 + stripeWidth * (i + 0.5);
    const color = i % 2 === 0 ? stripeA : stripeB;
    add(parts, box(stripeWidth, 0.12, 4.2), color, [sx, canopyY, z - 0.4], [0.32, 0, 0]);
    // Scalloped valance hanging from the front edge.
    add(parts, box(stripeWidth * 0.92, 0.7, 0.08), color, [sx, canopyY - 1, z + 1.55], [0.1, 0, 0]);
  }
}

function crate(parts: Parts, x: number, y: number, z: number, size = 1.5): void {
  add(parts, box(size, size * 0.8, size), COLORS.crate, [x, y + (size * 0.8) / 2, z]);
  // Dark slats across the front and sides.
  for (const dy of [0.2, 0.5]) {
    add(parts, box(size + 0.04, 0.09, size + 0.04), COLORS.crateSlat, [x, y + size * 0.8 * dy, z]);
  }
}

// A filled bag: straight-sided, rounded shoulders, flat tied top. Deliberately no pointed tip, so it
// can never be mistaken for an onion.
function sack(parts: Parts, x: number, z: number, scale = 1): void {
  const s = (v: number) => v * scale;
  add(parts, new THREE.CylinderGeometry(s(0.68), s(0.78), s(1.15), 8), COLORS.sack, [x, GROUND_Y + s(0.58), z], [0, 0.3, 0]);
  add(parts, new THREE.SphereGeometry(s(0.68), 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.sack, [x, GROUND_Y + s(1.15), z], [0, 0, 0], [1, 0.45, 1]);
  add(parts, new THREE.CylinderGeometry(s(0.24), s(0.3), s(0.22), 6), COLORS.sackTie, [x, GROUND_Y + s(1.42), z]);
}

function umbrella(parts: Parts, x: number, z: number, color: string): void {
  add(parts, new THREE.CylinderGeometry(0.12, 0.12, 9, 5), COLORS.post, [x, GROUND_Y + 4.5, z]);
  add(parts, new THREE.ConeGeometry(4.2, 1.6, 8), color, [x, GROUND_Y + 9.6, z]);
}

// Low rooftops far behind, for wide screens: soft colours, no detail to compete with play.
function skyline(parts: Parts): void {
  let x = -70;
  let i = 0;
  while (x < 70) {
    const width = 6 + ((i * 37) % 5);
    const height = 8 + ((i * 53) % 9);
    const color = COLORS.building[i % COLORS.building.length];
    add(parts, box(width, height, 3), color, [x + width / 2, GROUND_Y + height / 2, -40]);
    add(parts, box(width + 0.6, 0.5, 3.4), COLORS.roof, [x + width / 2, GROUND_Y + height + 0.25, -40], [0, 0, 0.04]);
    x += width + 0.8;
    i++;
  }
}

function buildParts(): Parts {
  const parts: Parts = [];
  ground(parts);
  skyline(parts);

  // The main stall frames the play area; neighbours fill wide screens.
  stall(parts, 0, -10, 16, COLORS.canopyGreen, COLORS.canopyWhite);
  stall(parts, -19, -13, 14, COLORS.umbrellaB, COLORS.canopyWhite);
  stall(parts, 19, -13, 14, COLORS.umbrellaC, COLORS.canopyWhite);

  // Goods kept to the floor in front of the counter, below the lanes where produce falls.
  sack(parts, -4.2, -6.2, 0.9);
  sack(parts, -2.6, -6.6, 0.75);
  sack(parts, 4.4, -6.3, 0.95);
  crate(parts, 2.6, GROUND_Y, -6.8, 1.4);
  crate(parts, -6.6, GROUND_Y, -5.5);
  crate(parts, -6.6, GROUND_Y + 1.2, -5.5, 1.3);
  crate(parts, 7.2, GROUND_Y, -5);
  sack(parts, 9.2, -4.2);
  sack(parts, -9.4, -3.8, 1.1);

  umbrella(parts, -12, -7, COLORS.umbrellaA);
  umbrella(parts, 12.5, -7.5, COLORS.umbrellaA);
  return parts;
}

function createSky(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(400, 160, 1, 32);
  const position = geometry.getAttribute('position');
  const top = new THREE.Color(SKY_TOP);
  const horizon = new THREE.Color(SKY_HORIZON);
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const centerY = GROUND_Y + 40;
  for (let i = 0; i < position.count; i++) {
    // Graded over the part of the sky that is actually on screen: warm haze just above the
    // rooftops, clear blue by the top of the view.
    const worldY = position.getY(i) + centerY;
    const t = THREE.MathUtils.clamp((worldY - (GROUND_Y + 12)) / 26, 0, 1);
    color.copy(horizon).lerp(top, t);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  sky.position.set(0, centerY, -80);
  sky.name = 'sky';
  return sky;
}

export interface Environment {
  group: THREE.Group;
  dispose(): void;
}

export function createEnvironment(): Environment {
  const parts = buildParts();
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Could not merge the market backdrop');

  const market = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  market.name = 'market';
  const sky = createSky();

  const group = new THREE.Group();
  group.name = 'environment';
  group.add(sky, market);
  // Static: compute world matrices once and never again.
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    object.matrixAutoUpdate = false;
  });

  return {
    group,
    dispose() {
      for (const mesh of [market, sky]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      group.removeFromParent();
    },
  };
}
