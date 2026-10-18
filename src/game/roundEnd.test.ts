import { describe, expect, it } from 'vitest';
import { Game, MAX_STEP_MS, type FrameScheduler } from './Game';
import { type ItemTypeId } from './items';
import { PLAY_AREA } from './playArea';
import { roundEndReason } from './rules';
import { ROUND_DURATION, createInitialState, type EndReason, type FallingItem, type GameState, type GameStatus } from './state';

let nextId = 10_000;
const item = (type: ItemTypeId, x: number, y: number, speed = 8): FallingItem => ({ id: nextId++, type, x, y, speed, resolved: false });

// A fresh item about to leave the bottom on the next frame, well away from the centred basket.
const aboutToExit = (type: ItemTypeId = 'tomato') => item(type, 3.6, PLAY_AREA.bottom - 0.39);

function setup() {
  let time = 0;
  let queued: (() => void) | null = null;
  const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
  const statusEvents: Array<{ status: GameStatus; reason: EndReason | null }> = [];
  let game: Game;
  // random 0.99: the spawner only ever adds fresh items, in the rightmost lane.
  game = new Game({
    scheduler,
    random: () => 0.99,
    onStatusChange: (status) => statusEvents.push({ status, reason: game.state.endReason }),
  });
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
  state.items = [];
  const gameOvers = () => statusEvents.filter((e) => e.status === 'gameOver');
  return { game, state, frame, statusEvents, gameOvers };
}

describe('roundEndReason', () => {
  it('ends on 0 lives or 0 seconds, never on cash', () => {
    const state = createInitialState();
    expect(roundEndReason(state)).toBeNull();
    state.cash = 0;
    expect(roundEndReason(state)).toBeNull();
    expect(roundEndReason({ ...state, timeRemaining: 0 })).toBe('time');
    expect(roundEndReason({ ...state, lives: 0 })).toBe('lives');
  });

  it('picks out of lives when both hit together', () => {
    expect(roundEndReason({ ...createInitialState(), lives: 0, timeRemaining: 0 })).toBe('lives');
  });
});

describe('round end in the game loop', () => {
  it('ends when the timer reaches 0, counting down from 90', () => {
    const { game, state, frame, gameOvers } = setup();
    expect(state.timeRemaining).toBeLessThanOrEqual(ROUND_DURATION);
    for (let i = 0; i < (ROUND_DURATION * 1000) / MAX_STEP_MS + 20 && game.state.status === 'playing'; i++) {
      state.items = []; // keep lives intact so time is the only way out
      frame(MAX_STEP_MS);
    }
    expect(game.state.status).toBe('gameOver');
    expect(game.state.timeRemaining).toBe(0);
    expect(game.state.endReason).toBe('time');
    expect(gameOvers()).toHaveLength(1);
  });

  it('ends when the last life is lost', () => {
    const { game, state, frame, gameOvers } = setup();
    state.lives = 1;
    state.items.push(aboutToExit());
    frame();
    expect(game.state.status).toBe('gameOver');
    expect(game.state.endReason).toBe('lives');
    expect(game.state.lives).toBe(0);
    expect(game.state.timeRemaining).toBeGreaterThan(80);
    expect(gameOvers()).toHaveLength(1);
  });

  it('ends on the last life from a rotten catch too', () => {
    const { game, state, frame } = setup();
    state.lives = 1;
    state.items.push(item('rottenTomato', 0, -5.6, 8)); // lands in the centred basket next frame
    for (let i = 0; i < 10 && game.state.status === 'playing'; i++) frame();
    expect(game.state.endReason).toBe('lives');
    expect(game.state.rottenCaught).toBe(1);
  });

  it('keeps playing at ₦0 cash', () => {
    const { game, state, frame } = setup();
    state.cash = 0;
    state.items.push(item('rottenPepper', 0, -5.6, 8)); // −₦150 at ₦0: cash stays 0, lives 3 → 2
    for (let i = 0; i < 60; i++) frame();
    expect(game.state.cash).toBe(0);
    expect(game.state.lives).toBe(2);
    expect(game.state.status).toBe('playing');
  });

  it('ends once with one reason when the last life and the timer run out in the same frame', () => {
    const { game, state, frame, gameOvers, statusEvents } = setup();
    state.lives = 1;
    state.timeRemaining = 0.01; // runs out within the next 16 ms frame
    state.items.push(aboutToExit('onion'), aboutToExit('corn')); // two misses: the last life goes, then a clamp
    frame();

    expect(game.state.status).toBe('gameOver');
    expect(game.state.timeRemaining).toBe(0);
    expect(game.state.lives).toBe(0);
    expect(game.state.endReason).toBe('lives');
    expect(gameOvers()).toEqual([{ status: 'gameOver', reason: 'lives' }]);

    // Later frames change nothing: no second gameOver, no new reason.
    for (let i = 0; i < 100; i++) frame();
    expect(gameOvers()).toHaveLength(1);
    expect(game.state.endReason).toBe('lives');
    expect(statusEvents.map((e) => e.status)).toEqual(['playing', 'gameOver']);
  });

  it('gives status listeners the end reason at the moment gameOver fires', () => {
    const { state, frame, gameOvers } = setup();
    state.timeRemaining = 0.005;
    frame();
    expect(gameOvers()).toEqual([{ status: 'gameOver', reason: 'time' }]);
  });

  it('freezes the round after it ends', () => {
    const { game, state, frame } = setup();
    state.lives = 1;
    state.items.push(aboutToExit(), item('tomato', -3.6, 6));
    frame();
    const snapshot = JSON.stringify(game.state);
    for (let i = 0; i < 100; i++) frame();
    expect(JSON.stringify(game.state)).toBe(snapshot);
  });

  it('clears the end reason on reset and can end again in the next round', () => {
    const { game, state, frame, gameOvers } = setup();
    state.timeRemaining = 0.005;
    frame();
    game.reset();
    expect(game.state.endReason).toBeNull();
    expect(game.state.status).toBe('ready');

    game.start();
    frame();
    const next = game.state as GameState;
    next.lives = 1;
    next.items = [aboutToExit()];
    frame();
    expect(game.state.endReason).toBe('lives');
    expect(gameOvers().map((e) => e.reason)).toEqual(['time', 'lives']);
  });
});
