import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ItemMeshSync } from '../render/itemSync';
import { createItemModel, modelResourceCounts } from '../render/models';
import { ITEM_TYPES } from './items';
import { KeyboardControls, PauseControls, PointerControls } from './controls';
import { Game, type FrameScheduler } from './Game';
import { ROUND_DURATION, type GameState } from './state';

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

// Counts listeners per event type, like the browser's getEventListeners.
class CountingTarget extends EventTarget {
  visibilityState = 'visible';
  counts = new Map<string, number>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    this.counts.set(type, (this.counts.get(type) ?? 0) + 1);
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    this.counts.set(type, (this.counts.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener, options);
  }
  get total() {
    return [...this.counts.values()].reduce((a, b) => a + b, 0);
  }
}

// The game wired the way main.ts wires it: one scene, one mesh sync, controls attached once,
// Play Again = reset + start, onReset as the single teardown.
function wiredGame(random: () => number = seeded(3)) {
  let time = 0;
  const pending = new Map<number, () => void>();
  let nextHandle = 1;
  const scheduler: FrameScheduler = {
    now: () => time,
    request: (cb) => {
      pending.set(nextHandle, cb);
      return nextHandle++;
    },
    cancel: (handle) => {
      pending.delete(handle);
    },
  };
  const frame = (ms = 50) => {
    time += ms;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const cb of callbacks) cb();
  };

  const scene = new THREE.Scene();
  const items = new ItemMeshSync(scene);
  const window = new CountingTarget();
  const canvas = new CountingTarget();
  const keyboard = new KeyboardControls(window);
  keyboard.attach();
  let teardowns = 0;
  const game = new Game({
    scheduler,
    random,
    steering: keyboard,
    bestScore: 2000,
    onReset: () => {
      teardowns++;
      items.clear();
    },
    render: (state) => items.sync(state.items, 0),
  });
  new PointerControls(canvas, game, (x) => x).attach();
  new PauseControls(window, window, game).attach();
  frame();
  const playAgain = () => {
    game.reset();
    game.start();
  };
  return { game, frame, scene, items, window, canvas, pending, playAgain, teardowns: () => teardowns };
}

describe('Play Again', () => {
  it('resets time to 90, cash to ₦0 and lives to 3, keeping the best score', () => {
    // 0.5: fresh items in the centre lane under the still basket, so the round is still running.
    const { game, frame, playAgain } = wiredGame(() => 0.5);
    game.start();
    for (let i = 0; i < 200; i++) frame(); // ten seconds of play
    expect(game.state.status).toBe('playing');
    const state = game.state as GameState;
    Object.assign(state, { cash: 4500, lives: 1, freshCaught: 30, rottenCaught: 2 });
    state.timeRemaining = 0.01;
    frame();
    expect(game.state.status).toBe('gameOver');
    expect(game.state.bestScore).toBe(4500);

    playAgain();
    expect(game.state.status).toBe('playing');
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);
    expect([game.state.cash, game.state.lives]).toEqual([0, 3]);
    expect([game.state.freshCaught, game.state.rottenCaught, game.state.items.length]).toEqual([0, 0, 0]);
    expect([game.state.endReason, game.state.isNewBest, game.state.phase]).toEqual([null, false, 'warmUp']);
    expect(game.state.bestScore).toBe(4500);
  });

  it('removes every item mesh through the single teardown, before the next frame', () => {
    const { game, frame, scene, items, playAgain, teardowns } = wiredGame();
    game.start();
    for (let i = 0; i < 200; i++) frame();
    expect(items.size).toBeGreaterThan(0);
    const before = scene.children.length;
    expect(before).toBe(items.size);

    playAgain();
    expect(teardowns()).toBe(1);
    expect(items.size).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('20 consecutive restarts', () => {
  it('leave one loop, one set of listeners and no leftover meshes or resources', () => {
    const { game, frame, scene, items, window, canvas, pending, playAgain, teardowns } = wiredGame();
    game.start();
    for (let i = 0; i < 100; i++) frame();
    const listenersBefore = { window: window.total, canvas: canvas.total };
    // Shared geometries and materials are cached per item type on first use; build every type once
    // so the count below measures leaks, not first appearances.
    for (const item of ITEM_TYPES) createItemModel(item.id);
    const resourcesBefore = modelResourceCounts();

    const meshesPerRound: number[] = [];
    for (let round = 0; round < 20; round++) {
      // A few seconds of play with items in flight, then restart mid-round or after the end.
      for (let i = 0; i < 80; i++) frame();
      meshesPerRound.push(scene.children.length);
      if (round % 2 === 0) (game.state as GameState).timeRemaining = 0.01;
      frame();
      playAgain();
      expect(pending.size).toBe(1); // exactly one frame queued: one loop
      expect(scene.children).toHaveLength(0);
    }

    expect(teardowns()).toBe(20);
    expect({ window: window.total, canvas: canvas.total }).toEqual(listenersBefore);
    expect(modelResourceCounts()).toEqual(resourcesBefore);
    // Meshes in flight stay bounded by what one round can hold, not growing with restarts.
    expect(Math.max(...meshesPerRound)).toBeLessThan(20);
    expect(items.size).toBe(0);
    expect(game.isLooping).toBe(true);
  });

  it('costs the same simulated work in the 20th round as in the first', () => {
    // Work per frame is proportional to items in flight; check it does not creep up across restarts.
    const { game, frame, playAgain } = wiredGame();
    const inFlightAt = (seconds: number) => {
      for (let i = 0; i < seconds * 20; i++) frame();
      return game.state.items.length;
    };
    game.start();
    const first = inFlightAt(8);
    let last = first;
    for (let round = 0; round < 20; round++) {
      playAgain();
      last = inFlightAt(8);
    }
    expect(Math.abs(last - first)).toBeLessThanOrEqual(3);
  });
});
