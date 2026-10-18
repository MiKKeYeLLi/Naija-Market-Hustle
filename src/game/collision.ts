// Rectangle hit tests between items and the basket mouth (NMH-09).

import { ITEM_DEFINITIONS } from './items';
import { BASKET_MOUTH, BASKET_WIDTH } from './playArea';
import type { FallingItem, GameState } from './state';

// Axis-aligned rectangle by its edges, in play-area units.
export interface Rect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

// Forgiveness added to each side of the mouth. Kept below the gap between the mouth and the basket's
// outer wall, so an item centred beside the basket can never count, margin included.
export const CATCH_MARGIN = 0.1;
const WALL_GAP = (BASKET_WIDTH - BASKET_MOUTH.width) / 2;
if (CATCH_MARGIN >= WALL_GAP) throw new Error('CATCH_MARGIN must be smaller than the mouth-to-wall gap');

// Strict on every edge, so touching does not count. A zero-width rect works as a vertical line.
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;
}

export function mouthRect(basketX: number): Rect {
  const halfWidth = BASKET_MOUTH.width / 2 + CATCH_MARGIN;
  const halfHeight = BASKET_MOUTH.height / 2 + CATCH_MARGIN;
  return {
    left: basketX - halfWidth,
    right: basketX + halfWidth,
    bottom: BASKET_MOUTH.centerY - halfHeight,
    top: BASKET_MOUTH.centerY + halfHeight,
  };
}

// The catch shape of an item: vertically its full hitbox stretched over everywhere it has been since
// `previousY`, so a fast drop that jumps clean over the mouth band in one frame still collides (no
// tunnelling). Horizontally only its centre line: with the full width, an item in the next lane
// grazing the margin counted while hanging mostly outside the basket. Centre-in-mouth means at least
// half the item is over the basket.
export function sweptCatchRect(item: FallingItem, previousY: number): Rect {
  const { height } = ITEM_DEFINITIONS[item.type];
  return {
    left: item.x,
    right: item.x,
    bottom: Math.min(item.y, previousY) - height / 2,
    top: Math.max(item.y, previousY) + height / 2,
  };
}

// Removes every item caught this frame and returns them, each marked resolved before any effect
// is applied, so no later frame or second call can count it again. `dt` is the frame's fall time,
// used to recover where each item was before this frame's move.
export function catchItems(state: GameState, dt: number): FallingItem[] {
  const mouth = mouthRect(state.basketX);
  const caught: FallingItem[] = [];
  state.items = state.items.filter((item) => {
    if (item.resolved) return false;
    if (!overlaps(sweptCatchRect(item, item.y + item.speed * dt), mouth)) return true;
    item.resolved = true;
    caught.push(item);
    return false;
  });
  return caught;
}
