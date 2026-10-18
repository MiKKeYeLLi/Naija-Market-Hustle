import { describe, expect, it } from 'vitest';
import { Game, MAX_STEP_MS, type FrameScheduler } from './Game';
import { ITEM_DEFINITIONS, createItemIdMinter } from './items';
import { DIFFICULTY_ANCHORS, FALL_DISTANCE, Spawner, difficultyAt, moveItems, phaseAt, removeExitedItems, type Phase } from './spawner';
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

const KEYS = ['fallTime', 'spawnInterval', 'hazardShare'] as const;

describe('difficulty curve', () => {
  it('matches the PRD anchor table at 90, 60, 30 and 0 s', () => {
    const table = [
      [90, 3.2, 1.1, 0.15],
      [60, 2.4, 0.85, 0.2],
      [30, 1.8, 0.65, 0.25],
      [0, 1.4, 0.5, 0.35],
    ];
    for (const [time, fallTime, spawnInterval, hazardShare] of table) {
      const settings = difficultyAt(time);
      expect(settings.fallTime).toBeCloseTo(fallTime, 9);
      expect(settings.spawnInterval).toBeCloseTo(spawnInterval, 9);
      expect(settings.hazardShare).toBeCloseTo(hazardShare, 9);
    }
  });

  it('interpolates linearly between anchors', () => {
    // Midpoints of each segment are the averages of their anchors.
    for (let i = 1; i < DIFFICULTY_ANCHORS.length; i++) {
      const [a, b] = [DIFFICULTY_ANCHORS[i - 1], DIFFICULTY_ANCHORS[i]];
      const mid = difficultyAt((a.timeRemaining + b.timeRemaining) / 2);
      for (const key of KEYS) expect(mid[key]).toBeCloseTo((a[key] + b[key]) / 2, 9);
    }
    // A quarter of the way from 60 s to 30 s.
    expect(difficultyAt(52.5).fallTime).toBeCloseTo(2.4 - 0.25 * 0.6, 9);
  });

  it('has no jump anywhere, including the phase boundaries', () => {
    // Largest per-step change in any segment is (anchor delta / 30 s) x step; a jump would dwarf it.
    const step = 0.001;
    for (let t = ROUND_DURATION; t > step; t -= step) {
      const [now, next] = [difficultyAt(t), difficultyAt(t - step)];
      for (const key of KEYS) expect(Math.abs(next[key] - now[key])).toBeLessThan(0.0002);
    }
    for (const boundary of [60, 30]) {
      const [before, after] = [difficultyAt(boundary + 1e-9), difficultyAt(boundary - 1e-9)];
      for (const key of KEYS) expect(after[key]).toBeCloseTo(before[key], 6);
    }
  });

  it('only ever gets harder as time runs down', () => {
    let previous = difficultyAt(ROUND_DURATION);
    for (let t = ROUND_DURATION - 0.5; t >= 0; t -= 0.5) {
      const now = difficultyAt(t);
      expect(now.fallTime).toBeLessThanOrEqual(previous.fallTime);
      expect(now.spawnInterval).toBeLessThanOrEqual(previous.spawnInterval);
      expect(now.hazardShare).toBeGreaterThanOrEqual(previous.hazardShare);
      previous = now;
    }
  });

  it('clamps outside the round', () => {
    expect(difficultyAt(120)).toEqual(difficultyAt(90));
    expect(difficultyAt(-5)).toEqual(difficultyAt(0));
  });

  it('keeps every anchor below a 50% hazard share', () => {
    for (const anchor of DIFFICULTY_ANCHORS) expect(anchor.hazardShare).toBeLessThan(0.5);
  });
});

describe('phases', () => {
  it('runs warm-up 90–61, rush hour 60–31, market madness 30–0', () => {
    expect([90, 61, 60.01].map(phaseAt)).toEqual(['warmUp', 'warmUp', 'warmUp']);
    expect([60, 45, 31, 30.01].map(phaseAt)).toEqual(['rushHour', 'rushHour', 'rushHour', 'rushHour']);
    expect([30, 10, 0].map(phaseAt)).toEqual(['marketMadness', 'marketMadness', 'marketMadness']);
  });
});

describe('spawning along the curve', () => {
  // Plays a full round of spawning only (no basket), collecting every spawned item.
  function fullRound(seed: number) {
    const state: GameState = { ...createInitialState(), status: 'playing' };
    const spawner = new Spawner(createItemIdMinter(), seeded(seed));
    const dt = 1 / 60;
    const spawned: Array<{ type: string; speed: number; at: number }> = [];
    const seen = new Set<number>();
    for (let frame = 0; frame < ROUND_DURATION * 60; frame++) {
      moveItems(state, dt);
      removeExitedItems(state);
      spawner.update(state, dt);
      state.timeRemaining = Math.max(0, state.timeRemaining - dt);
      for (const item of state.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        spawned.push({ type: item.type, speed: item.speed, at: state.timeRemaining });
      }
    }
    return spawned;
  }

  it('makes fresh items outnumber hazards in every phase and over the whole round', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const spawned = fullRound(seed);
      const byPhase = new Map<Phase, { fresh: number; hazard: number }>();
      for (const { type, at } of spawned) {
        const phase = phaseAt(at);
        const counts = byPhase.get(phase) ?? { fresh: 0, hazard: 0 };
        counts[ITEM_DEFINITIONS[type as keyof typeof ITEM_DEFINITIONS].kind === 'fresh' ? 'fresh' : 'hazard'] += 1;
        byPhase.set(phase, counts);
      }
      expect(byPhase.size).toBe(3);
      for (const { fresh, hazard } of byPhase.values()) expect(fresh).toBeGreaterThan(hazard);
    }
  });

  it('speeds items up and spawns them faster as the round goes on', () => {
    const spawned = fullRound(9);
    const first = spawned.filter((s) => s.at > 80);
    const last = spawned.filter((s) => s.at < 10);
    // Fall speeds follow the curve: 3.2 s at the start, 1.4 s at the end.
    expect(first[0].speed).toBeCloseTo(FALL_DISTANCE / 3.2, 1);
    expect(last.at(-1)!.speed).toBeCloseTo(FALL_DISTANCE / 1.4, 1);
    // About 10 s / 1.1 s at the start versus 10 s / ~0.53 s at the end.
    expect(first.length).toBeLessThan(11);
    expect(last.length).toBeGreaterThan(17);
  });
});

describe('phase changes in the game loop', () => {
  function setup() {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const changes: Array<[Phase, Phase, number]> = [];
    let game: Game;
    // random 0: only hazards in the far-left lane, so lives never run out and the round plays to time.
    game = new Game({
      scheduler,
      random: () => 0,
      onPhaseChange: (phase, previous) => changes.push([phase, previous, +game.state.timeRemaining.toFixed(2)]),
    });
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame(16);
    return { game, frame, changes };
  }

  it('fires once at 60 s and once at 30 s, then nothing more', () => {
    const { game, frame, changes } = setup();
    game.start();
    for (let i = 0; i < (ROUND_DURATION * 1000) / MAX_STEP_MS + 50; i++) frame(MAX_STEP_MS);
    expect(game.state.status).toBe('gameOver');
    expect(changes.map(([phase, previous]) => [phase, previous])).toEqual([
      ['rushHour', 'warmUp'],
      ['marketMadness', 'rushHour'],
    ]);
    // Within one frame of each boundary.
    expect(changes[0][2]).toBeLessThanOrEqual(60);
    expect(changes[0][2]).toBeGreaterThanOrEqual(60 - MAX_STEP_MS / 1000); // times rounded to 2 dp
    expect(changes[1][2]).toBeLessThanOrEqual(30);
    expect(changes[1][2]).toBeGreaterThanOrEqual(30 - MAX_STEP_MS / 1000);
    expect(game.state.phase).toBe('marketMadness');
  });

  it('exposes the current phase on state and resets it without a banner', () => {
    const { game, frame, changes } = setup();
    game.start();
    frame(16);
    expect(game.state.phase).toBe('warmUp');
    (game.state as GameState).timeRemaining = 45;
    frame(16);
    expect(game.state.phase).toBe('rushHour');
    expect(changes).toHaveLength(1);

    game.reset();
    expect(game.state.phase).toBe('warmUp');
    expect(changes).toHaveLength(1);
  });

  it('does not change phase while paused', () => {
    const { game, frame, changes } = setup();
    game.start();
    frame(16);
    game.pause();
    (game.state as GameState).timeRemaining = 45;
    for (let i = 0; i < 20; i++) frame(16);
    expect(changes).toHaveLength(0);
    expect(game.state.phase).toBe('warmUp');
  });

  it('shows no banner when the round ends on the frame it would cross a boundary', () => {
    const { game, frame, changes } = setup();
    game.start();
    frame(16);
    const state = game.state as GameState;
    state.timeRemaining = 60.005;
    state.lives = 0; // out of lives this frame
    frame(16);
    expect(game.state.status).toBe('gameOver');
    expect(changes).toHaveLength(0);
  });
});
