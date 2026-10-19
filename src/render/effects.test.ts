import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PARTICLES_PER_BURST, PARTICLE_POOL, ParticleBursts } from './effects';

// Instance i is drawn when its matrix has a non-zero scale.
function visibleCount(bursts: ParticleBursts): number {
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  let visible = 0;
  for (let i = 0; i < PARTICLE_POOL; i++) {
    bursts.mesh.getMatrixAt(i, matrix);
    scale.setFromMatrixScale(matrix);
    if (scale.x > 0) visible++;
  }
  return visible;
}

describe('ParticleBursts', () => {
  it('is one pooled instanced mesh, added once', () => {
    const scene = new THREE.Scene();
    const bursts = new ParticleBursts(scene);
    expect(scene.children).toEqual([bursts.mesh]);
    expect(bursts.mesh.count).toBe(PARTICLE_POOL);
    expect(visibleCount(bursts)).toBe(0);
  });

  it('a burst wakes a handful of particles that fly and then expire', () => {
    const bursts = new ParticleBursts(new THREE.Scene(), () => 0.5);
    bursts.burst(1, -6, '#e53935');
    expect(bursts.active).toBe(PARTICLES_PER_BURST);
    bursts.update(1 / 60);
    expect(visibleCount(bursts)).toBe(PARTICLES_PER_BURST);
    for (let i = 0; i < 60; i++) bursts.update(1 / 60);
    expect(bursts.active).toBe(0);
    expect(visibleCount(bursts)).toBe(0);
  });

  it('freezes when dt is 0 (paused)', () => {
    const bursts = new ParticleBursts(new THREE.Scene());
    bursts.burst(0, 0, '#ffffff');
    bursts.update(0.1);
    const matrix = new THREE.Matrix4();
    bursts.mesh.getMatrixAt(0, matrix);
    const before = matrix.elements.slice();
    for (let i = 0; i < 100; i++) bursts.update(0);
    bursts.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements).toEqual(before);
    expect(bursts.active).toBe(PARTICLES_PER_BURST);
  });

  it('never grows: a thousand bursts reuse the same pool and the same objects', () => {
    const scene = new THREE.Scene();
    const bursts = new ParticleBursts(scene);
    const { geometry, material, instanceMatrix } = bursts.mesh;
    for (let i = 0; i < 1000; i++) {
      bursts.burst(i % 7, -6, i % 2 ? '#e53935' : '#f9c80e');
      bursts.update(1 / 60);
    }
    expect(scene.children).toHaveLength(1);
    expect(bursts.mesh.count).toBe(PARTICLE_POOL);
    expect(bursts.mesh.geometry).toBe(geometry);
    expect(bursts.mesh.material).toBe(material);
    expect(bursts.mesh.instanceMatrix).toBe(instanceMatrix);
    expect(bursts.active).toBeLessThanOrEqual(PARTICLE_POOL);
  });

  it('colours each burst with the caught item', () => {
    const bursts = new ParticleBursts(new THREE.Scene());
    bursts.burst(0, 0, '#f9c80e');
    const color = new THREE.Color();
    bursts.mesh.getColorAt(0, color);
    expect(color.getHexString()).toBe('f9c80e');
  });

  it('clears everything on reset', () => {
    const bursts = new ParticleBursts(new THREE.Scene());
    bursts.burst(0, 0, '#ffffff');
    bursts.update(1 / 60);
    bursts.clear();
    expect(bursts.active).toBe(0);
    expect(visibleCount(bursts)).toBe(0);
  });
});
