// Catch particle bursts (NMH-21). One pooled InstancedMesh: a burst reuses the next free slots, so
// nothing is created after construction and every particle draws in a single call.

import * as THREE from 'three';

export const PARTICLE_POOL = 48;
export const PARTICLES_PER_BURST = 8;
const LIFETIME = 0.55;
const GRAVITY = -16;
// Just in front of the play plane, so bursts draw over the basket rim.
const Z = 0.6;

interface Particle {
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export class ParticleBursts {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(
    parent: THREE.Object3D,
    private readonly random: () => number = Math.random,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.16),
      new THREE.MeshBasicMaterial(),
      PARTICLE_POOL,
    );
    this.mesh.name = 'particles';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles = Array.from({ length: PARTICLE_POOL }, () => ({ age: LIFETIME, x: 0, y: 0, vx: 0, vy: 0, spin: 0 }));
    for (let i = 0; i < PARTICLE_POOL; i++) {
      this.mesh.setColorAt(i, this.color.set('#ffffff'));
      this.hide(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    parent.add(this.mesh);
  }

  get active(): number {
    return this.particles.filter((p) => p.age < LIFETIME).length;
  }

  // A small fountain of `color` chips from (x, y), spraying up and out.
  burst(x: number, y: number, color: string): void {
    this.color.set(color);
    for (let n = 0; n < PARTICLES_PER_BURST; n++) {
      const i = this.next;
      this.next = (this.next + 1) % PARTICLE_POOL;
      const angle = Math.PI * (0.15 + 0.7 * this.random());
      const speed = 3 + 3.5 * this.random();
      Object.assign(this.particles[i], {
        age: 0,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (this.random() - 0.5) * 18,
      });
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // Advances live particles; dt 0 (paused) freezes them.
  update(dt: number): void {
    if (dt <= 0) return;
    let changed = false;
    this.particles.forEach((p, i) => {
      if (p.age >= LIFETIME) return;
      p.age += dt;
      changed = true;
      if (p.age >= LIFETIME) {
        this.hide(i);
        return;
      }
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const life = 1 - p.age / LIFETIME;
      this.position.set(p.x, p.y, Z);
      this.rotation.setFromEuler(this.euler.set(p.age * p.spin, p.age * p.spin * 0.7, 0));
      this.scale.setScalar(0.4 + 0.6 * life);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
    });
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.particles.forEach((p, i) => {
      p.age = LIFETIME;
      this.hide(i);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  // Zero scale: the instance stays in the buffer but draws nothing.
  private hide(i: number): void {
    this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
  }
}
