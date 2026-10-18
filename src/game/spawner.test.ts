import { describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from './Game';
import { FRESH_ITEMS, ITEM_DEFINITIONS, createItemIdMinter } from './items';
import { BASKET_MOUTH, PLAY_AREA, clampBasketX } from './playArea';
import {
  FALL_DISTANCE,
  FIRST_SPAWN_DELAY,
  LANES,
  Spawner,
  WARM_UP,
  moveItems,
  removeExitedItems,
  fallSpeed,
  weightedPick,
} from './spawner';
import { createInitialState, type GameState } from './state';

// Small deterministic PRNG (mulberry32) so long runs are repeatable.
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

function playingState(): GameState {
  const state = createInitialState();
  state.status = 'playing';
  return state;
}

// Runs spawning and falling for `seconds` at a fixed frame rate, collecting every item ever spawned.
function simulate(seconds: number, fps: number, seed = 1) {
  const state = playingState();
  const spawner = new Spawner(createItemIdMinter(), seeded(seed));
  const dt = 1 / fps;
  const spawned = new Map<number, string>();
  // Whole frames, so float drift in a running total can't add or drop one.
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    moveItems(state, dt);
    removeExitedItems(state);
    spawner.update(state, dt);
    for (const item of state.items) spawned.set(item.id, item.type);
  }
  return { state, spawned };
}

describe('Spawner', () => {
  it('spawns above the top edge in a lane, unresolved, at the warm-up speed', () => {
    const state = playingState();
    new Spawner(createItemIdMinter(), seeded(3)).update(state, FIRST_SPAWN_DELAY);
    expect(state.items).toHaveLength(1);
    const [item] = state.items;
    const { height } = ITEM_DEFINITIONS[item.type];
    expect(item.y - height / 2).toBeCloseTo(PLAY_AREA.top, 9);
    expect(LANES).toContain(item.x);
    expect(item.resolved).toBe(false);
    expect(item.speed).toBeCloseTo(FALL_DISTANCE / WARM_UP.fallTime, 9);
  });

  it('takes the warm-up fall time to fall from the top edge to the basket mouth', () => {
    const speed = fallSpeed(WARM_UP);
    expect((PLAY_AREA.top - BASKET_MOUTH.centerY) / speed).toBeCloseTo(3.2, 9);
  });

  it('spawns on delta time, not frame count', () => {
    const counts = [20, 30, 60, 144].map((fps) => simulate(30, fps).spawned.size);
    // 0.4 s delay, then one every 1.1 s: 27 spawns in 30 s at any frame rate.
    const expected = Math.floor((30 - FIRST_SPAWN_DELAY) / WARM_UP.spawnInterval) + 1;
    expect(counts).toEqual(counts.map(() => expected));
  });

  it('places items identically at any frame rate', () => {
    const [base, ...others] = [30, 60, 120].map((fps) => simulate(10, fps).state.items);
    expect(base.length).toBeGreaterThan(2);
    for (const items of others) {
      expect(items.map((item) => [item.id, item.type, item.x])).toEqual(base.map((item) => [item.id, item.type, item.x]));
      items.forEach((item, i) => expect(item.y).toBeCloseTo(base[i].y, 9));
    }
  });

  it('makes fresh items outnumber hazards over a long run, near the 15% hazard share', () => {
    const { spawned } = simulate(1100, 60, 42); // about 1,000 spawns
    const types = [...spawned.values()];
    const hazards = types.filter((type) => ITEM_DEFINITIONS[type as keyof typeof ITEM_DEFINITIONS].kind === 'hazard');
    expect(types.length).toBeGreaterThan(990);
    expect(types.length - hazards.length).toBeGreaterThan(hazards.length);
    expect(hazards.length / types.length).toBeGreaterThan(0.11);
    expect(hazards.length / types.length).toBeLessThan(0.19);
  });

  it('uses every lane, and every lane is within the basket reach', () => {
    const { spawned, state } = simulate(300, 30, 7);
    expect(spawned.size).toBeGreaterThan(200);
    const xs = new Set(state.items.map((item) => item.x));
    for (const x of xs) expect(clampBasketX(x)).toBe(x);
    expect(LANES).toHaveLength(7);
    for (const lane of LANES) expect(clampBasketX(lane)).toBeCloseTo(lane, 9);
  });

  it('gives every spawned item a unique id', () => {
    const state = playingState();
    const spawner = new Spawner(createItemIdMinter(), seeded(9));
    const ids: number[] = [];
    for (let i = 0; i < 2000; i++) {
      spawner.update(state, 0.05);
      ids.push(...state.items.map((item) => item.id));
      state.items = [];
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('restarts the first-spawn delay on reset', () => {
    const state = playingState();
    const spawner = new Spawner(createItemIdMinter(), seeded(1));
    spawner.update(state, 0.3);
    spawner.reset();
    spawner.update(state, 0.3);
    expect(state.items).toHaveLength(0);
    spawner.update(state, 0.11);
    expect(state.items).toHaveLength(1);
  });
});

describe('weightedPick', () => {
  it('follows the fresh weights 25/20/20/10/25', () => {
    const random = seeded(5);
    const counts = new Map<string, number>();
    const draws = 50_000;
    for (let i = 0; i < draws; i++) {
      const { id } = weightedPick(FRESH_ITEMS, random);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const item of FRESH_ITEMS) {
      expect((counts.get(item.id) ?? 0) / draws).toBeCloseTo(item.spawnWeight / 100, 1);
    }
  });
});

describe('moveItems and removeExitedItems', () => {
  it('falls by speed x dt and removes items once fully below the bottom edge', () => {
    const state = playingState();
    state.items.push({ id: 1, type: 'tomato', x: 0, y: 0, speed: 2, resolved: false });
    moveItems(state, 0.5);
    expect(state.items[0].y).toBe(-1);

    state.items[0].y = PLAY_AREA.bottom - 0.39; // top edge still 0.01 inside
    expect(removeExitedItems(state)).toEqual([]);
    moveItems(state, 0.01);
    const exited = removeExitedItems(state);
    expect(exited.map((item) => item.id)).toEqual([1]);
    expect(state.items).toHaveLength(0);
  });

  it('moves without removing, so collision can run in between', () => {
    const state = playingState();
    state.items.push({ id: 1, type: 'tomato', x: 0, y: PLAY_AREA.bottom, speed: 2, resolved: false });
    moveItems(state, 1);
    expect(state.items).toHaveLength(1);
  });
});

describe('Game integration', () => {
  function steppedGame() {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const game = new Game({ scheduler, random: seeded(11) });
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame(16);
    return { game, frame };
  }

  it('spawns and moves items only while playing, and reset clears them', () => {
    const { game, frame } = steppedGame();
    for (let i = 0; i < 100; i++) frame(16);
    expect(game.state.items).toHaveLength(0);

    game.start();
    for (let i = 0; i < 150; i++) frame(16);
    expect(game.state.items.length).toBeGreaterThan(0);

    game.pause();
    const frozen = JSON.stringify(game.state.items);
    for (let i = 0; i < 100; i++) frame(16);
    expect(JSON.stringify(game.state.items)).toBe(frozen);

    game.reset();
    expect(game.state.items).toHaveLength(0);
  });

  it('keeps ids unique across restarts', () => {
    const { game, frame } = steppedGame();
    const ids = new Set<number>();
    let total = 0;
    for (let round = 0; round < 5; round++) {
      game.start();
      for (let i = 0; i < 200; i++) {
        frame(16);
        for (const item of game.state.items) if (!ids.has(item.id)) (ids.add(item.id), total++);
      }
      game.reset();
    }
    expect(total).toBeGreaterThan(10);
    expect(ids.size).toBe(total);
  });
});
