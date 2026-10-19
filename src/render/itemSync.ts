// Keeps one item model in the scene per falling item, matched by item ID. Reads game state only.
// Models are pooled per item type: a caught or missed item's model is parked and reused by the next
// item of that type, so a round creates only as many models as are ever on screen at once.

import * as THREE from 'three';
import type { ItemTypeId } from '../game/items';
import type { FallingItem } from '../game/state';
import { animateItemModel, createItemModel } from './models';

export class ItemMeshSync {
  private readonly meshes = new Map<number, THREE.Group>();
  private readonly pool = new Map<ItemTypeId, THREE.Group[]>();
  // Reused every frame instead of allocating a new set.
  private readonly live = new Set<number>();
  // Models ever built; stays bounded by the most items on screen at once.
  created = 0;

  constructor(private readonly parent: THREE.Object3D) {}

  get size(): number {
    return this.meshes.size;
  }

  get pooled(): number {
    let parked = 0;
    for (const models of this.pool.values()) parked += models.length;
    return parked;
  }

  // `motion` scales the hazard wobble; 0 turns it off for reduced motion.
  sync(items: readonly FallingItem[], timeSeconds: number, motion = 1): void {
    this.live.clear();
    for (const item of items) {
      this.live.add(item.id);
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        mesh = this.acquire(item);
        this.meshes.set(item.id, mesh);
        this.parent.add(mesh);
      }
      mesh.position.set(item.x, item.y, 0);
      animateItemModel(mesh, timeSeconds, motion);
    }

    for (const [id, mesh] of this.meshes) {
      if (this.live.has(id)) continue;
      this.release(mesh);
      this.meshes.delete(id);
    }
  }

  clear(): void {
    this.live.clear();
    for (const mesh of this.meshes.values()) this.release(mesh);
    this.meshes.clear();
  }

  // Drops the pool too (full teardown). Geometries and materials are shared and freed by
  // disposeModelResources().
  dispose(): void {
    this.clear();
    this.pool.clear();
  }

  private acquire(item: FallingItem): THREE.Group {
    const parked = this.pool.get(item.type)?.pop();
    if (parked) {
      // ID as phase, so neighbouring hazards don't wobble in step.
      parked.userData.phase = item.id;
      parked.rotation.set(0, 0, 0);
      return parked;
    }
    this.created++;
    return createItemModel(item.type, item.id);
  }

  private release(mesh: THREE.Group): void {
    mesh.removeFromParent();
    const type = mesh.userData.type as ItemTypeId;
    let models = this.pool.get(type);
    if (!models) {
      models = [];
      this.pool.set(type, models);
    }
    models.push(mesh);
  }
}
