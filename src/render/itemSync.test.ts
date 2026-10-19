import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FallingItem } from '../game/state';
import { ItemMeshSync } from './itemSync';

const item = (id: number, type: FallingItem['type'], y = 0): FallingItem => ({ id, type, x: id, y, speed: 1, resolved: false });

describe('ItemMeshSync', () => {
  it('creates, moves and removes meshes in step with the item list', () => {
    const scene = new THREE.Scene();
    const sync = new ItemMeshSync(scene);

    sync.sync([item(1, 'tomato'), item(2, 'rottenPepper')], 0);
    expect(sync.size).toBe(2);
    expect(scene.children).toHaveLength(2);
    const first = scene.children.find((child) => child.userData.type === 'tomato')!;

    sync.sync([item(1, 'tomato', -3), item(3, 'corn')], 0.1);
    expect(sync.size).toBe(2);
    expect(scene.children.map((child) => child.userData.type).sort()).toEqual(['corn', 'tomato']);
    // Same mesh object for the same ID, moved to the new position.
    expect(scene.children).toContain(first);
    expect(first.position.y).toBe(-3);

    sync.clear();
    expect(sync.size).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('wobbles hazard meshes and respects motion = 0', () => {
    const scene = new THREE.Scene();
    const sync = new ItemMeshSync(scene);
    sync.sync([item(5, 'rottenTomato')], 0.2);
    const hazard = scene.children[0];
    expect(hazard.rotation.z).not.toBe(0);
    sync.sync([item(5, 'rottenTomato')], 0.2, 0);
    expect(hazard.rotation.z).toBe(0);
  });
});

describe('ItemMeshSync pooling', () => {
  it('reuses parked models, so models built stay at the most ever on screen at once', () => {
    const scene = new THREE.Scene();
    const sync = new ItemMeshSync(scene);
    let id = 1;
    // 200 waves of three tomatoes and a rotten pepper, each wave replacing the last.
    for (let wave = 0; wave < 200; wave++) {
      sync.sync([item(id++, 'tomato'), item(id++, 'tomato'), item(id++, 'tomato'), item(id++, 'rottenPepper')], wave * 0.1);
    }
    expect(sync.size).toBe(4);
    expect(scene.children).toHaveLength(4);
    // Two waves overlap during the swap, at most: 3+3 tomatoes and 1+1 peppers.
    expect(sync.created).toBeLessThanOrEqual(8);
    sync.clear();
    expect(scene.children).toHaveLength(0);
    expect(sync.pooled).toBe(sync.created);
  });

  it('gives a reused hazard model a fresh wobble phase and no leftover tilt', () => {
    const scene = new THREE.Scene();
    const sync = new ItemMeshSync(scene);
    sync.sync([item(1, 'rottenTomato')], 0.3);
    const model = scene.children[0];
    expect(model.rotation.z).not.toBe(0);
    sync.sync([], 0.3);
    sync.sync([item(2, 'rottenTomato')], 0.3, 0);
    expect(scene.children[0]).toBe(model);
    expect(model.userData.phase).toBe(2);
    expect(Math.abs(model.rotation.z)).toBe(0); // sin(..) x 0 can be -0
  });

  it('never hands a parked model to a different item type', () => {
    const scene = new THREE.Scene();
    const sync = new ItemMeshSync(scene);
    sync.sync([item(1, 'corn')], 0);
    sync.sync([], 0);
    sync.sync([item(2, 'onion')], 0);
    expect(scene.children[0].userData.type).toBe('onion');
    expect(sync.created).toBe(2);
  });
});
