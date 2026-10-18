import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_TYPES, type ItemTypeId } from '../game/items';
import { BASKET_HEIGHT, BASKET_MOUTH, BASKET_WIDTH, BASKET_Y } from '../game/playArea';
import { animateItemModel, createBasketModel, createItemModel, modelResourceCounts } from './models';

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });
  return found;
}

// Size of the untilted body, which is what the hitbox describes.
function untiltedSize(root: THREE.Object3D): THREE.Vector3 {
  const model = root.getObjectByName('model')!;
  const tilt = model.rotation.x;
  model.rotation.x = 0;
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.rotation.x = tilt;
  return size;
}

describe('item models', () => {
  it.each(ITEM_TYPES.map((item) => item.id))('%s fits its hitbox', (type: ItemTypeId) => {
    const { width, height } = ITEM_DEFINITIONS[type];
    const size = untiltedSize(createItemModel(type));
    // Within 10% so the visible item and its hitbox agree at a glance.
    expect(size.x).toBeGreaterThan(width * 0.85);
    expect(size.x).toBeLessThan(width * 1.1);
    expect(size.y).toBeGreaterThan(height * 0.85);
    expect(size.y).toBeLessThan(height * 1.1);
  });

  it('marks hazards with an X and splotch, and only hazards', () => {
    for (const item of ITEM_TYPES) {
      const marker = createItemModel(item.id).getObjectByName('hazardMarker');
      expect(Boolean(marker), item.id).toBe(item.kind === 'hazard');
    }
  });

  it('wobbles hazards and leaves fresh produce still', () => {
    const hazard = createItemModel('rottenTomato');
    const fresh = createItemModel('tomato');
    const angles = [0.1, 0.3, 0.5].map((t) => {
      animateItemModel(hazard, t);
      animateItemModel(fresh, t);
      expect(fresh.rotation.z).toBe(0);
      return hazard.rotation.z;
    });
    expect(new Set(angles).size).toBe(3);

    animateItemModel(hazard, 0.3, 0); // reduced motion
    expect(hazard.rotation.z).toBe(0);
  });

  it('uses flat-shaded Lambert materials', () => {
    for (const item of ITEM_TYPES) {
      for (const mesh of meshes(createItemModel(item.id))) {
        expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
        expect((mesh.material as THREE.MeshLambertMaterial).flatShading).toBe(true);
      }
    }
  });
});

describe('shared resources', () => {
  it('creates geometries and materials once and reuses them', () => {
    for (const item of ITEM_TYPES) createItemModel(item.id);
    createBasketModel();
    const before = modelResourceCounts();

    const models = [...Array.from({ length: 50 }, (_, i) => createItemModel(ITEM_TYPES[i % ITEM_TYPES.length].id)), createBasketModel()];
    expect(modelResourceCounts()).toEqual(before);

    const [first, second] = [createItemModel('tomato'), createItemModel('tomato')].map(meshes);
    first.forEach((mesh, i) => {
      expect(mesh.geometry).toBe(second[i].geometry);
      expect(mesh.material).toBe(second[i].material);
    });
    expect(models.length).toBe(51);
  });
});

describe('basket model', () => {
  it('matches the basket footprint the game uses', () => {
    const basket = createBasketModel();
    const walls = meshes(basket)[0];
    const size = new THREE.Box3().setFromBufferAttribute(walls.geometry.getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(BASKET_WIDTH, 5);
    expect(size.y).toBeCloseTo(BASKET_HEIGHT, 5);
  });

  it('exports a mouth hitbox inside the rim', () => {
    expect(BASKET_MOUTH.width).toBeLessThan(BASKET_WIDTH);
    expect(BASKET_MOUTH.width).toBeGreaterThan(BASKET_WIDTH * 0.7);
    const rim = BASKET_Y + BASKET_HEIGHT / 2;
    expect(BASKET_MOUTH.centerY + BASKET_MOUTH.height / 2).toBeLessThanOrEqual(rim);
    expect(BASKET_MOUTH.centerY - BASKET_MOUTH.height / 2).toBeGreaterThan(BASKET_Y);
  });
});
