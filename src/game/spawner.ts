// Weighted spawning, falling movement and the difficulty settings (NMH-08, NMH-12).

import { FRESH_ITEMS, HAZARD_ITEMS, ITEM_DEFINITIONS, type ItemDefinition } from './items';
import { BASKET_MAX_SPEED, BASKET_MOUTH, BASKET_WIDTH, PLAY_AREA } from './playArea';
import type { FallingItem, GameState } from './state';

export interface DifficultySettings {
  // Seconds for an item to fall from the top edge to the basket mouth.
  fallTime: number;
  // Seconds between spawns.
  spawnInterval: number;
  // Fraction of spawns that are hazards.
  hazardShare: number;
}

// The PRD's Difficulty progression table, by seconds remaining. Tune here: one line per anchor.
// Keep hazardShare below 0.5 so fresh produce always outnumbers hazards.
export const DIFFICULTY_ANCHORS: readonly (DifficultySettings & { timeRemaining: number })[] = [
  { timeRemaining: 90, fallTime: 3.2, spawnInterval: 1.1, hazardShare: 0.15 },
  { timeRemaining: 60, fallTime: 2.4, spawnInterval: 0.85, hazardShare: 0.2 },
  { timeRemaining: 30, fallTime: 1.8, spawnInterval: 0.65, hazardShare: 0.25 },
  { timeRemaining: 0, fallTime: 1.4, spawnInterval: 0.5, hazardShare: 0.35 },
];

// The round's opening values.
export const WARM_UP: DifficultySettings = DIFFICULTY_ANCHORS[0];

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

// Linear between the two anchors around `timeRemaining`, so nothing jumps at a phase boundary.
export function difficultyAt(timeRemaining: number): DifficultySettings {
  const first = DIFFICULTY_ANCHORS[0];
  const last = DIFFICULTY_ANCHORS[DIFFICULTY_ANCHORS.length - 1];
  const t = Math.min(first.timeRemaining, Math.max(last.timeRemaining, timeRemaining));
  for (let i = 1; i < DIFFICULTY_ANCHORS.length; i++) {
    const later = DIFFICULTY_ANCHORS[i];
    if (t < later.timeRemaining) continue;
    const earlier = DIFFICULTY_ANCHORS[i - 1];
    const progress = (earlier.timeRemaining - t) / (earlier.timeRemaining - later.timeRemaining);
    return {
      fallTime: lerp(earlier.fallTime, later.fallTime, progress),
      spawnInterval: lerp(earlier.spawnInterval, later.spawnInterval, progress),
      hazardShare: lerp(earlier.hazardShare, later.hazardShare, progress),
    };
  }
  return last;
}

export type Phase = 'warmUp' | 'rushHour' | 'marketMadness';

// Warm-up 90–61 s, rush hour 60–31 s, market madness 30–0 s. Phases only label the curve (banner, HUD);
// difficulty itself comes from difficultyAt and is continuous across the boundaries.
export function phaseAt(timeRemaining: number): Phase {
  if (timeRemaining > 60) return 'warmUp';
  if (timeRemaining > 30) return 'rushHour';
  return 'marketMadness';
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

// Fairness guards (NMH-13).
export const MAX_HAZARD_STREAK = 2;
// Random lane picks to try before falling back to the nearest reachable lane.
export const LANE_RETRIES = 3;

// When an item spawned at `spawnedAt` (spawner clock) reaches the basket mouth.
export function arrivalTime(spawnedAt: number, startY: number, speed: number): number {
  return spawnedAt + (startY - BASKET_MOUTH.centerY) / speed;
}

// Can the basket, at keyboard speed (the slower control), get from one lane to the other between
// the two arrivals? Pointer input can jump instantly, so this is the worst case. The gap is taken
// either way round, in case a faster later item overtakes a slower earlier one.
export function isReachable(fromX: number, fromArrival: number, toX: number, toArrival: number): boolean {
  return Math.abs(toX - fromX) <= BASKET_MAX_SPEED * Math.abs(toArrival - fromArrival) + 1e-9;
}

export class Spawner {
  private untilNextSpawn = FIRST_SPAWN_DELAY;
  // Seconds of play this round; spawn and arrival times are measured on it.
  private clock = 0;
  private previous: { x: number; arrival: number } | null = null;
  private hazardStreak = 0;

  constructor(
    private readonly mintId: () => number,
    private readonly random: () => number = Math.random,
  ) {}

  reset(): void {
    this.untilNextSpawn = FIRST_SPAWN_DELAY;
    this.clock = 0;
    this.previous = null;
    this.hazardStreak = 0;
  }

  // Counts down in seconds, so the spawn rate is the same at any frame rate.
  update(state: GameState, dt: number): void {
    const settings = difficultyAt(state.timeRemaining);
    this.clock += dt;
    this.untilNextSpawn -= dt;
    while (this.untilNextSpawn <= 0) {
      // A spawn that fell due partway through this frame has already been falling for `late` seconds.
      const late = -this.untilNextSpawn;
      state.items.push(this.spawn(settings, late));
      this.untilNextSpawn += settings.spawnInterval;
    }
  }

  private spawn(settings: DifficultySettings, late: number): FallingItem {
    // After two hazards in a row the next item is always fresh.
    const hazard = this.hazardStreak < MAX_HAZARD_STREAK && this.random() < settings.hazardShare;
    const definition = weightedPick(hazard ? HAZARD_ITEMS : FRESH_ITEMS, this.random);
    this.hazardStreak = hazard ? this.hazardStreak + 1 : 0;

    const speed = fallSpeed(settings);
    // Bottom edge starts at the top of the play area: just out of view.
    const startY = PLAY_AREA.top + definition.height / 2;
    const arrival = arrivalTime(this.clock - late, startY, speed);
    const x = this.pickLane(arrival);
    this.previous = { x, arrival };

    return {
      id: this.mintId(),
      type: definition.id,
      x,
      y: startY - speed * late,
      speed,
      resolved: false,
    };
  }

  private randomLane(): number {
    return LANES[Math.min(LANE_COUNT - 1, Math.floor(this.random() * LANE_COUNT))];
  }

  // A random lane the basket can reach from the previous item's lane in time. Retries a few random
  // picks, then takes the reachable lane nearest the last pick. The previous lane itself is always
  // reachable, so a fallback always exists.
  private pickLane(arrival: number): number {
    const previous = this.previous;
    let pick = this.randomLane();
    if (!previous) return pick;
    const reachable = (x: number) => isReachable(previous.x, previous.arrival, x, arrival);

    for (let attempt = 1; attempt < LANE_RETRIES && !reachable(pick); attempt++) pick = this.randomLane();
    if (reachable(pick)) return pick;

    let nearest = previous.x;
    for (const lane of LANES) {
      if (reachable(lane) && Math.abs(lane - pick) < Math.abs(nearest - pick)) nearest = lane;
    }
    return nearest;
  }
}

// Moves every item down by speed x dt.
export function moveItems(state: GameState, dt: number): void {
  for (const item of state.items) item.y -= item.speed * dt;
}

// Drops the items that have fully left the bottom and returns them, marked resolved like catches, so
// scoring can charge a life for missed fresh produce exactly once. Run after collision, so a frame
// that sweeps an item through the mouth and out of the bottom counts it as caught, not missed.
export function removeExitedItems(state: GameState): readonly FallingItem[] {
  let exited: FallingItem[] | null = null;
  // Compacts the list in place: no new arrays on the usual frame where nothing leaves.
  let kept = 0;
  for (const item of state.items) {
    const gone = item.y + ITEM_DEFINITIONS[item.type].height / 2 < PLAY_AREA.bottom;
    if (!gone) {
      state.items[kept++] = item;
      continue;
    }
    if (!item.resolved) {
      item.resolved = true;
      (exited ??= []).push(item);
    }
  }
  state.items.length = kept;
  return exited ?? NO_ITEMS;
}

const NO_ITEMS: readonly FallingItem[] = Object.freeze([]);
