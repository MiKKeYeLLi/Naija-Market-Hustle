// Game loop, state machine and round lifecycle. No three.js imports in game/.

import { catchItems } from './collision';
import { createItemIdMinter } from './items';
import { BASKET_MAX_SPEED, clampBasketX } from './playArea';
import { applyCatch, applyMiss, roundEndReason, type Effect } from './rules';
import { Spawner, moveItems, phaseAt, removeExitedItems, type Phase } from './spawner';
import { createInitialState, type EndReason, type FallingItem, type GameState, type GameStatus } from './state';

// A stalled or backgrounded tab can deliver one huge frame gap; never simulate more than this at once.
export const MAX_STEP_MS = 50;

const TRANSITIONS: Record<GameStatus, readonly GameStatus[]> = {
  ready: ['playing'],
  playing: ['paused', 'gameOver'],
  paused: ['playing'],
  gameOver: [],
};

export interface FrameScheduler {
  now(): number;
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

// Held-key steering, read once per step. Released whenever the round stops playing.
// A catch, or an item leaving the bottom (a fresh miss costs a life; a hazard miss costs nothing).
export interface FeedbackEvent {
  type: 'catch' | 'miss';
  item: Readonly<FallingItem>;
  applied: Required<Effect>;
}

export interface SteeringInput {
  direction(): number; // -1 left, 0 none, 1 right
  releaseAll(): void;
}

export interface GameOptions {
  // Called once per frame in every state, after the simulation step. Must not change state.
  render?(state: Readonly<GameState>, dt: number): void;
  onStatusChange?(status: GameStatus, previous: GameStatus): void;
  // Fires once per boundary per round (rush hour at 60 s, market madness at 30 s), never on reset.
  onPhaseChange?(phase: Phase, previous: Phase): void;
  steering?: SteeringInput;
  scheduler?: FrameScheduler;
  // Source of randomness for spawning; tests pass a seeded one.
  random?: () => number;
  // Saved best from a previous visit; carried through every reset.
  bestScore?: number;
  // The single round teardown: called on every reset (Play Again, Restart), after the old loop has
  // stopped and before the fresh round's state and loop exist. Clear per-round visuals here.
  onReset?(): void;
  // Every catch and every miss, with the change that actually landed after clamping. Fired during
  // the step, so effects start in the same frame the item disappears.
  onFeedback?(event: FeedbackEvent): void;
}

export class Game {
  private current: GameState;
  private frameHandle: number | null = null;
  private running = false;
  private lastTime: number | null = null;
  private readonly scheduler: FrameScheduler;
  private readonly spawner: Spawner;

  constructor(private readonly options: GameOptions = {}) {
    this.scheduler = options.scheduler ?? browserScheduler;
    // One ID minter for the game's lifetime keeps item IDs unique across restarts.
    this.current = createInitialState(options.bestScore ?? 0);
    this.spawner = new Spawner(createItemIdMinter(), options.random);
    this.startLoop();
  }

  get state(): Readonly<GameState> {
    return this.current;
  }

  get isLooping(): boolean {
    return this.running;
  }

  start(): boolean {
    return this.transition('playing', 'ready');
  }

  pause(): boolean {
    return this.transition('paused', 'playing');
  }

  resume(): boolean {
    if (!this.transition('playing', 'paused')) return false;
    // Restart the frame clock so time spent paused is never simulated.
    this.lastTime = null;
    return true;
  }

  // Moves the basket centre towards play-area x, clamped to the edges. Ignored unless playing.
  moveBasketTo(x: number): boolean {
    if (this.current.status !== 'playing' || !Number.isFinite(x)) return false;
    this.current.basketX = clampBasketX(x);
    return true;
  }

  // Fresh round state in `ready`; the best score carries over. Always allowed. Everything a round
  // owns is torn down here, in one place: the loop, held keys, spawner state and (via onReset) visuals.
  reset(): void {
    this.stopLoop();
    this.options.steering?.releaseAll();
    this.options.onReset?.();
    const previous = this.current.status;
    this.current = createInitialState(this.current.bestScore);
    this.spawner.reset();
    if (previous !== 'ready') this.options.onStatusChange?.('ready', previous);
    this.startLoop();
  }

  dispose(): void {
    this.stopLoop();
  }

  // The only way into gameOver. The guarded transition succeeds once per round, so the reason is
  // set once and onStatusChange('gameOver') fires once, however many end conditions hit.
  private endRound(reason: EndReason): void {
    if (this.current.status !== 'playing') return;
    // Set before the transition so status listeners (the results screen) already see the reason and
    // whether this round set a new best. Strictly greater: matching the best is not a new one.
    this.current.endReason = reason;
    this.current.isNewBest = this.current.cash > this.current.bestScore;
    if (this.current.isNewBest) this.current.bestScore = this.current.cash;
    this.transition('gameOver', 'playing');
  }

  // Applies `to` only if the game is currently in `from` and the table allows it.
  private transition(to: GameStatus, from: GameStatus): boolean {
    const previous = this.current.status;
    if (previous !== from || !TRANSITIONS[previous].includes(to)) return false;
    this.current.status = to;
    // Leaving play (pause or game over) drops held keys so movement never sticks on return.
    if (previous === 'playing') this.options.steering?.releaseAll();
    this.options.onStatusChange?.(to, previous);
    return true;
  }

  private startLoop(): void {
    this.stopLoop();
    this.running = true;
    this.lastTime = null;
    this.frameHandle = this.scheduler.request(this.tick);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.frameHandle !== null) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  private tick = (): void => {
    // This frame has fired, so no request is pending until we queue the next one.
    this.frameHandle = null;
    const now = this.scheduler.now();
    const dt = this.lastTime === null ? 0 : Math.min(now - this.lastTime, MAX_STEP_MS) / 1000;
    this.lastTime = now;

    this.step(dt);
    this.options.render?.(this.current, dt);
    // render may have reset (which already queued a fresh loop) or disposed the game.
    if (this.running && this.frameHandle === null) {
      this.frameHandle = this.scheduler.request(this.tick);
    }
  };

  private step(dt: number): void {
    if (this.current.status !== 'playing') return;

    const direction = this.options.steering?.direction() ?? 0;
    if (direction !== 0) {
      this.current.basketX = clampBasketX(this.current.basketX + direction * BASKET_MAX_SPEED * dt);
    }

    // Order matters:
    // - move before spawning, since a new item is already placed for how late in the frame it spawned;
    // - catch before removing exits, so a sweep through the mouth and out of the bottom is a catch.
    // Caught items leave the list this frame, so their meshes go in the same render.
    moveItems(this.current, dt);
    for (const item of catchItems(this.current, dt)) {
      const applied = applyCatch(this.current, item);
      this.options.onFeedback?.({ type: 'catch', item, applied });
    }
    for (const item of removeExitedItems(this.current)) {
      const applied = applyMiss(this.current, item);
      this.options.onFeedback?.({ type: 'miss', item, applied });
    }
    this.current.timeRemaining = Math.max(0, this.current.timeRemaining - dt);

    // One end check after every change this frame, so a last life and the timer running out
    // together end the round once with one reason.
    const reason = roundEndReason(this.current);
    if (reason) {
      this.endRound(reason);
      return;
    }

    // After the end check, so a round that just ended never flashes a phase banner.
    const phase = phaseAt(this.current.timeRemaining);
    if (phase !== this.current.phase) {
      const previous = this.current.phase;
      this.current.phase = phase;
      this.options.onPhaseChange?.(phase, previous);
    }
    this.spawner.update(this.current, dt);
  }
}
