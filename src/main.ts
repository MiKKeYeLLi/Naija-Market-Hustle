import { Game } from './game/Game';
import { KeyboardControls, PointerControls } from './game/controls';
import { ITEM_TYPES } from './game/items';
import { BASKET_Y } from './game/playArea';
import { animateItemModel, createBasketModel, createItemModel } from './render/models';
import { createScene } from './render/scene';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element');

const params = new URLSearchParams(window.location.search);
const view = createScene(canvas);

const basket = createBasketModel();
basket.position.y = BASKET_Y;
view.scene.add(basket);

// ?models lays every item out in a grid to check shapes at phone size; ?grey checks hazards without colour.
const gallery = params.has('models')
  ? ITEM_TYPES.map((item, index) => {
      const model = createItemModel(item.id, index);
      model.position.set(index % 2 === 0 ? -2 : 2, 5.5 - Math.floor(index / 2) * 3, 0);
      view.scene.add(model);
      return model;
    })
  : [];
if (params.has('grey')) canvas.style.filter = 'grayscale(1)';

const keyboard = new KeyboardControls(window);
keyboard.attach();

const game = new Game({
  steering: keyboard,
  render: (state) => {
    basket.position.x = state.basketX;
    const seconds = performance.now() / 1000;
    for (const model of gallery) animateItemModel(model, seconds);
    view.render();
  },
});

const pointer = new PointerControls(canvas, game, view.clientToPlayX);
pointer.attach();

// No screens yet (NMH-14); with ?debug, drive the state machine from the console, e.g. game.start().
if (params.has('debug')) {
  Object.assign(window, { game, pointer, keyboard });
}
