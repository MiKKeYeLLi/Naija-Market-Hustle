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

// Basket footprint on the play plane. NMH-07 builds the mesh to these dimensions.
export const BASKET_WIDTH = 1.8;
export const BASKET_Y = PLAY_AREA.bottom + 1.2;

// Keeps the whole basket, not just its centre, inside the play area.
export function clampBasketX(x: number): number {
  const limit = PLAY_AREA.right - BASKET_WIDTH / 2;
  return Math.min(limit, Math.max(-limit, x));
}
