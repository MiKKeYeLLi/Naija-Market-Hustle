// Game loop, state machine and round lifecycle. No three.js imports in game/.

import { clampBasketX } from './playArea';
import { createInitialState, type EndReason, type GameState, type GameStatus } from './state';

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

export interface GameOptions {
  // Called once per frame in every state, after the simulation step. Must not change state.
  render?(state: Readonly<GameState>, dt: number): void;
  onStatusChange?(status: GameStatus, previous: GameStatus): void;
  scheduler?: FrameScheduler;
}

export class Game {
  private current: GameState = createInitialState();
  private frameHandle: number | null = null;
  private running = false;
  private lastTime: number | null = null;
  private readonly scheduler: FrameScheduler;

  constructor(private readonly options: GameOptions = {}) {
    this.scheduler = options.scheduler ?? browserScheduler;
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

  // Fresh round state in `ready`; the best score carries over. Always allowed.
  reset(): void {
    this.stopLoop();
    const previous = this.current.status;
    this.current = createInitialState(this.current.bestScore);
    if (previous !== 'ready') this.options.onStatusChange?.('ready', previous);
    this.startLoop();
  }

  dispose(): void {
    this.stopLoop();
  }

  private endRound(reason: EndReason): void {
    if (!this.transition('gameOver', 'playing')) return;
    this.current.endReason = reason;
  }

  // Applies `to` only if the game is currently in `from` and the table allows it.
  private transition(to: GameStatus, from: GameStatus): boolean {
    const previous = this.current.status;
    if (previous !== from || !TRANSITIONS[previous].includes(to)) return false;
    this.current.status = to;
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

    this.current.timeRemaining = Math.max(0, this.current.timeRemaining - dt);
    if (this.current.timeRemaining === 0) this.endRound('time');
  }
}
