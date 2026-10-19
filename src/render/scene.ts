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
  // Maps a pointer's clientX to x on the play plane (z = 0).
  clientToPlayX(clientX: number): number;
  // Maps a point on the play plane (z = 0) to client pixels, for DOM overlays such as cash labels.
  playToClient(x: number, y: number): { x: number; y: number };
  // Reserve pixels at the top (the HUD strip) so the play area fits below them.
  setTopInset(pixels: number): void;
  // Static scenery behind the play plane: drawn once per resize, not every frame.
  setBackdrop(object: THREE.Object3D): void;
  render(): void;
  dispose(): void;
}

export interface FitResult {
  // Play-area units per CSS pixel on the play plane (z = 0), the same on both axes.
  unitsPerPixel: number;
  // Camera height: lifted so the play area centres in the space below the top inset.
  cameraY: number;
  // Camera distance for the fixed FOV.
  distance: number;
}

// Keeps the FOV fixed and pulls the camera back until the whole play area (plus margin) fits in the
// canvas below `topInset` pixels. Tall screens are limited by width, wide screens by height.
export function computeFit(width: number, height: number, topInset = 0): FitResult {
  const usableHeight = Math.max(1, height - topInset);
  const neededHeight = PLAY_AREA.height * (1 + FIT_MARGIN);
  const neededWidth = PLAY_AREA.width * (1 + FIT_MARGIN);
  const unitsPerPixel = Math.max(neededHeight / usableHeight, neededWidth / width);
  const visibleHalfHeight = (unitsPerPixel * height) / 2;
  return {
    unitsPerPixel,
    // Moving the camera up by half the inset (in units) moves the play area down by the same amount.
    cameraY: (unitsPerPixel * topInset) / 2,
    distance: visibleHalfHeight / Math.tan(THREE.MathUtils.degToRad(FOV_DEGREES / 2)),
  };
}

// `backdropCanvas` (optional) is a 2D canvas behind the game canvas. Static scenery given to
// setBackdrop() is drawn into it once per resize instead of every frame; the game canvas stays
// transparent and each frame draws only what moves.
export function createScene(canvas: HTMLCanvasElement, backdropCanvas?: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const backdropScene = new THREE.Scene();
  const backdropContext = backdropCanvas?.getContext('2d') ?? null;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Blob shadows only (NMH-07), so real-time shadow maps stay off.
  renderer.shadowMap.enabled = false;

  // No background: the game canvas is transparent over the backdrop canvas (or the page colour).
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);

  const hemisphere = new THREE.HemisphereLight('#fff4d6', '#c98a4b', 1.4);
  const sun = new THREE.DirectionalLight('#ffd9a0', 1.8);
  sun.position.set(4, 8, 6);
  scene.add(hemisphere, sun);

  if (new URLSearchParams(window.location.search).has('debug')) {
    scene.add(createDebugFrame());
  }

  // Pixels at the top of the canvas reserved for the HUD; set by setTopInset().
  let topInset = 0;
  let unitsPerPixel = 1;

  function fit(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const result = computeFit(width, height, topInset);
    unitsPerPixel = result.unitsPerPixel;
    camera.position.set(0, result.cameraY, result.distance);
    camera.lookAt(0, result.cameraY, 0);
    drawBackdrop();
  }

  // Renders the static scenery once with the current camera and copies it to the backdrop canvas.
  // The copy happens in the same task as the render, so no preserveDrawingBuffer is needed.
  function drawBackdrop(): void {
    if (!backdropCanvas || !backdropContext || backdropScene.children.length === 0) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (backdropCanvas.width !== size.x || backdropCanvas.height !== size.y) {
      backdropCanvas.width = size.x;
      backdropCanvas.height = size.y;
    }
    renderer.render(backdropScene, camera);
    backdropContext.clearRect(0, 0, size.x, size.y);
    backdropContext.drawImage(renderer.domElement, 0, 0);
    // Put the live scene back on the game canvas straight away.
    renderer.render(scene, camera);
  }

  function setBackdrop(object: THREE.Object3D): void {
    backdropScene.add(object);
    if (!backdropContext) scene.add(object); // no backdrop canvas: draw it live instead
    drawBackdrop();
  }

  function setTopInset(pixels: number): void {
    const next = Math.max(0, Math.round(pixels));
    if (next === topInset) return;
    topInset = next;
    onResize();
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

  // The camera looks straight down the z axis (x = 0), so the play plane maps linearly to the canvas.
  const projected = new THREE.Vector3();
  function playToClient(x: number, y: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    projected.set(x, y, 0).project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  function clientToPlayX(clientX: number): number {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left - rect.width / 2) * unitsPerPixel;
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

  return { renderer, scene, camera, clientToPlayX, playToClient, setTopInset, setBackdrop, render, dispose };
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
