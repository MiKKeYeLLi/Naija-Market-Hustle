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
