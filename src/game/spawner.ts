// Weighted spawning, falling movement and the difficulty settings (NMH-08, NMH-12).

import { FRESH_ITEMS, HAZARD_ITEMS, ITEM_DEFINITIONS, type ItemDefinition } from './items';
import { BASKET_MOUTH, BASKET_WIDTH, PLAY_AREA } from './playArea';
import type { FallingItem, GameState } from './state';

export interface DifficultySettings {
  // Seconds for an item to fall from the top edge to the basket mouth.
  fallTime: number;
  // Seconds between spawns.
  spawnInterval: number;
  // Fraction of spawns that are hazards.
  hazardShare: number;
}

// The 90 s anchor from the PRD's Difficulty progression table.
export const WARM_UP: DifficultySettings = { fallTime: 3.2, spawnInterval: 1.1, hazardShare: 0.15 };

// Warm-up for the whole round until NMH-12 interpolates between the anchors.
export function difficultyAt(_timeRemaining: number): DifficultySettings {
  return WARM_UP;
}

// Lane centres span exactly the basket's reach, so every lane can be caught.
export const LANE_COUNT = 7;
const LANE_LIMIT = PLAY_AREA.right - BASKET_WIDTH / 2;
export const LANES: readonly number[] = Array.from(
  { length: LANE_COUNT },
  (_, i) => -LANE_LIMIT + (i * 2 * LANE_LIMIT) / (LANE_COUNT - 1),
);

export const FALL_DISTANCE = PLAY_AREA.top - BASKET_MOUTH.centerY;
// Delay before the first item of a round, so the player sees the stream begin.
export const FIRST_SPAWN_DELAY = 0.4;

export function fallSpeed(settings: DifficultySettings): number {
  return FALL_DISTANCE / settings.fallTime;
}

export function weightedPick(items: readonly ItemDefinition[], random: () => number): ItemDefinition {
  const total = items.reduce((sum, item) => sum + item.spawnWeight, 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= item.spawnWeight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

export class Spawner {
  private untilNextSpawn = FIRST_SPAWN_DELAY;

  constructor(
    private readonly mintId: () => number,
    private readonly random: () => number = Math.random,
  ) {}

  reset(): void {
    this.untilNextSpawn = FIRST_SPAWN_DELAY;
  }

  // Counts down in seconds, so the spawn rate is the same at any frame rate.
  update(state: GameState, dt: number): void {
    const settings = difficultyAt(state.timeRemaining);
    this.untilNextSpawn -= dt;
    while (this.untilNextSpawn <= 0) {
      // A spawn that fell due partway through this frame has already been falling for `late` seconds.
      const late = -this.untilNextSpawn;
      state.items.push(this.spawn(settings, late));
      this.untilNextSpawn += settings.spawnInterval;
    }
  }

  private spawn(settings: DifficultySettings, late: number): FallingItem {
    const pool = this.random() < settings.hazardShare ? HAZARD_ITEMS : FRESH_ITEMS;
    const definition = weightedPick(pool, this.random);
    const lane = Math.min(LANE_COUNT - 1, Math.floor(this.random() * LANE_COUNT));
    const speed = fallSpeed(settings);
    return {
      id: this.mintId(),
      type: definition.id,
      x: LANES[lane],
      // Bottom edge starts at the top of the play area: just out of view.
      y: PLAY_AREA.top + definition.height / 2 - speed * late,
      speed,
      resolved: false,
    };
  }
}

// Moves every item down by speed x dt.
export function moveItems(state: GameState, dt: number): void {
  for (const item of state.items) item.y -= item.speed * dt;
}

// Drops the items that have fully left the bottom and returns them, so scoring (NMH-10) can charge a
// life for missed fresh produce. Run after collision, so a frame that sweeps an item through the
// mouth and out of the bottom counts it as caught, not missed.
export function removeExitedItems(state: GameState): FallingItem[] {
  const exited: FallingItem[] = [];
  state.items = state.items.filter((item) => {
    const gone = item.y + ITEM_DEFINITIONS[item.type].height / 2 < PLAY_AREA.bottom;
    if (gone) exited.push(item);
    return !gone;
  });
  return exited;
}
