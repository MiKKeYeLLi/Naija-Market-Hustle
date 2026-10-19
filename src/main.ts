import { Game } from './game/Game';
import { KeyboardControls, PauseControls, PointerControls } from './game/controls';
import { ITEM_TYPES } from './game/items';
import { BASKET_Y } from './game/playArea';
import { loadBestScore, loadSoundOn, saveSoundOn } from './game/storage';
import { ItemMeshSync } from './render/itemSync';
import { animateItemModel, createBasketModel, createItemModel } from './render/models';
import { createScene } from './render/scene';
import { PhaseBanner } from './ui/banner';
import { Hud } from './ui/hud';
import { PauseScreen, ResultsScreen, StartScreen } from './ui/screens';
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

const items = new ItemMeshSync(view.scene);

const keyboard = new KeyboardControls(window);
keyboard.attach();

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('Missing #ui-root element');
const banner = new PhaseBanner(uiRoot);

// Always shown (under the start screen's veil too), so the space the scene reserves for it never
// changes when a round starts and the play area never jumps.
const hud = new Hud(uiRoot, { onPause: () => game.pause() });
hud.show();
// Fit the play area below the HUD strip, tracking its real height (safe areas, font scaling).
new ResizeObserver(() => view.setTopInset(hud.height)).observe(hud.element);

// The round only starts from this button: the timer stays at 90 in `ready` until it is pressed.
const startScreen = new StartScreen(uiRoot, {
  soundOn: loadSoundOn(),
  onStart: () => game.start(),
  // NMH-22 plays (or silences) the sounds; the choice is remembered from here.
  onSoundChange: (on) => saveSoundOn(on),
});

// Shown from the gameOver status change, which the state machine fires exactly once per round.
const resultsScreen = new ResultsScreen(uiRoot, {
  onPlayAgain: () => {
    game.reset();
    game.start();
  },
});

const pauseScreen = new PauseScreen(uiRoot, {
  onResume: () => game.resume(),
  // A fresh round straight away; the best score carries over through reset().
  onRestart: () => {
    game.reset();
    game.start();
  },
});

const game = new Game({
  steering: keyboard,
  bestScore: loadBestScore(),
  // Per-round visuals go with the round, immediately rather than on the next frame. Controls,
  // screens and the HUD are created once for the page and never re-attached, so nothing piles up.
  onReset: () => {
    items.clear();
    banner.hide();
  },
  onPhaseChange: (phase) => banner.show(phase),
  onStatusChange: (status) => {
    // A banner never lingers over an overlay, the results or a fresh round.
    if (status !== 'playing') banner.hide();
    if (status === 'ready') startScreen.show(game.state.bestScore);
    if (status === 'playing') startScreen.hide();
    if (status === 'paused') pauseScreen.show();
    else pauseScreen.hide();
    if (status === 'gameOver') resultsScreen.show(game.state);
    else resultsScreen.hide();
    hud.setPausable(status === 'playing');
  },
  render: (state) => {
    hud.update(state);
    basket.position.x = state.basketX;
    const seconds = performance.now() / 1000;
    items.sync(state.items, seconds);
    for (const model of gallery) animateItemModel(model, seconds);
    view.render();
  },
});

const pointer = new PointerControls(canvas, game, view.clientToPlayX);
pointer.attach();

// P / Esc toggle pause; hiding the tab pauses.
const pauseKeys = new PauseControls(window, document, game);
pauseKeys.attach();

// The game boots in `ready`, which never fires a status change, so show the start screen directly.
startScreen.show(game.state.bestScore);

// ?debug exposes the game objects to the console, e.g. game.state.
if (params.has('debug')) {
  Object.assign(window, { game, pointer, keyboard, view, items });
}
// ?autostart skips the start screen and begins a round on load (development shortcut).
if (params.has('autostart')) game.start();
