// Cash and lives rules (NMH-10). Every change to cash or lives goes through applyEffect, which clamps.

import { ITEM_DEFINITIONS } from './items';
import { MAX_LIVES, type FallingItem, type GameState } from './state';

export interface Effect {
  cash?: number;
  lives?: number;
}

// Applies a signed change and clamps: cash never below ₦0, lives always 0 to MAX_LIVES.
// Returns the change that actually landed after clamping (a −₦150 at ₦50 cash lands as −₦50).
export function applyEffect(state: GameState, effect: Effect): Required<Effect> {
  const cashBefore = state.cash;
  const livesBefore = state.lives;
  state.cash = Math.max(0, state.cash + (effect.cash ?? 0));
  state.lives = Math.min(MAX_LIVES, Math.max(0, state.lives + (effect.lives ?? 0)));
  return { cash: state.cash - cashBefore, lives: state.lives - livesBefore };
}

// Fresh: +value. Hazard: −value and −1 life, applied even at ₦0 cash (the life still goes).
export function applyCatch(state: GameState, item: FallingItem): Required<Effect> {
  const definition = ITEM_DEFINITIONS[item.type];
  if (definition.kind === 'fresh') state.freshCaught += 1;
  else state.rottenCaught += 1;
  return applyEffect(state, { cash: definition.cashEffect, lives: definition.lifeEffect });
}

// A fresh item that reaches the bottom costs one life; a missed hazard costs nothing.
export function applyMiss(state: GameState, item: FallingItem): Required<Effect> {
  const missedFresh = ITEM_DEFINITIONS[item.type].kind === 'fresh';
  return applyEffect(state, { lives: missedFresh ? -1 : 0 });
}
