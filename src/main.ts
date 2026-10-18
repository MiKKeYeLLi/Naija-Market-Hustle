import * as THREE from 'three';
import { Game } from './game/Game';
import { PointerControls } from './game/controls';
import { BASKET_WIDTH, BASKET_Y } from './game/playArea';
import { createScene } from './render/scene';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element');

const view = createScene(canvas);

// Stand-in basket so pointer control is visible; NMH-07 replaces it with the woven model.
const basket = new THREE.Mesh(
  new THREE.BoxGeometry(BASKET_WIDTH, 0.8, 1),
  new THREE.MeshStandardMaterial({ color: '#a0522d', flatShading: true }),
);
basket.position.y = BASKET_Y;
view.scene.add(basket);

const game = new Game({
  render: (state) => {
    basket.position.x = state.basketX;
    view.render();
  },
});

const pointer = new PointerControls(canvas, game, view.clientToPlayX);
pointer.attach();

// No screens yet (NMH-14); with ?debug, drive the state machine from the console, e.g. game.start().
if (new URLSearchParams(window.location.search).has('debug')) {
  Object.assign(window, { game, pointer });
}
