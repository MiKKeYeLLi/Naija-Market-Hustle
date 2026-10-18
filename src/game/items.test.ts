import { describe, expect, it } from 'vitest';
import { FRESH_ITEMS, HAZARD_ITEMS, ITEM_DEFINITIONS, ITEM_TYPES, createItemIdMinter } from './items';
import { BASKET_WIDTH } from './playArea';

// Every non-test source file in game/, as text, to guard the no-three.js rule.
const gameSources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('item definitions', () => {
  it('match the PRD Items and scoring table', () => {
    const table = ITEM_TYPES.map(({ id, kind, cashEffect, lifeEffect, spawnWeight }) => [
      id,
      kind,
      cashEffect,
      lifeEffect,
      spawnWeight,
    ]);
    expect(table).toEqual([
      ['tomato', 'fresh', 100, 0, 25],
      ['pepper', 'fresh', 150, 0, 20],
      ['onion', 'fresh', 120, 0, 20],
      ['plantain', 'fresh', 200, 0, 10],
      ['corn', 'fresh', 80, 0, 25],
      ['rottenTomato', 'hazard', -100, -1, 50],
      ['rottenPepper', 'hazard', -150, -1, 50],
    ]);
  });

  it('splits into 5 fresh and 2 hazard types', () => {
    expect(FRESH_ITEMS.map((item) => item.id)).toEqual(['tomato', 'pepper', 'onion', 'plantain', 'corn']);
    expect(HAZARD_ITEMS.map((item) => item.id)).toEqual(['rottenTomato', 'rottenPepper']);
  });

  it('keys every definition by its own id', () => {
    for (const [key, item] of Object.entries(ITEM_DEFINITIONS)) expect(item.id).toBe(key);
  });

  it('gives every item a positive weight, a hitbox that fits the basket and a hex colour', () => {
    for (const item of ITEM_TYPES) {
      expect(item.spawnWeight).toBeGreaterThan(0);
      expect(item.width).toBeGreaterThan(0);
      expect(item.width).toBeLessThan(BASKET_WIDTH);
      expect(item.height).toBeGreaterThan(0);
      expect(item.colorKey).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps cash and life effects consistent with each kind', () => {
    for (const item of FRESH_ITEMS) {
      expect(item.cashEffect).toBeGreaterThan(0);
      expect(item.lifeEffect).toBe(0);
    }
    for (const item of HAZARD_ITEMS) {
      expect(item.cashEffect).toBeLessThan(0);
      expect(item.lifeEffect).toBe(-1);
    }
  });
});

describe('createItemIdMinter', () => {
  it('mints unique ids', () => {
    const mint = createItemIdMinter();
    const ids = Array.from({ length: 10_000 }, mint);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each minter its own sequence', () => {
    const first = createItemIdMinter();
    const second = createItemIdMinter();
    first();
    first();
    expect(second()).toBe(1);
  });
});

describe('game/ architecture', () => {
  it('has no three.js imports', () => {
    const files = Object.keys(gameSources);
    expect(files).toContain('./items.ts');
    for (const [file, source] of Object.entries(gameSources)) {
      // Catches `from 'three'`, `import 'three'`, `import('three')` and three/addons paths.
      expect(source, file).not.toMatch(/\b(?:from|import)\s*\(?\s*['"]three(?:\/[^'"]*)?['"]/);
    }
  });
});
