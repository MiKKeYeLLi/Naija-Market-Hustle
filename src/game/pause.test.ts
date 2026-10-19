import { describe, expect, it } from 'vitest';
import { KeyboardControls, PauseControls } from './controls';
import { Game, type FrameScheduler } from './Game';
import { type GameState } from './state';

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

// A page stand-in: dispatches key and visibility events, and lets tests flip visibilityState.
class FakePage extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  key(code: string, extra: Record<string, unknown> = {}) {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, ...extra });
    this.dispatchEvent(event);
    return event;
  }
  setVisibility(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup(options: { keyboard?: KeyboardControls } = {}) {
  let time = 0;
  let queued: (() => void) | null = null;
  const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
  const game = new Game({ scheduler, random: seeded(7), steering: options.keyboard });
  const frame = (ms = 16) => {
    time += ms;
    const cb = queued;
    queued = null;
    cb?.();
  };
  const page = new FakePage();
  const controls = new PauseControls(page, page, game);
  controls.attach();
  frame();
  return { game, frame, page, controls };
}

// Everything that defines "the same moment" in a round.
const snapshot = (state: Readonly<GameState>) => JSON.stringify(state);

describe('pause freezes the round', () => {
  it('moves, spawns, collides and counts down nothing while paused', () => {
    const { game, frame } = setup();
    game.start();
    for (let i = 0; i < 200; i++) frame(); // a few items in flight
    expect(game.state.items.length).toBeGreaterThan(0);

    game.pause();
    const frozen = snapshot(game.state);
    for (let i = 0; i < 600; i++) frame(); // ten seconds of frames
    expect(snapshot(game.state)).toBe(frozen);
  });

  it('pause at 45.3 s, wait 30 s, resume: the timer continues from 45.3 s', () => {
    const { game, frame } = setup();
    game.start();
    frame();
    (game.state as GameState).timeRemaining = 45.3;
    game.pause();

    frame(30_000); // one huge gap
    for (let i = 0; i < 100; i++) frame(300); // and thirty more seconds of frames
    expect(game.state.timeRemaining).toBe(45.3);

    game.resume();
    frame(16); // first frame after resume only restarts the clock
    expect(game.state.timeRemaining).toBe(45.3);
    frame(16);
    expect(game.state.timeRemaining).toBeCloseTo(45.3 - 0.016, 9);
  });

  it('resume restores time, items, cash and lives exactly', () => {
    const { game, frame } = setup();
    game.start();
    for (let i = 0; i < 300; i++) frame();
    const state = game.state as GameState;
    state.cash = 1250;
    state.lives = 2;
    game.pause();
    const before = snapshot(game.state);

    frame(60_000);
    game.resume();
    expect(snapshot(game.state)).toBe(before.replace('"status":"paused"', '"status":"playing"'));
    frame(16); // the clock restart frame: still nothing has moved
    const after = JSON.parse(snapshot(game.state));
    const expected = JSON.parse(before);
    expect(after.timeRemaining).toBe(expected.timeRemaining);
    expect(after.items).toEqual(expected.items);
    expect([after.cash, after.lives]).toEqual([1250, 2]);
  });

  it('releases held steering keys on pause, so the basket does not drift on resume', () => {
    const keyTarget = new FakePage();
    const keyboard = new KeyboardControls(keyTarget);
    keyboard.attach();
    const { game, frame } = setup({ keyboard });
    game.start();
    frame();
    keyTarget.key('ArrowRight');
    frame();
    game.pause();
    expect(keyboard.direction()).toBe(0);
    const x = game.state.basketX;
    game.resume();
    for (let i = 0; i < 10; i++) frame();
    expect(game.state.basketX).toBe(x);
  });
});

describe('PauseControls', () => {
  it('P and Esc pause a playing round and resume a paused one', () => {
    const { game, page } = setup();
    game.start();
    for (const code of ['KeyP', 'KeyP', 'Escape', 'Escape']) {
      const before = game.state.status;
      const event = page.key(code);
      expect(game.state.status).toBe(before === 'playing' ? 'paused' : 'playing');
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('ignores the keys outside a round and leaves them for the browser', () => {
    const { game, page } = setup();
    expect(page.key('KeyP').defaultPrevented).toBe(false); // ready
    expect(game.state.status).toBe('ready');
  });

  it('ignores auto-repeat and modified keys', () => {
    const { game, page } = setup();
    game.start();
    page.key('KeyP');
    page.key('KeyP', { repeat: true });
    expect(game.state.status).toBe('paused');
    page.key('KeyP', { ctrlKey: true });
    expect(game.state.status).toBe('paused');
  });

  it('pauses when the tab is hidden and does not resume by itself', () => {
    const { game, page, frame } = setup();
    game.start();
    frame();
    const t = game.state.timeRemaining;
    page.setVisibility('hidden');
    expect(game.state.status).toBe('paused');

    frame(10_000); // ten seconds away
    page.setVisibility('visible');
    expect(game.state.status).toBe('paused');
    expect(game.state.timeRemaining).toBe(t);
  });

  it('does nothing on a hidden tab outside a round', () => {
    const { game, page } = setup();
    page.setVisibility('hidden');
    expect(game.state.status).toBe('ready');
  });

  it('attaches once and detaches cleanly', () => {
    const { game, page, controls } = setup();
    controls.attach();
    game.start();
    page.key('KeyP');
    expect(game.state.status).toBe('paused'); // one listener: toggled once, not twice
    controls.detach();
    page.key('KeyP');
    page.setVisibility('hidden');
    expect(game.state.status).toBe('paused');
    expect(controls.isAttached).toBe(false);
  });
});
