import { describe, expect, it } from 'vitest';
import { CATCH_MARGIN, catchItems, mouthRect, overlaps, sweptCatchRect } from './collision';
import { Game, type FrameScheduler } from './Game';
import { ITEM_DEFINITIONS, ITEM_TYPES, type ItemTypeId } from './items';
import { BASKET_MOUTH, BASKET_WIDTH } from './playArea';
import { LANES, moveItems, removeExitedItems } from './spawner';
import { createInitialState, type FallingItem, type GameState } from './state';

let nextId = 1;
function item(x: number, y: number, type: ItemTypeId = 'tomato', speed = 4): FallingItem {
  return { id: nextId++, type, x, y, speed, resolved: false };
}

function stateWith(items: FallingItem[], basketX = 0): GameState {
  const state = createInitialState();
  state.status = 'playing';
  state.basketX = basketX;
  state.items = items;
  return state;
}

const tomato = ITEM_DEFINITIONS.tomato;
// Steps a single item down from `startY` at `speed` in `dt` frames, catching like the game loop does.
function drop(x: number, startY: number, speed: number, dt: number, basketX = 0) {
  const falling = item(x, startY, 'tomato', speed);
  const state = stateWith([falling], basketX);
  const caught: FallingItem[] = [];
  for (let frame = 0; frame < 2000 && state.items.length > 0; frame++) {
    moveItems(state, dt);
    caught.push(...catchItems(state, dt));
    removeExitedItems(state);
  }
  return { caught, falling };
}

describe('rectangles', () => {
  it('overlap only when they share area', () => {
    const a = { left: 0, right: 1, bottom: 0, top: 1 };
    expect(overlaps(a, { left: 0.5, right: 2, bottom: 0.5, top: 2 })).toBe(true);
    expect(overlaps(a, { left: 1, right: 2, bottom: 0, top: 1 })).toBe(false); // touching edges
    expect(overlaps(a, { left: 0, right: 1, bottom: 2, top: 3 })).toBe(false);
  });

  it('builds the mouth from BASKET_MOUTH plus the margin, centred on the basket', () => {
    const mouth = mouthRect(1.5);
    expect(mouth.right - mouth.left).toBeCloseTo(BASKET_MOUTH.width + 2 * CATCH_MARGIN, 9);
    expect((mouth.left + mouth.right) / 2).toBeCloseTo(1.5, 9);
    expect((mouth.bottom + mouth.top) / 2).toBeCloseTo(BASKET_MOUTH.centerY, 9);
  });

  it('keeps the margin inside the basket wall', () => {
    const mouth = mouthRect(0);
    expect(mouth.right).toBeLessThan(BASKET_WIDTH / 2);
  });

  it('sweeps the item hitbox from its previous to current y, on its centre line', () => {
    const rect = sweptCatchRect(item(0.7, 1), 3);
    expect(rect.top).toBeCloseTo(3 + tomato.height / 2, 9);
    expect(rect.bottom).toBeCloseTo(1 - tomato.height / 2, 9);
    expect([rect.left, rect.right]).toEqual([0.7, 0.7]);
  });

  it('treats a zero-width rect as a line inside, not touching, the other rect', () => {
    const box = { left: 0, right: 1, bottom: 0, top: 1 };
    expect(overlaps({ left: 0.5, right: 0.5, bottom: 0, top: 1 }, box)).toBe(true);
    expect(overlaps({ left: 1, right: 1, bottom: 0, top: 1 }, box)).toBe(false);
  });
});

describe('catchItems', () => {
  it('catches an item inside the basket mouth', () => {
    const inside = item(0.3, BASKET_MOUTH.centerY);
    const state = stateWith([inside]);
    expect(catchItems(state, 0)).toEqual([inside]);
  });

  it('never catches an item beside the basket, on either side', () => {
    const y = BASKET_MOUTH.centerY;
    const flush = BASKET_WIDTH / 2 + tomato.width / 2; // edge flush against the outer wall
    const overhang = BASKET_WIDTH / 2 + 0.01; // centre just outside the wall, edge overlapping the rim
    const beside = [item(-flush, y), item(flush, y), item(-overhang, y), item(overhang, y)];
    const state = stateWith(beside, 0);
    expect(catchItems(state, 0)).toEqual([]);
    expect(state.items).toHaveLength(4);
  });

  it.each(ITEM_TYPES.map((t) => t.id))('never catches a %s in the next lane over', (type) => {
    // Found in a live run: with full-width hitboxes, wide items in the adjacent lane grazed the margin.
    for (let lane = 0; lane < LANES.length; lane++) {
      const neighbours = [LANES[lane - 1], LANES[lane + 1]].filter((x) => x !== undefined);
      const state = stateWith(neighbours.map((x) => item(x, BASKET_MOUTH.centerY, type)), LANES[lane]);
      expect(catchItems(state, 0)).toEqual([]);
    }
  });

  it('forgives a near miss inside the margin but not beyond it', () => {
    const edge = BASKET_MOUTH.width / 2;
    const near = item(edge + CATCH_MARGIN * 0.5, BASKET_MOUTH.centerY);
    const far = item(edge + CATCH_MARGIN * 1.5, BASKET_MOUTH.centerY);
    const state = stateWith([near, far]);
    expect(catchItems(state, 0)).toEqual([near]);
  });

  it('removes caught items immediately and marks them resolved', () => {
    const inside = item(0, BASKET_MOUTH.centerY);
    const above = item(0, 6);
    const state = stateWith([inside, above]);
    const caught = catchItems(state, 0);
    expect(caught[0].resolved).toBe(true);
    expect(state.items).toEqual([above]);
  });

  it('never yields the same item twice, even if called again or the item is re-added', () => {
    const inside = item(0, BASKET_MOUTH.centerY);
    const state = stateWith([inside]);
    expect(catchItems(state, 0)).toHaveLength(1);
    expect(catchItems(state, 0)).toHaveLength(0);

    state.items.push(inside); // a stale reference sneaking back in
    expect(catchItems(state, 0)).toHaveLength(0);
    expect(state.items).toHaveLength(0);
  });

  it('ignores items above the mouth and items that have already fallen past it', () => {
    const above = item(0, BASKET_MOUTH.centerY + 2);
    const below = item(0, BASKET_MOUTH.centerY - 2);
    expect(catchItems(stateWith([above, below]), 0)).toEqual([]);
  });

  it('does not tunnel: a fast drop that skips the mouth band in one frame is still caught', () => {
    // 60 units/s x 50 ms = 3 units per frame, far more than the mouth band plus the item height.
    const { caught } = drop(0, 6.5, 60, 0.05);
    expect(caught).toHaveLength(1);

    // Without the sweep the same drop would jump straight over the mouth (y 0.5 -> -2.5 -> -5.5 -> -8.5).
    const mouth = mouthRect(0);
    const steps = Array.from({ length: 6 }, (_, i) => 6.5 - 60 * 0.05 * (i + 1));
    const hitWithoutSweep = steps.some((y) => overlaps(sweptCatchRect(item(0, y), y), mouth));
    expect(hitWithoutSweep).toBe(false);
  });

  it.each([30, 60, 144])('catches a centred drop exactly once at %i fps', (fps) => {
    const { caught, falling } = drop(0, 8, 10.4, 1 / fps);
    expect(caught).toEqual([falling]);
  });

  it.each([30, 60, 144])('lets a drop beside the basket fall through at %i fps', (fps) => {
    const { caught, falling } = drop(BASKET_WIDTH, 8, 10.4, 1 / fps);
    expect(caught).toEqual([]);
    // Resolved by leaving the bottom (as a miss), never by the basket.
    expect(falling.y).toBeLessThan(-8);
    expect(falling.resolved).toBe(true);
  });
});

describe('Game integration', () => {
  it('removes a caught item in the same frame, before render sees it', () => {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const rendered: number[][] = [];
    const game = new Game({ scheduler, render: (state) => rendered.push(state.items.map((i) => i.id)) });
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame(16);
    game.start();
    frame(16);

    // Place an item above the mouth, falling onto the centred basket.
    const target = item(0, BASKET_MOUTH.centerY + 1.2, 'tomato', 10);
    (game.state as GameState).items.push(target);
    frame(16); // falls 0.16: bottom edge still above the catch zone
    expect(target.resolved).toBe(false);
    expect(rendered.at(-1)).toContain(target.id);
    for (let i = 0; i < 10 && rendered.at(-1)!.includes(target.id); i++) frame(16);

    expect(rendered.at(-1)).not.toContain(target.id);
    expect(target.resolved).toBe(true);
  });
});
