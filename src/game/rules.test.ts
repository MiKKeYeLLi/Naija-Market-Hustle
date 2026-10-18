import { describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from './Game';
import { FRESH_ITEMS, HAZARD_ITEMS, ITEM_DEFINITIONS, type ItemTypeId } from './items';
import { BASKET_MOUTH, PLAY_AREA } from './playArea';
import { applyCatch, applyEffect, applyMiss } from './rules';
import { removeExitedItems } from './spawner';
import { MAX_LIVES, createInitialState, type FallingItem, type GameState } from './state';

let nextId = 1;
const item = (type: ItemTypeId, x = 0, y = 0, speed = 4): FallingItem => ({ id: nextId++, type, x, y, speed, resolved: false });

function playing(cash = 0, lives = 3): GameState {
  const state = createInitialState();
  state.status = 'playing';
  state.cash = cash;
  state.lives = lives;
  return state;
}

describe('applyEffect', () => {
  it('never lets cash drop below zero', () => {
    const state = playing(50);
    expect(applyEffect(state, { cash: -150 })).toEqual({ cash: -50, lives: 0 });
    expect(state.cash).toBe(0);
    applyEffect(state, { cash: -1_000_000 });
    expect(state.cash).toBe(0);
  });

  it('keeps lives between 0 and 3', () => {
    const state = playing(0, 3);
    expect(applyEffect(state, { lives: 1 })).toEqual({ cash: 0, lives: 0 }); // a future life pickup at 3 lives
    expect(state.lives).toBe(MAX_LIVES);
    applyEffect(state, { lives: -10 });
    expect(state.lives).toBe(0);
  });

  it('clamps after every change, not on the running total', () => {
    const state = playing(100);
    applyEffect(state, { cash: -300 });
    applyEffect(state, { cash: 120 });
    // Debt is not carried: ₦100 − ₦300 floors at ₦0, then +₦120.
    expect(state.cash).toBe(120);
  });
});

describe('applyCatch', () => {
  it.each(FRESH_ITEMS.map((d) => [d.id, d.cashEffect] as const))('a caught %s adds exactly ₦%i and no life change', (type, value) => {
    const state = playing(250, 2);
    applyCatch(state, item(type));
    expect(state.cash).toBe(250 + value);
    expect(state.lives).toBe(2);
    expect([state.freshCaught, state.rottenCaught]).toEqual([1, 0]);
  });

  it.each(HAZARD_ITEMS.map((d) => [d.id, -d.cashEffect] as const))('a caught %s subtracts ₦%i and one life', (type, value) => {
    const state = playing(1000, 3);
    applyCatch(state, item(type));
    expect(state.cash).toBe(1000 - value);
    expect(state.lives).toBe(2);
    expect([state.freshCaught, state.rottenCaught]).toEqual([0, 1]);
  });

  it('a rotten tomato caught at ₦0 leaves cash at ₦0 and still costs a life', () => {
    const state = playing(0, 3);
    applyCatch(state, item('rottenTomato'));
    expect(state.cash).toBe(0);
    expect(state.lives).toBe(2);
  });

  it('a rotten pepper (−₦150) caught at ₦50 leaves ₦0, not negative', () => {
    const state = playing(50, 3);
    expect(applyCatch(state, item('rottenPepper'))).toEqual({ cash: -50, lives: -1 });
    expect(state.cash).toBe(0);
  });

  it('never takes lives below zero', () => {
    const state = playing(500, 0);
    applyCatch(state, item('rottenTomato'));
    expect(state.lives).toBe(0);
  });

  it('counts fresh and rotten catches separately', () => {
    const state = playing();
    for (const type of ['tomato', 'corn', 'rottenTomato', 'plantain', 'rottenPepper'] as const) applyCatch(state, item(type));
    expect([state.freshCaught, state.rottenCaught]).toEqual([3, 2]);
  });
});

describe('applyMiss', () => {
  it.each(FRESH_ITEMS.map((d) => d.id))('a missed %s costs one life and no cash', (type) => {
    const state = playing(300, 3);
    applyMiss(state, item(type));
    expect([state.cash, state.lives]).toEqual([300, 2]);
  });

  it.each(HAZARD_ITEMS.map((d) => d.id))('a missed %s costs nothing', (type) => {
    const state = playing(300, 3);
    applyMiss(state, item(type));
    expect([state.cash, state.lives]).toEqual([300, 3]);
  });

  it('does not count misses as catches', () => {
    const state = playing();
    applyMiss(state, item('tomato'));
    expect([state.freshCaught, state.rottenCaught]).toEqual([0, 0]);
  });

  it('reports each exited item once, so a miss can only be charged once', () => {
    const state = playing();
    const gone = item('onion', 0, PLAY_AREA.bottom - 5);
    state.items = [gone];
    expect(removeExitedItems(state)).toEqual([gone]);
    expect(gone.resolved).toBe(true);
    state.items = [gone]; // stale reference put back
    expect(removeExitedItems(state)).toEqual([]);
  });
});

describe('through the game loop', () => {
  function steppedGame() {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    // A random value of 0.99 every time keeps the spawner from adding hazards (share 0.15) into these tests.
    const game = new Game({ scheduler, random: () => 0.99 });
    const frame = (ms = 16) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame();
    game.start();
    frame();
    const state = game.state as GameState;
    state.items = []; // drop anything spawned during setup
    return { game, state, frame };
  }

  // Runs frames until `target` has resolved, with no spawning in the way.
  function until(target: FallingItem, frame: () => void, state: GameState) {
    for (let i = 0; i < 400 && !target.resolved; i++) {
      frame();
      state.items = state.items.filter((it) => it === target);
    }
  }

  it('a caught tomato adds ₦100 once', () => {
    const { state, frame } = steppedGame();
    const tomato = item('tomato', 0, BASKET_MOUTH.centerY + 2, 6);
    state.items.push(tomato);
    until(tomato, frame, state);
    for (let i = 0; i < 30; i++) frame();
    expect(state.cash).toBe(ITEM_DEFINITIONS.tomato.cashEffect);
    expect(state.freshCaught).toBe(1);
    expect(state.lives).toBe(3);
  });

  it('a fresh item that falls past the basket costs one life once; a hazard that does costs nothing', () => {
    const { state, frame } = steppedGame();
    const corn = item('corn', 3.6, BASKET_MOUTH.centerY, 8); // basket at 0, lane far right
    state.items.push(corn);
    until(corn, frame, state);
    for (let i = 0; i < 30; i++) frame();
    expect(state.lives).toBe(2);

    const hazard = item('rottenPepper', -3.6, BASKET_MOUTH.centerY, 8);
    state.items.push(hazard);
    until(hazard, frame, state);
    expect(state.lives).toBe(2);
    expect(state.cash).toBe(0);
  });

  it('reaching ₦0 cash does not end the round', () => {
    const { game, state, frame } = steppedGame();
    state.cash = 100;
    const hazard = item('rottenTomato', 0, BASKET_MOUTH.centerY + 2, 6);
    state.items.push(hazard);
    until(hazard, frame, state);
    frame();
    expect(state.cash).toBe(0);
    expect(game.state.status).toBe('playing');
  });
});
