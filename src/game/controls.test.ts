import { describe, expect, it } from 'vitest';
import { KeyboardControls, PointerControls, type BasketMover } from './controls';
import { Game, type FrameScheduler } from './Game';
import { BASKET_MAX_SPEED, BASKET_WIDTH, PLAY_AREA, clampBasketX } from './playArea';

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

// Steps the game one frame at a time with a controllable clock.
function steppedGame(keyboard: KeyboardControls) {
  let time = 0;
  let queued: (() => void) | null = null;
  const scheduler: FrameScheduler = {
    now: () => time,
    request: (callback) => ((queued = callback), 1),
    cancel: () => (queued = null),
  };
  const game = new Game({ scheduler, steering: keyboard });
  const frame = (ms = 16) => {
    time += ms;
    const callback = queued;
    queued = null;
    callback?.();
  };
  frame(); // prime the clock
  return { game, frame };
}

function setupKeyboard() {
  const target = new FakeSurface();
  const keyboard = new KeyboardControls(target);
  keyboard.attach();
  const key = (type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, ...extra });
    target.dispatchEvent(event);
    return event;
  };
  return { target, keyboard, key, ...steppedGame(keyboard) };
}

describe('KeyboardControls', () => {
  it.each([
    ['ArrowLeft', -1],
    ['KeyA', -1],
    ['ArrowRight', 1],
    ['KeyD', 1],
  ])('%s moves the basket at the fixed maximum speed', (code, sign) => {
    const { game, frame, key } = setupKeyboard();
    game.start();
    frame(); // first playing frame
    key('keydown', code);
    frame(100);
    expect(game.state.basketX).toBeCloseTo(sign * BASKET_MAX_SPEED * 0.05, 6); // dt clamped to 50 ms
    frame(16);
    expect(game.state.basketX).toBeCloseTo(sign * BASKET_MAX_SPEED * 0.066, 6);
  });

  it('applies movement in the loop, not in the key handler', () => {
    const { game, frame, key } = setupKeyboard();
    game.start();
    frame();
    key('keydown', 'KeyD');
    expect(game.state.basketX).toBe(0);
    frame(16);
    expect(game.state.basketX).toBeGreaterThan(0);
  });

  it('never leaves the play area', () => {
    const { game, frame, key } = setupKeyboard();
    game.start();
    key('keydown', 'ArrowRight');
    for (let i = 0; i < 200; i++) frame(16);
    expect(game.state.basketX).toBe(PLAY_AREA.right - BASKET_WIDTH / 2);
    key('keyup', 'ArrowRight');
    key('keydown', 'KeyA');
    for (let i = 0; i < 200; i++) frame(16);
    expect(game.state.basketX).toBe(PLAY_AREA.left + BASKET_WIDTH / 2);
  });

  it('holding opposite keys gives no movement', () => {
    const { game, frame, key, keyboard } = setupKeyboard();
    game.start();
    key('keydown', 'ArrowLeft');
    key('keydown', 'KeyD');
    frame(16);
    frame(16);
    expect(keyboard.direction()).toBe(0);
    expect(game.state.basketX).toBe(0);

    key('keydown', 'KeyA'); // two lefts + one right still cancel to a single direction
    expect(keyboard.direction()).toBe(0);
    key('keyup', 'KeyD');
    expect(keyboard.direction()).toBe(-1);
  });

  it.each(['blur', 'visibilitychange'])('releases held keys on %s', (type) => {
    const { game, frame, key, target } = setupKeyboard();
    game.start();
    key('keydown', 'ArrowRight');
    frame(16);
    target.dispatchEvent(new Event(type));
    const x = game.state.basketX;
    frame(16);
    frame(16);
    expect(game.state.basketX).toBe(x);
  });

  it('releases held keys on pause, so nothing moves after resume until a key is pressed again', () => {
    const { game, frame, key, keyboard } = setupKeyboard();
    game.start();
    key('keydown', 'ArrowRight');
    frame(16);
    game.pause();
    expect(keyboard.direction()).toBe(0);
    const x = game.state.basketX;
    game.resume();
    frame(16);
    frame(16);
    expect(game.state.basketX).toBe(x);

    key('keydown', 'ArrowRight', { repeat: true }); // auto-repeat from a key still held
    frame(16);
    expect(game.state.basketX).toBeGreaterThan(x);
  });

  it('does not move while paused or before the round starts', () => {
    const { game, frame, key } = setupKeyboard();
    key('keydown', 'KeyD');
    frame(16);
    expect(game.state.basketX).toBe(0);
  });

  it('ignores other keys and browser shortcuts, and prevents default for steering keys', () => {
    const { keyboard, key } = setupKeyboard();
    expect(key('keydown', 'KeyW').defaultPrevented).toBe(false);
    expect(key('keydown', 'KeyD', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keyboard.direction()).toBe(0);
    expect(key('keydown', 'ArrowLeft').defaultPrevented).toBe(true);
  });

  it('works alongside pointer control', () => {
    const { target, game, frame, key } = setupKeyboard();
    new PointerControls(target, game, (x) => x).attach();
    game.start();
    target.pointer('pointermove', -2);
    key('keydown', 'KeyD');
    frame(16);
    expect(game.state.basketX).toBeCloseTo(-2 + BASKET_MAX_SPEED * 0.016, 6);
  });

  it('attaches once and removes every listener on detach', () => {
    const { target, keyboard, key } = setupKeyboard();
    keyboard.attach();
    expect(target.listenerCount).toBe(4);
    key('keydown', 'KeyD');
    keyboard.detach();
    expect(target.listenerCount).toBe(0);
    expect(keyboard.direction()).toBe(0);
  });
});
