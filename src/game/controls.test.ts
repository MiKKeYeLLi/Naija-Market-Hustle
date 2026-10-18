import { describe, expect, it } from 'vitest';
import { PointerControls, type BasketMover } from './controls';
import { Game, type FrameScheduler } from './Game';
import { BASKET_WIDTH, PLAY_AREA, clampBasketX } from './playArea';

// Records listeners so tests can count them and fire synthetic pointer events.
class FakeSurface extends EventTarget {
  listeners = new Map<string, number>();
  captured: number[] = [];

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener, options);
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, n) => sum + n, 0);
  }

  pointer(type: string, clientX: number, extra: Record<string, unknown> = {}): void {
    this.dispatchEvent(Object.assign(new Event(type), { clientX, isPrimary: true, pointerId: 1, ...extra }));
  }

  touch(type: string): Event {
    const event = new Event(type, { cancelable: true });
    this.dispatchEvent(event);
    return event;
  }
}

const idleScheduler: FrameScheduler = { now: () => 0, request: () => 1, cancel: () => {} };

// Identity mapping: 1 client pixel = 1 play-area unit, centred on 0.
function setup() {
  const surface = new FakeSurface();
  const game = new Game({ scheduler: idleScheduler });
  const controls = new PointerControls(surface, game, (clientX) => clientX);
  controls.attach();
  return { surface, game, controls };
}

describe('clampBasketX', () => {
  it('keeps the whole basket inside the play area', () => {
    const limit = PLAY_AREA.right - BASKET_WIDTH / 2;
    expect(clampBasketX(100)).toBe(limit);
    expect(clampBasketX(-100)).toBe(-limit);
    expect(clampBasketX(1.5)).toBe(1.5);
  });
});

describe('PointerControls', () => {
  it('moves the basket on mouse hover with no button pressed', () => {
    const { surface, game } = setup();
    game.start();
    surface.pointer('pointermove', 2, { buttons: 0, pointerType: 'mouse' });
    expect(game.state.basketX).toBe(2);
  });

  it('follows a touch drag and captures the pointer on press', () => {
    const { surface, game } = setup();
    game.start();
    surface.pointer('pointerdown', -1, { pointerType: 'touch', pointerId: 7 });
    expect(game.state.basketX).toBe(-1);
    expect(surface.captured).toEqual([7]);
    surface.pointer('pointermove', 1.25, { pointerType: 'touch', pointerId: 7 });
    expect(game.state.basketX).toBe(1.25);
  });

  it('clamps the basket at the play-area edges', () => {
    const { surface, game } = setup();
    game.start();
    surface.pointer('pointermove', 999);
    expect(game.state.basketX).toBe(PLAY_AREA.right - BASKET_WIDTH / 2);
    surface.pointer('pointermove', -999);
    expect(game.state.basketX).toBe(PLAY_AREA.left + BASKET_WIDTH / 2);
  });

  it('ignores pointers unless the round is playing', () => {
    const { surface, game } = setup();
    surface.pointer('pointermove', 2); // ready
    expect(game.state.basketX).toBe(0);

    game.start();
    surface.pointer('pointermove', 1);
    game.pause();
    surface.pointer('pointermove', -3);
    expect(game.state.basketX).toBe(1);
  });

  it('ignores secondary touches so a second finger cannot yank the basket', () => {
    const { surface, game } = setup();
    game.start();
    surface.pointer('pointermove', 1);
    surface.pointer('pointerdown', -3, { isPrimary: false });
    surface.pointer('pointermove', -3, { isPrimary: false });
    expect(game.state.basketX).toBe(1);
  });

  it('cancels touchstart and touchmove so the page cannot scroll or pull to refresh', () => {
    const { surface } = setup();
    expect(surface.touch('touchstart').defaultPrevented).toBe(true);
    expect(surface.touch('touchmove').defaultPrevented).toBe(true);
  });

  it('attaches listeners once, keeps them across restarts and removes them all on detach', () => {
    const { surface, game, controls } = setup();
    const attachedCount = surface.listenerCount;
    expect(attachedCount).toBe(4);

    controls.attach(); // second attach is a no-op
    for (let i = 0; i < 20; i++) {
      game.start();
      game.reset();
    }
    expect(surface.listenerCount).toBe(attachedCount);

    controls.detach();
    expect(surface.listenerCount).toBe(0);
    expect(controls.isAttached).toBe(false);

    const moves: number[] = [];
    const spy: BasketMover = { moveBasketTo: (x) => (moves.push(x), true) };
    new PointerControls(surface, spy, (x) => x); // never attached
    surface.pointer('pointermove', 2);
    expect(moves).toEqual([]);
  });
});
