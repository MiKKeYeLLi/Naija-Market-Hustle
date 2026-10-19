import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEM_TYPES, createItemIdMinter } from '../game/items';
import { Spawner, moveItems, removeExitedItems } from '../game/spawner';
import { ROUND_DURATION, createInitialState, type GameState } from '../game/state';
import { PARTICLE_POOL } from './effects';
import { createBasketModel, createItemModel } from './models';

// Draw calls in the live scene: one per mesh. The backdrop is drawn once per resize (NMH-20), and the
// particles are one instanced mesh.
const meshCount = (root: THREE.Object3D) => {
  let n = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) n++;
  });
  return n;
};

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The most items on screen at once over a full round with nothing caught (the worst case: every
// item stays until it falls out of the bottom).
function maxItemsInFlight(seed: number): number {
  const state: GameState = { ...createInitialState(), status: 'playing' };
  const spawner = new Spawner(createItemIdMinter(), seeded(seed));
  const dt = 1 / 60;
  let most = 0;
  for (let frame = 0; frame < ROUND_DURATION * 60; frame++) {
    moveItems(state, dt);
    removeExitedItems(state);
    spawner.update(state, dt);
    state.timeRemaining = Math.max(0, state.timeRemaining - dt);
    most = Math.max(most, state.items.length);
  }
  return most;
}

describe('draw call budget', () => {
  it('stays under 100 even in the worst case', () => {
    const inFlight = Math.max(...[1, 2, 3, 4, 5].map(maxItemsInFlight));
    const heaviestItem = Math.max(...ITEM_TYPES.map((item) => meshCount(createItemModel(item.id))));
    const basket = meshCount(createBasketModel());
    const particles = 1;
    const worst = inFlight * heaviestItem + basket + particles;

    // Recorded for the PR: about 5 items at most, each at most 6 meshes, plus the basket.
    expect(inFlight).toBeLessThanOrEqual(6);
    expect(heaviestItem).toBeLessThanOrEqual(6);
    expect(worst).toBeLessThan(100);
    expect(PARTICLE_POOL).toBeGreaterThan(0);
  });
});
