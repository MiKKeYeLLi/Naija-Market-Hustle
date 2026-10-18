// Pointer, touch and keyboard input (NMH-04, NMH-05). Translates DOM events into Game calls;
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
