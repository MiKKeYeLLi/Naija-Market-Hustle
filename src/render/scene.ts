import * as THREE from 'three';
import { PLAY_AREA } from '../game/playArea';

const FOV_DEGREES = 30;
const MAX_PIXEL_RATIO = 2;
// Breathing room around the play area, as a fraction of its size.
const FIT_MARGIN = 0.04;

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render(): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Blob shadows only (NMH-07), so real-time shadow maps stay off.
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f6c27a');

  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);

  const hemisphere = new THREE.HemisphereLight('#fff4d6', '#c98a4b', 1.4);
  const sun = new THREE.DirectionalLight('#ffd9a0', 1.8);
  sun.position.set(4, 8, 6);
  scene.add(hemisphere, sun);

  if (new URLSearchParams(window.location.search).has('debug')) {
    scene.add(createDebugFrame());
  }

  function fit(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);

    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // Keep the FOV fixed and pull the camera back until the whole play area fits.
    // Tall screens are limited by width, wide screens by height.
    const halfHeight = (PLAY_AREA.height / 2) * (1 + FIT_MARGIN);
    const halfWidth = (PLAY_AREA.width / 2) * (1 + FIT_MARGIN);
    const visibleHalfHeight = Math.max(halfHeight, halfWidth / aspect);
    const distance = visibleHalfHeight / Math.tan(THREE.MathUtils.degToRad(FOV_DEGREES / 2));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
  }

  let resizeQueued = false;
  function onResize(): void {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      fit();
      render();
    });
  }

  function render(): void {
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  fit();

  function dispose(): void {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    renderer.dispose();
  }

  return { renderer, scene, camera, render, dispose };
}

// Visible with ?debug: play-area outline plus spheres at the corners and centre, to check fit and aspect.
function createDebugFrame(): THREE.Group {
  const group = new THREE.Group();
  const { left, right, top, bottom } = PLAY_AREA;

  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(left, top, 0),
      new THREE.Vector3(right, top, 0),
      new THREE.Vector3(right, bottom, 0),
      new THREE.Vector3(left, bottom, 0),
    ]),
    new THREE.LineBasicMaterial({ color: '#c0392b' }),
  );
  group.add(outline);

  const geometry = new THREE.SphereGeometry(0.4, 16, 12);
  const material = new THREE.MeshStandardMaterial({ color: '#2e8b57', flatShading: true });
  const inset = 0.4;
  const points: Array<[number, number]> = [
    [left + inset, top - inset],
    [right - inset, top - inset],
    [left + inset, bottom + inset],
    [right - inset, bottom + inset],
    [0, 0],
  ];
  for (const [x, y] of points) {
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, 0);
    group.add(marker);
  }
  return group;
}
