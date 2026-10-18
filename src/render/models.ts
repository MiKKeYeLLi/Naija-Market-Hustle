// Procedural low-poly meshes for items and the basket, built from three.js primitives.
// Every geometry and material is created once and shared; models are cheap Groups of shared parts.

import * as THREE from 'three';
import { ITEM_DEFINITIONS, type ItemTypeId } from '../game/items';
import { BASKET_HEIGHT, BASKET_WIDTH } from '../game/playArea';

// Tilts every model a little towards the camera so tops (calyx, rim, basket mouth) read in 3D.
const ITEM_TILT = 0.3;
const BASKET_TILT = 0.35;

const HAZARD_STEM = '#4a3b22';
const HAZARD_SPLOTCH = '#24190d';
// Light cross on a dark, dull body: high luminance contrast, so it survives greyscale.
const HAZARD_MARK = '#f3ead8';
const HAZARD_WOBBLE_SPEED = 7;
const HAZARD_WOBBLE_ANGLE = 0.22;

const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.Material>();

function geometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let shared = geometries.get(key);
  if (!shared) {
    shared = build();
    geometries.set(key, shared);
  }
  return shared;
}

function lambert(color: string, side: THREE.Side = THREE.FrontSide): THREE.Material {
  const key = `${color}:${side}`;
  let shared = materials.get(key);
  if (!shared) {
    shared = new THREE.MeshLambertMaterial({ color, flatShading: true, side });
    materials.set(key, shared);
  }
  return shared;
}

interface PartOptions {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  name?: string;
}

function part(geo: THREE.BufferGeometry, material: THREE.Material, options: PartOptions = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.scale) mesh.scale.set(...options.scale);
  if (options.name) mesh.name = options.name;
  return mesh;
}

const sphere = (radius: number, w = 10, h = 8) =>
  geometry(`sphere:${radius}:${w}:${h}`, () => new THREE.SphereGeometry(radius, w, h));
const cone = (radius: number, height: number, segments: number) =>
  geometry(`cone:${radius}:${height}:${segments}`, () => new THREE.ConeGeometry(radius, height, segments));
const cylinder = (top: number, bottom: number, height: number, segments: number) =>
  geometry(`cyl:${top}:${bottom}:${height}:${segments}`, () => new THREE.CylinderGeometry(top, bottom, height, segments));
const box = (w: number, h: number, d: number) => geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));

// Each builder returns the model body centred on the origin, sized to its ITEM_DEFINITIONS hitbox.
// `front` is the z of the body's front surface where hazard markings sit, and `markY` their height.
interface ItemShape {
  body: THREE.Group;
  front: number;
  markY: number;
  markScale: number;
}

function tomatoShape(bodyColor: string, stemColor: string, squash: number): ItemShape {
  const body = new THREE.Group();
  body.add(
    part(sphere(0.4), lambert(bodyColor), { scale: [1, squash, 1] }),
    // Flattened five-point calyx and a short stem.
    part(cone(0.2, 0.08, 5), lambert(stemColor), { position: [0, 0.4 * squash - 0.02, 0] }),
    part(cylinder(0.035, 0.035, 0.12, 5), lambert(stemColor), { position: [0, 0.4 * squash + 0.04, 0] }),
  );
  return { body, front: 0.4, markY: 0, markScale: 1 };
}

function pepperShape(bodyColor: string, stemColor: string): ItemShape {
  const body = new THREE.Group();
  body.add(
    // Plump shoulder tapering to a leaning tip (a chilli, not a carrot), with a stem.
    part(cone(0.25, 0.62, 8), lambert(bodyColor), { position: [0.02, -0.13, 0], rotation: [Math.PI, 0, -0.22] }),
    part(sphere(0.27, 8, 6), lambert(bodyColor), { position: [0, 0.2, 0], scale: [1, 0.8, 1] }),
    part(cylinder(0.04, 0.05, 0.12, 5), lambert(stemColor), { position: [0, 0.44, 0], rotation: [0, 0, 0.3] }),
  );
  return { body, front: 0.26, markY: 0.14, markScale: 0.72 };
}

function onionShape(): ItemShape {
  const { colorKey } = ITEM_DEFINITIONS.onion;
  const body = new THREE.Group();
  body.add(
    part(sphere(0.4), lambert(colorKey), { scale: [1, 0.75, 1] }),
    part(cone(0.09, 0.14, 6), lambert('#c9a27a'), { position: [0, 0.33, 0] }),
    part(cylinder(0.08, 0.05, 0.06, 6), lambert('#e8d8b0'), { position: [0, -0.31, 0] }),
  );
  return { body, front: 0.4, markY: 0, markScale: 1 };
}

function plantainShape(): ItemShape {
  const { colorKey } = ITEM_DEFINITIONS.plantain;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.46, 0.14, 0),
    new THREE.Vector3(0, -0.38, 0),
    new THREE.Vector3(0.46, 0.14, 0),
  );
  const body = new THREE.Group();
  body.add(
    part(
      geometry('plantain:tube', () => new THREE.TubeGeometry(curve, 12, 0.13, 6)),
      lambert(colorKey),
    ),
    // Dark tips at both ends, the way ripe plantains look.
    part(sphere(0.08, 6, 4), lambert('#3b2a14'), { position: [-0.48, 0.16, 0] }),
    part(cylinder(0.05, 0.06, 0.12, 5), lambert('#3b2a14'), { position: [0.5, 0.18, 0], rotation: [0, 0, -0.9] }),
  );
  return { body, front: 0.13, markY: 0, markScale: 1 };
}

function cornShape(): ItemShape {
  const { colorKey } = ITEM_DEFINITIONS.corn;
  const husk = lambert('#5d9b3a');
  // Flat leaf: a four-sided cone squashed front to back.
  const leaf = cone(0.11, 0.9, 4);
  const body = new THREE.Group();
  body.add(
    part(cylinder(0.13, 0.15, 0.8, 8), lambert(colorKey), { position: [0, 0.1, 0] }),
    part(cone(0.06, 0.12, 5), lambert('#8a5a2b'), { position: [0, 0.56, 0] }),
    part(leaf, husk, { position: [-0.1, -0.15, 0.06], rotation: [0, 0, 0.14], scale: [1, 1, 0.4] }),
    part(leaf, husk, { position: [0.1, -0.15, 0.06], rotation: [0, 0, -0.14], scale: [1, 1, 0.4] }),
    part(leaf, husk, { position: [0, -0.15, -0.09], scale: [1.2, 1, 0.4] }),
  );
  return { body, front: 0.15, markY: 0, markScale: 1 };
}

// Dark splotch plus a light X on the front face: the non-colour hazard cue (the wobble is the other).
function addHazardMarkings(shape: ItemShape): void {
  const { body, front, markY, markScale } = shape;
  const marker = new THREE.Group();
  marker.name = 'hazardMarker';
  const bar = box(0.34, 0.07, 0.03);
  const mark = lambert(HAZARD_MARK);
  marker.add(
    part(sphere(0.14, 8, 6), lambert(HAZARD_SPLOTCH), { position: [0.13, -0.12, -0.02], scale: [1, 0.8, 0.3] }),
    part(bar, mark, { rotation: [0, 0, Math.PI / 4] }),
    part(bar, mark, { rotation: [0, 0, -Math.PI / 4] }),
  );
  marker.position.set(0, markY, front + 0.02);
  marker.scale.setScalar(markScale);
  body.add(marker);
}

function buildShape(type: ItemTypeId): ItemShape {
  const { colorKey } = ITEM_DEFINITIONS[type];
  switch (type) {
    case 'tomato':
      return tomatoShape(colorKey, '#3f8f2f', 0.88);
    case 'pepper':
      return pepperShape(colorKey, '#3f8f2f');
    case 'onion':
      return onionShape();
    case 'plantain':
      return plantainShape();
    case 'corn':
      return cornShape();
    case 'rottenTomato':
      // Slightly deflated, with a dead stem.
      return tomatoShape(colorKey, HAZARD_STEM, 0.78);
    case 'rottenPepper':
      return pepperShape(colorKey, HAZARD_STEM);
  }
}

// Outer group: positioned by render/ at the item's x/y and spun by the wobble.
// Inner `model` child: the tilted mesh. The hitbox stays in game/ (ITEM_DEFINITIONS), not on the mesh.
export function createItemModel(type: ItemTypeId, phase = 0): THREE.Group {
  const shape = buildShape(type);
  const hazard = ITEM_DEFINITIONS[type].kind === 'hazard';
  if (hazard) addHazardMarkings(shape);

  const model = shape.body;
  model.name = 'model';
  model.rotation.x = ITEM_TILT;

  const root = new THREE.Group();
  root.name = type;
  root.userData = { type, hazard, phase };
  root.add(model);
  return root;
}

// Hazards rock side to side; fresh produce stays still. `motion` 0 disables it (reduced motion).
export function animateItemModel(root: THREE.Object3D, timeSeconds: number, motion = 1): void {
  if (!root.userData.hazard) return;
  const phase = (root.userData.phase as number | undefined) ?? 0;
  root.rotation.z = Math.sin(timeSeconds * HAZARD_WOBBLE_SPEED + phase) * HAZARD_WOBBLE_ANGLE * motion;
}

// Open woven basket: tapered wicker walls, a darker inside so the mouth reads, weave bands, rim and two handles.
export function createBasketModel(): THREE.Group {
  const topRadius = BASKET_WIDTH / 2;
  const bottomRadius = topRadius * 0.76;
  const half = BASKET_HEIGHT / 2;
  const wicker = lambert('#c8893e');
  const weave = lambert('#8a5a2b');

  const walls = geometry('basket:walls', () => new THREE.CylinderGeometry(topRadius, bottomRadius, BASKET_HEIGHT, 12, 1, true));
  const band = (radius: number) =>
    geometry(`basket:band:${radius}`, () => new THREE.TorusGeometry(radius, 0.03, 4, 16));
  const lerpRadius = (y: number) => bottomRadius + ((y + half) / BASKET_HEIGHT) * (topRadius - bottomRadius);
  const handle = geometry('basket:handle', () => new THREE.TorusGeometry(0.2, 0.05, 5, 10, Math.PI));
  const flat: [number, number, number] = [Math.PI / 2, 0, 0];

  const model = new THREE.Group();
  model.name = 'model';
  model.add(
    part(walls, wicker),
    part(walls, lambert('#6b3f1a', THREE.BackSide)),
    part(geometry('basket:floor', () => new THREE.CircleGeometry(bottomRadius, 12)), lambert('#6b3f1a'), {
      position: [0, -half, 0],
      rotation: [-Math.PI / 2, 0, 0],
    }),
    part(band(lerpRadius(-0.13)), weave, { position: [0, -0.13, 0], rotation: flat }),
    part(band(lerpRadius(0.13)), weave, { position: [0, 0.13, 0], rotation: flat }),
    part(geometry('basket:rim', () => new THREE.TorusGeometry(topRadius, 0.06, 6, 16)), weave, {
      position: [0, half, 0],
      rotation: flat,
    }),
    // Loops stand on the rim's back half and lean back, so they arch above the mouth instead of inside it.
    part(handle, weave, { position: [-0.55, half + 0.02, -0.35], rotation: [-0.5, 0, 0] }),
    part(handle, weave, { position: [0.55, half + 0.02, -0.35], rotation: [-0.5, 0, 0] }),
  );
  model.rotation.x = BASKET_TILT;

  const root = new THREE.Group();
  root.name = 'basket';
  root.add(model);
  return root;
}

export function modelResourceCounts(): { geometries: number; materials: number } {
  return { geometries: geometries.size, materials: materials.size };
}

// For full teardown (NMH-23). Models created afterwards rebuild the shared resources.
export function disposeModelResources(): void {
  for (const shared of geometries.values()) shared.dispose();
  for (const shared of materials.values()) shared.dispose();
  geometries.clear();
  materials.clear();
}
