import { describe, expect, it } from 'vitest';
import { Game, MAX_STEP_MS, type FrameScheduler } from './Game';
import { ROUND_DURATION } from './state';

// Manual frame clock: frames only fire when the test calls frame().
function fakeScheduler() {
  let time = 0;
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const scheduler: FrameScheduler = {
    now: () => time,
    request: (callback) => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      pending.delete(handle);
    },
  };
  return {
    scheduler,
    get pendingFrames() {
      return pending.size;
    },
    // Advance the clock by `ms`, then fire every callback that was queued before this frame.
    frame(ms: number) {
      time += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
    frames(count: number, ms: number) {
      for (let i = 0; i < count; i++) this.frame(ms);
    },
  };
}

function setup() {
  const clock = fakeScheduler();
  const game = new Game({ scheduler: clock.scheduler });
  clock.frame(16); // first frame only primes the clock
  return { clock, game };
}

describe('Game loop', () => {
  it('keeps exactly one frame queued, including across resets', () => {
    const { clock, game } = setup();
    expect(clock.pendingFrames).toBe(1);

    for (let i = 0; i < 20; i++) {
      game.start();
      clock.frames(3, 16);
      game.reset();
      expect(clock.pendingFrames).toBe(1);
    }
  });

  it('does not start a second loop when render resets the game mid-frame', () => {
    const clock = fakeScheduler();
    let resetDuringRender = true;
    const game: Game = new Game({
      scheduler: clock.scheduler,
      render: () => {
        if (resetDuringRender) {
          resetDuringRender = false;
          game.reset();
        }
      },
    });
    clock.frame(16);
    expect(clock.pendingFrames).toBe(1);
  });

  it('stops the loop on dispose', () => {
    const { clock, game } = setup();
    game.dispose();
    expect(clock.pendingFrames).toBe(0);
    expect(game.isLooping).toBe(false);
  });

  it('clamps a stalled frame to a 50 ms step', () => {
    const { clock, game } = setup();
    game.start();
    clock.frame(16); // first frame after start
    const before = game.state.timeRemaining;
    clock.frame(10_000);
    expect(before - game.state.timeRemaining).toBeCloseTo(MAX_STEP_MS / 1000, 6);
  });
});

describe('State machine', () => {
  it('starts in ready and only counts down after start', () => {
    const { clock, game } = setup();
    expect(game.state.status).toBe('ready');
    clock.frames(60, 16);
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);

    expect(game.start()).toBe(true);
    clock.frames(61, 16);
    expect(game.state.timeRemaining).toBeLessThan(ROUND_DURATION);
  });

  it('freezes the countdown while paused and never simulates the paused gap', () => {
    const { clock, game } = setup();
    game.start();
    clock.frames(10, 16);
    game.pause();
    const frozen = game.state.timeRemaining;
    clock.frames(100, 16);
    expect(game.state.timeRemaining).toBe(frozen);

    game.resume();
    clock.frame(30_000); // first frame after resume primes the clock
    expect(game.state.timeRemaining).toBe(frozen);
    clock.frame(16);
    expect(game.state.timeRemaining).toBeCloseTo(frozen - 0.016, 6);
  });

  it('ends the round once when time runs out', () => {
    const statuses: string[] = [];
    const clock = fakeScheduler();
    const game = new Game({ scheduler: clock.scheduler, onStatusChange: (s) => statuses.push(s) });
    clock.frame(16);
    game.start();
    clock.frames(Math.ceil((ROUND_DURATION * 1000) / MAX_STEP_MS) + 10, MAX_STEP_MS);

    expect(game.state.status).toBe('gameOver');
    expect(game.state.timeRemaining).toBe(0);
    expect(game.state.endReason).toBe('time');
    expect(statuses.filter((s) => s === 'gameOver')).toHaveLength(1);
  });

  it('ignores illegal transitions', () => {
    const { clock, game } = setup();
    expect(game.pause()).toBe(false); // ready -> paused
    expect(game.resume()).toBe(false); // ready -> playing via resume
    expect(game.state.status).toBe('ready');

    game.start();
    expect(game.start()).toBe(false); // playing -> playing
    expect(game.resume()).toBe(false); // resume while playing

    game.pause();
    expect(game.start()).toBe(false); // paused -> playing via start
    expect(game.pause()).toBe(false); // paused -> paused
    clock.frames(Math.ceil((ROUND_DURATION * 1000) / MAX_STEP_MS) + 10, MAX_STEP_MS);
    expect(game.state.status).toBe('paused'); // paused never reaches gameOver

    game.resume();
    clock.frames(Math.ceil((ROUND_DURATION * 1000) / MAX_STEP_MS) + 10, MAX_STEP_MS);
    expect(game.state.status).toBe('gameOver');
    expect(game.start()).toBe(false);
    expect(game.pause()).toBe(false);
    expect(game.resume()).toBe(false);
  });

  it('reset returns to a fresh ready state and keeps the best score', () => {
    const { clock, game } = setup();
    game.start();
    clock.frames(20, 16);
    (game.state as { bestScore: number }).bestScore = 1250;
    game.reset();

    expect(game.state.status).toBe('ready');
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);
    expect(game.state.endReason).toBeNull();
    expect(game.state.bestScore).toBe(1250);
  });
});
