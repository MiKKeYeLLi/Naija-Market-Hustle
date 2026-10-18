import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, createItemIdMinter } from './items';
import { BASKET_MAX_SPEED, BASKET_MOUTH } from './playArea';
import {
  LANES,
  MAX_HAZARD_STREAK,
  Spawner,
  difficultyAt,
  isReachable,
  moveItems,
  removeExitedItems,
} from './spawner';
import { ROUND_DURATION, createInitialState, type GameState } from './state';

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

interface Spawned {
  id: number;
  x: number;
  hazard: boolean;
  arrival: number;
}

// Headless spawner run. `timeRemaining` fixed (0 = the fastest settings) or null to play a full
// round with the curve. Arrival at the mouth is measured from each item's own first position.
function run(options: { spawns?: number; seed: number; timeRemaining: number | null; random?: () => number }) {
  const state: GameState = { ...createInitialState(), status: 'playing' };
  if (options.timeRemaining !== null) state.timeRemaining = options.timeRemaining;
  const spawner = new Spawner(createItemIdMinter(), options.random ?? seeded(options.seed));
  const dt = 1 / 60;
  const spawned: Spawned[] = [];
  const seen = new Set<number>();
  let now = 0;
  for (let frame = 0; frame < 1_000_000; frame++) {
    if (options.spawns !== undefined && spawned.length >= options.spawns) break;
    if (options.spawns === undefined && frame >= ROUND_DURATION * 60) break;
    moveItems(state, dt);
    removeExitedItems(state);
    spawner.update(state, dt);
    now += dt;
    if (options.timeRemaining === null) state.timeRemaining = Math.max(0, state.timeRemaining - dt);
    for (const item of state.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      spawned.push({
        id: item.id,
        x: item.x,
        hazard: ITEM_DEFINITIONS[item.type].kind === 'hazard',
        arrival: now + (item.y - BASKET_MOUTH.centerY) / item.speed,
      });
    }
  }
  return spawned.sort((a, b) => a.id - b.id);
}

const unreachablePairs = (items: Spawned[]) =>
  items.slice(1).filter((item, i) => !isReachable(items[i].x, items[i].arrival, item.x, item.arrival));

const longestHazardStreak = (items: Spawned[]) => {
  let longest = 0;
  let streak = 0;
  for (const item of items) {
    streak = item.hazard ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  return longest;
};

describe('hazard streaks', () => {
  it('never spawns more than two hazards in a row, even if every roll says hazard', () => {
    // random 0 always wins the hazard roll; the guard must break each streak at two.
    const items = run({ spawns: 300, seed: 0, timeRemaining: 0, random: () => 0 });
    expect(items.map((item) => (item.hazard ? 'H' : 'F')).join('').slice(0, 12)).toBe('HHFHHFHHFHHF');
    expect(longestHazardStreak(items)).toBe(MAX_HAZARD_STREAK);
  });

  it('holds over long seeded runs at the highest hazard share', () => {
    for (const seed of [1, 2, 3]) {
      const items = run({ spawns: 10_000, seed, timeRemaining: 0 });
      expect(longestHazardStreak(items)).toBeLessThanOrEqual(MAX_HAZARD_STREAK);
      // The guard only trims streaks; hazards are still common at 35%.
      expect(items.filter((item) => item.hazard).length / items.length).toBeGreaterThan(0.25);
    }
  });
});

describe('lane reachability', () => {
  it('1,000 spawns at the fastest settings produce no unreachable pair', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const items = run({ spawns: 1000, seed, timeRemaining: 0 });
      expect(items).toHaveLength(1000);
      expect(unreachablePairs(items)).toEqual([]);
    }
  });

  it('would produce unreachable pairs without the guard (the test can tell)', () => {
    // Same fastest settings, purely random lanes: edge-to-edge pairs (7.2 units) need 0.6 s but
    // arrive 0.5 s apart.
    const random = seeded(11);
    const gap = difficultyAt(0).spawnInterval;
    const lanes = Array.from({ length: 1000 }, () => LANES[Math.floor(random() * LANES.length)]);
    const violations = lanes.slice(1).filter((x, i) => Math.abs(x - lanes[i]) > BASKET_MAX_SPEED * gap);
    expect(violations.length).toBeGreaterThan(10);
  });

  it('keeps every pair reachable across full rounds on the curve', () => {
    for (const seed of [21, 22, 23, 24, 25]) {
      const items = run({ seed, timeRemaining: null });
      expect(items.length).toBeGreaterThan(100);
      expect(unreachablePairs(items)).toEqual([]);
      expect(longestHazardStreak(items)).toBeLessThanOrEqual(MAX_HAZARD_STREAK);
    }
  });

  it('still uses every lane', () => {
    const items = run({ spawns: 2000, seed: 31, timeRemaining: 0 });
    expect(new Set(items.map((item) => item.x)).size).toBe(LANES.length);
  });

  it('falls back to the nearest reachable lane when every retry is unreachable', () => {
    // Scripted rolls. Item 1: fresh, tomato, rightmost lane. Item 2: fresh, tomato, then three
    // leftmost-lane picks, all too far (7.2 units in 0.5 s, reach 6).
    const rolls = [0.9, 0, 0.99, 0.9, 0, 0, 0, 0];
    const random = () => rolls.shift() ?? 0.5;
    const items = run({ spawns: 2, seed: 0, timeRemaining: 0, random });
    expect(items[0].x).toBeCloseTo(LANES[6], 9);
    // Nearest reachable lane to the rejected far-left pick: one lane in from the edge.
    expect(items[1].x).toBeCloseTo(LANES[1], 9);
    expect(isReachable(items[0].x, items[0].arrival, items[1].x, items[1].arrival)).toBe(true);
    expect(rolls).toEqual([]); // all three retries were used
  });

  it('accepts a reachable retry without falling back', () => {
    // Item 2's first pick is the unreachable far-left lane, the second a reachable middle lane.
    const rolls = [0.9, 0, 0.99, 0.9, 0, 0, 0.5];
    const random = () => rolls.shift() ?? 0.5;
    const items = run({ spawns: 2, seed: 0, timeRemaining: 0, random });
    expect(items[1].x).toBeCloseTo(LANES[3], 9);
  });
});

describe('isReachable', () => {
  it('compares the lane distance with basket speed x the arrival gap, either way round', () => {
    expect(isReachable(0, 1, 6, 1.5)).toBe(true); // exactly 12 u/s x 0.5 s
    expect(isReachable(0, 1, 6.01, 1.5)).toBe(false);
    expect(isReachable(0, 1.5, 6, 1)).toBe(true); // later item arriving first
    expect(isReachable(2, 1, 2, 1)).toBe(true); // same lane, same moment
  });
});

describe('reset', () => {
  it('clears the streak and the previous lane between rounds', () => {
    const state: GameState = { ...createInitialState(), status: 'playing', timeRemaining: 0 };
    const spawner = new Spawner(createItemIdMinter(), () => 0);
    for (let i = 0; i < 2; i++) spawner.update(state, 0.5); // two hazards: streak at the limit
    spawner.reset();
    state.items = [];
    spawner.update(state, 0.4); // first spawn of the new round
    expect(ITEM_DEFINITIONS[state.items[0].type].kind).toBe('hazard');
  });
});
