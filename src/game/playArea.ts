// Play-area bounds in world units. The game simulates on this plane; render/ frames the camera around it.
// Origin is the centre of the play area, +x is right and +y is up, so items fall towards -y.

export const PLAY_AREA_WIDTH = 9;
export const PLAY_AREA_HEIGHT = 16;

export const PLAY_AREA = {
  width: PLAY_AREA_WIDTH,
  height: PLAY_AREA_HEIGHT,
  left: -PLAY_AREA_WIDTH / 2,
  right: PLAY_AREA_WIDTH / 2,
  top: PLAY_AREA_HEIGHT / 2,
  bottom: -PLAY_AREA_HEIGHT / 2,
} as const;

// Basket footprint on the play plane. render/models.ts builds the mesh to these dimensions.
export const BASKET_WIDTH = 1.8;
export const BASKET_HEIGHT = 0.8;
// Centre of the basket body.
export const BASKET_Y = PLAY_AREA.bottom + 1.2;

// The catch zone: a band just inside the rim, narrower than the body so edge grazes don't count.
// Collision (NMH-09) tests item hitboxes against this rectangle, centred on basketX.
export const BASKET_MOUTH = {
  width: 1.5,
  height: 0.3,
  centerY: BASKET_Y + BASKET_HEIGHT / 2 - 0.15,
} as const;
// Keyboard speed in units per second: edge to edge in about 0.6 s. NMH-13 uses it for lane reachability.
export const BASKET_MAX_SPEED = 12;

// Keeps the whole basket, not just its centre, inside the play area.
export function clampBasketX(x: number): number {
  const limit = PLAY_AREA.right - BASKET_WIDTH / 2;
  return Math.min(limit, Math.max(-limit, x));
}
