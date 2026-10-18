// GameState types and reset. Plain data only, so the rules can be tested without a renderer.

import type { ItemTypeId } from './items';

export const ROUND_DURATION = 90;
export const STARTING_LIVES = 3;
export const MAX_LIVES = 3;

export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameOver';
export type EndReason = 'time' | 'lives';

// Spawned by NMH-08; static values (cash, size, colour) live in ITEM_DEFINITIONS[type].
export interface FallingItem {
  id: number;
  type: ItemTypeId;
  x: number;
  y: number;
  speed: number;
  resolved: boolean;
}

export interface GameState {
  status: GameStatus;
  timeRemaining: number;
  cash: number;
  lives: number;
  basketX: number;
  items: FallingItem[];
  freshCaught: number;
  rottenCaught: number;
  endReason: EndReason | null;
  bestScore: number;
}

export function createInitialState(bestScore = 0): GameState {
  return {
    status: 'ready',
    timeRemaining: ROUND_DURATION,
    cash: 0,
    lives: STARTING_LIVES,
    basketX: 0,
    items: [],
    freshCaught: 0,
    rottenCaught: 0,
    endReason: null,
    bestScore,
  };
}
