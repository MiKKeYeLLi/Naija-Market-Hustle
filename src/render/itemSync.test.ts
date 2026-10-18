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
