// Item definitions and spawn weights: the one table spawning, scoring and rendering all read from.
// Values are starting defaults from the PRD's Items and scoring table; tune them here after playtesting.

export type ItemKind = 'fresh' | 'hazard';

export type ItemTypeId =
  | 'tomato'
  | 'pepper'
  | 'onion'
  | 'plantain'
  | 'corn'
  | 'rottenTomato'
  | 'rottenPepper';

export interface ItemDefinition {
  id: ItemTypeId;
  label: string;
  kind: ItemKind;
  // Signed naira change when caught: positive for fresh, negative for hazards.
  cashEffect: number;
  // Signed lives change when caught.
  lifeEffect: number;
  // Relative weight within its kind; the fresh/hazard split comes from the difficulty curve.
  spawnWeight: number;
  // Hitbox in play-area units; NMH-07 builds each mesh to fit inside it.
  width: number;
  height: number;
  // Main body colour for the mesh, the catch particles and the floating label.
  colorKey: string;
}

export const ITEM_DEFINITIONS: Readonly<Record<ItemTypeId, ItemDefinition>> = {
  tomato: {
    id: 'tomato',
    label: 'Tomatoes',
    kind: 'fresh',
    cashEffect: 100,
    lifeEffect: 0,
    spawnWeight: 25,
    width: 0.8,
    height: 0.8,
    colorKey: '#e53935',
  },
  pepper: {
    id: 'pepper',
    label: 'Peppers',
    kind: 'fresh',
    cashEffect: 150,
    lifeEffect: 0,
    spawnWeight: 20,
    width: 0.6,
    height: 1,
    colorKey: '#ff6d00',
  },
  onion: {
    id: 'onion',
    label: 'Onions',
    kind: 'fresh',
    cashEffect: 120,
    lifeEffect: 0,
    spawnWeight: 20,
    width: 0.8,
    height: 0.75,
    colorKey: '#a8457a',
  },
  plantain: {
    id: 'plantain',
    label: 'Plantains',
    kind: 'fresh',
    cashEffect: 200,
    lifeEffect: 0,
    spawnWeight: 10,
    width: 1.2,
    height: 0.55,
    colorKey: '#f9c80e',
  },
  corn: {
    id: 'corn',
    label: 'Corn',
    kind: 'fresh',
    cashEffect: 80,
    lifeEffect: 0,
    spawnWeight: 25,
    width: 0.55,
    height: 1.2,
    colorKey: '#f2d649',
  },
  rottenTomato: {
    id: 'rottenTomato',
    label: 'Rotten tomato',
    kind: 'hazard',
    cashEffect: -100,
    lifeEffect: -1,
    spawnWeight: 50,
    width: 0.8,
    height: 0.8,
    colorKey: '#6d5d2f',
  },
  // The PRD's "other spoiled goods". A pepper keeps the two hazards different shapes (sphere vs cone)
  // and mirrors the fresh pepper's +₦150 the way the rotten tomato mirrors +₦100.
  rottenPepper: {
    id: 'rottenPepper',
    label: 'Rotten pepper',
    kind: 'hazard',
    cashEffect: -150,
    lifeEffect: -1,
    spawnWeight: 50,
    width: 0.6,
    height: 1,
    colorKey: '#58613a',
  },
};

export const ITEM_TYPES: readonly ItemDefinition[] = Object.values(ITEM_DEFINITIONS);
export const FRESH_ITEMS: readonly ItemDefinition[] = ITEM_TYPES.filter((item) => item.kind === 'fresh');
export const HAZARD_ITEMS: readonly ItemDefinition[] = ITEM_TYPES.filter((item) => item.kind === 'hazard');

// Each minter counts up from 1. The game uses one for its whole lifetime, so IDs stay unique across
// restarts and render/ never mistakes a new item for an old mesh.
export function createItemIdMinter(): () => number {
  let lastId = 0;
  return () => ++lastId;
}
