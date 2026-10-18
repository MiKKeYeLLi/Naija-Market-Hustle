// Keeps one item model in the scene per falling item, matched by item ID. Reads game state only.

import * as THREE from 'three';
import type { FallingItem } from '../game/state';
import { animateItemModel, createItemModel } from './models';

export class ItemMeshSync {
  private readonly meshes = new Map<number, THREE.Group>();

  constructor(private readonly parent: THREE.Object3D) {}

  get size(): number {
    return this.meshes.size;
  }

  // `motion` scales the hazard wobble; 0 turns it off for reduced motion.
  sync(items: readonly FallingItem[], timeSeconds: number, motion = 1): void {
    const live = new Set<number>();
    for (const item of items) {
      live.add(item.id);
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        // ID as phase, so neighbouring hazards don't wobble in step.
        mesh = createItemModel(item.type, item.id);
        this.meshes.set(item.id, mesh);
        this.parent.add(mesh);
      }
      mesh.position.set(item.x, item.y, 0);
      animateItemModel(mesh, timeSeconds, motion);
    }

    // Geometries and materials are shared, so removing a model needs no disposal.
    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this.parent.remove(mesh);
      this.meshes.delete(id);
    }
  }

  clear(): void {
    this.sync([], 0);
  }
}
