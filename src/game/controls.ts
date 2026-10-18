// Pointer, touch and keyboard input (NMH-04, NMH-05). Translates DOM events into game input;
// the client-to-play-area conversion is injected so this file stays free of three.js.

export interface BasketMover {
  moveBasketTo(x: number): boolean;
}

// The subset of the canvas this module needs, so tests can pass a plain EventTarget.
export type PointerSurface = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
  setPointerCapture?(pointerId: number): void;
};

type PointerLike = Event & { clientX: number; isPrimary?: boolean; pointerId?: number };

export class PointerControls {
  private attached = false;

  constructor(
    private readonly surface: PointerSurface,
    private readonly game: BasketMover,
    private readonly clientToPlayX: (clientX: number) => number,
  ) {}

  get isAttached(): boolean {
    return this.attached;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.surface.addEventListener('pointerdown', this.onPointerDown);
    this.surface.addEventListener('pointermove', this.onPointerMove);
    // touch-action: none covers modern browsers; cancelling touches also stops iOS scroll and pull-to-refresh.
    this.surface.addEventListener('touchstart', this.preventTouch, { passive: false });
    this.surface.addEventListener('touchmove', this.preventTouch, { passive: false });
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('touchstart', this.preventTouch);
    this.surface.removeEventListener('touchmove', this.preventTouch);
  }

  private onPointerDown = (event: Event): void => {
    const pointer = event as PointerLike;
    if (pointer.isPrimary === false) return;
    // Keep receiving moves for this finger even if it slides over HUD elements.
    if (pointer.pointerId !== undefined) this.surface.setPointerCapture?.(pointer.pointerId);
    this.follow(pointer);
  };

  // Fires for mouse hover with no button pressed as well as for drags.
  private onPointerMove = (event: Event): void => {
    const pointer = event as PointerLike;
    if (pointer.isPrimary === false) return;
    this.follow(pointer);
  };

  private follow(pointer: PointerLike): void {
    // Game.moveBasketTo ignores input unless the round is playing, which covers pause.
    this.game.moveBasketTo(this.clientToPlayX(pointer.clientX));
  }

  private preventTouch = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };
}

// Physical key codes, so A/D sit in the same place on AZERTY and other layouts.
const KEY_DIRECTIONS: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};

type KeyLike = Event & { code: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };

// Tracks held steering keys; Game reads direction() each step and applies speed x delta time.
export class KeyboardControls {
  private readonly held = new Set<string>();
  private attached = false;

  // Pass window: key events bubble to it, and document's visibilitychange propagates to it.
  constructor(private readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>) {}

  get isAttached(): boolean {
    return this.attached;
  }

  direction(): number {
    let left = false;
    let right = false;
    for (const code of this.held) {
      if (KEY_DIRECTIONS[code] === -1) left = true;
      else if (KEY_DIRECTIONS[code] === 1) right = true;
    }
    // Any left against any right cancels out, however many keys point each way.
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  releaseAll(): void {
    this.held.clear();
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onFocusLost);
    this.target.addEventListener('visibilitychange', this.onFocusLost);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onFocusLost);
    this.target.removeEventListener('visibilitychange', this.onFocusLost);
    this.releaseAll();
  }

  private onKeyDown = (event: Event): void => {
    const key = event as KeyLike;
    if (!(key.code in KEY_DIRECTIONS)) return;
    // Leave browser shortcuts such as Ctrl+D alone.
    if (key.ctrlKey || key.metaKey || key.altKey) return;
    // Auto-repeat keydowns re-add a key that was released by a pause while still physically held.
    this.held.add(key.code);
    if (key.cancelable) key.preventDefault();
  };

  private onKeyUp = (event: Event): void => {
    this.held.delete((event as KeyLike).code);
  };

  private onFocusLost = (): void => {
    this.releaseAll();
  };
}
