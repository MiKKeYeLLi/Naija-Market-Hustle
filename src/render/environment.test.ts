import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../game/items';
import { BASKET_HEIGHT, BASKET_Y, PLAY_AREA } from '../game/playArea';
import { BACKDROP_MAX_Z, GROUND_Y, createEnvironment } from './environment';

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

describe('market backdrop', () => {
  const environment = createEnvironment();
  const parts = meshes(environment.group);

  it('is two static meshes: the sky and one merged market', () => {
    expect(parts.map((mesh) => mesh.name).sort()).toEqual(['market', 'sky']);
    environment.group.traverse((object) => expect(object.matrixAutoUpdate).toBe(false));
  });

  it('never reaches the play plane: every vertex is behind it or below the play area', () => {
    for (const mesh of parts) {
      const position = mesh.geometry.getAttribute('position');
      const world = new THREE.Vector3();
      let offenders = 0;
      for (let i = 0; i < position.count; i++) {
        world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const behind = world.z <= BACKDROP_MAX_Z + 1e-6;
        const belowPlay = world.y < PLAY_AREA.bottom;
        if (!behind && !belowPlay) offenders++;
      }
      expect(offenders, mesh.name).toBe(0);
    }
  });

  it('keeps the ground below the lowest point any item or the basket can occupy while in play', () => {
    const lowestBasket = BASKET_Y - BASKET_HEIGHT / 2;
    expect(GROUND_Y).toBeLessThan(PLAY_AREA.bottom);
    expect(GROUND_Y).toBeLessThan(lowestBasket);
    // An item is still in play while its top edge is above the bottom edge.
    const tallest = Math.max(...Object.values(ITEM_DEFINITIONS).map((item) => item.height));
    expect(PLAY_AREA.bottom - tallest / 2).toBeGreaterThan(GROUND_Y - tallest);
  });

  it('bakes its colours and draws unlit, so scene lights cannot dim it', () => {
    for (const mesh of parts) {
      expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect((mesh.material as THREE.MeshBasicMaterial).vertexColors).toBe(true);
      expect(mesh.geometry.getAttribute('color')).toBeDefined();
    }
  });

  it('includes the green-and-white canopy stripes and stays bright', () => {
    const market = parts.find((mesh) => mesh.name === 'market')!;
    const colors = market.geometry.getAttribute('color');
    const color = new THREE.Color();
    let greenish = 0;
    let light = 0;
    for (let i = 0; i < colors.count; i++) {
      // Vertex colours are stored linear; judge them as displayed (sRGB).
      color.fromBufferAttribute(colors, i);
      const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
      if (hsl.h > 0.35 && hsl.h < 0.45 && hsl.s > 0.4) greenish++;
      if (hsl.l > 0.6) light++;
    }
    expect(greenish).toBeGreaterThan(0);
    // Most of the backdrop is light: produce in front reads by brightness as well as hue.
    expect(light / colors.count).toBeGreaterThan(0.4);
  });

  it('frees its geometry and materials on dispose', () => {
    const scene = new THREE.Scene();
    const disposable = createEnvironment();
    scene.add(disposable.group);
    const disposed: string[] = [];
    for (const mesh of meshes(disposable.group)) {
      mesh.geometry.addEventListener('dispose', () => disposed.push(`${mesh.name}:geometry`));
      (mesh.material as THREE.Material).addEventListener('dispose', () => disposed.push(`${mesh.name}:material`));
    }
    disposable.dispose();
    expect(disposed.sort()).toEqual(['market:geometry', 'market:material', 'sky:geometry', 'sky:material']);
    expect(scene.children).toHaveLength(0);
  });
});
