import { Game } from './game/Game';
import { KeyboardControls, PauseControls, PointerControls } from './game/controls';
import { ITEM_DEFINITIONS, ITEM_TYPES } from './game/items';
import { BASKET_MOUTH, BASKET_Y } from './game/playArea';
import { loadBestScore, loadSoundOn, saveBestScore, saveSoundOn } from './game/storage';
import { ParticleBursts } from './render/effects';
import { createEnvironment } from './render/environment';
import { ItemMeshSync } from './render/itemSync';
import { animateItemModel, createBasketModel, createItemModel } from './render/models';
import { createScene } from './render/scene';
import { PhaseBanner } from './ui/banner';
import { Feedback } from './ui/feedback';
import { Hud } from './ui/hud';
import { PauseScreen, ResultsScreen, StartScreen } from './ui/screens';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element');

const params = new URLSearchParams(window.location.search);
const backdropCanvas = document.querySelector<HTMLCanvasElement>('#backdrop-canvas') ?? undefined;
const view = createScene(canvas, backdropCanvas);

// Read live, so turning the OS setting on mid-game takes effect straight away.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => motionQuery.matches;

// Static market backdrop behind the play plane, drawn once per resize rather than every frame.
view.setBackdrop(createEnvironment().group);

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
const particles = new ParticleBursts(view.scene);

const keyboard = new KeyboardControls(window);
keyboard.attach();

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('Missing #ui-root element');
const banner = new PhaseBanner(uiRoot);

// Labels and the flash sit above the canvas but under the HUD and screens, which are added after.
const feedback = new Feedback(uiRoot, {
  project: view.playToClient,
  shakeTargets: backdropCanvas ? [backdropCanvas, canvas] : [canvas],
  reducedMotion,
});

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
    particles.clear();
    feedback.clear();
  },
  onFeedback: (event) => {
    feedback.handle(event);
    if (event.type === 'catch' && !reducedMotion()) {
      particles.burst(event.item.x, BASKET_MOUTH.centerY, ITEM_DEFINITIONS[event.item.type].colorKey);
    }
  },
  onPhaseChange: (phase) => banner.show(phase),
  onStatusChange: (status) => {
    // A banner never lingers over an overlay, the results or a fresh round.
    if (status !== 'playing') banner.hide();
    if (status === 'ready') startScreen.show(game.state.bestScore);
    if (status === 'playing') startScreen.hide();
    if (status === 'paused') pauseScreen.show();
    else pauseScreen.hide();
    // Game has already decided isNewBest; saveBestScore re-checks against storage, so a lower round
    // never overwrites the best (even one saved from another tab).
    if (status === 'gameOver' && game.state.isNewBest) saveBestScore(game.state.bestScore);
    if (status === 'gameOver') resultsScreen.show(game.state);
    else resultsScreen.hide();
    hud.setPausable(status === 'playing');
  },
  render: (state, dt) => {
    hud.update(state);
    basket.position.x = state.basketX;
    const seconds = performance.now() / 1000;
    // Reduced motion also stills the hazard wobble; the X marker still identifies them.
    items.sync(state.items, seconds, reducedMotion() ? 0 : 1);
    // Particles freeze with the round (paused, results).
    particles.update(state.status === 'playing' ? dt : 0);
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
