// The game itself: scene, game loop, controls, screens, sound and effects, wired together.
// main.ts calls startGame() only once it knows WebGL works.

import { Game } from './game/Game';
import { KeyboardControls, PauseControls, PointerControls } from './game/controls';
import { ITEM_DEFINITIONS, ITEM_TYPES } from './game/items';
import { BASKET_MOUTH, BASKET_Y } from './game/playArea';
import { loadBestScore, loadSoundOn, saveBestScore, saveSoundOn } from './game/storage';
import { ParticleBursts } from './render/effects';
import { createEnvironment } from './render/environment';
import { ItemMeshSync } from './render/itemSync';
import { animateItemModel, createBasketModel, createItemModel, disposeModelResources } from './render/models';
import { createScene } from './render/scene';
import { PhaseBanner } from './ui/banner';
import { GraphicsNotice } from './ui/fallback';
import { Feedback, isPenalty } from './ui/feedback';
import { Hud } from './ui/hud';
import { PerfOverlay } from './ui/perf';
import { PauseScreen, ResultsScreen, StartScreen } from './ui/screens';
import { SoundBoard } from './audio';

export function startGame(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) throw new Error('Missing #game-canvas element');

  const params = new URLSearchParams(window.location.search);
  const backdropCanvas = document.querySelector<HTMLCanvasElement>('#backdrop-canvas') ?? undefined;
  const view = createScene(canvas, backdropCanvas);

  // Read live, so turning the OS setting on mid-game takes effect straight away.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;

  // Static market backdrop behind the play plane, drawn once per resize rather than every frame.
  const environment = createEnvironment();
  view.setBackdrop(environment.group);

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
  // ?perf shows fps, the round's worst second and draw calls, for profiling on a real phone.
  const perf = params.has('perf') ? new PerfOverlay(uiRoot) : null;

  const hud = new Hud(uiRoot, { onPause: () => game.pause() });
  hud.show();
  // Fit the play area below the HUD strip, tracking its real height (safe areas, font scaling).
  new ResizeObserver(() => view.setTopInset(hud.height)).observe(hud.element);

  // Synthesised sounds. Nothing is created or played until the first tap, click or key press.
  const sound = new SoundBoard({ enabled: loadSoundOn() });
  sound.listenForUnlock(window);

  // The round only starts from this button: the timer stays at 90 in `ready` until it is pressed.
  const startScreen = new StartScreen(uiRoot, {
    soundOn: sound.isEnabled,
    onStart: () => game.start(),
    // Takes effect at once and is remembered for next time.
    onSoundChange: (on) => {
      sound.setEnabled(on);
      saveSoundOn(on);
    },
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
      // A coin ding for a fresh catch; the buzz for anything that cost a life; silence for a missed hazard.
      if (isPenalty(event)) sound.play('penalty');
      else if (event.type === 'catch') sound.play('catch');
      if (event.type === 'catch' && !reducedMotion()) {
        particles.burst(event.item.x, BASKET_MOUTH.centerY, ITEM_DEFINITIONS[event.item.type].colorKey);
      }
    },
    onPhaseChange: (phase) => banner.show(phase),
    onStatusChange: (status, previous) => {
      if (status === 'playing' && previous === 'ready') perf?.resetRound();
      // A banner never lingers over an overlay, the results or a fresh round.
      if (status !== 'playing') banner.hide();
      if (status === 'ready') startScreen.show(game.state.bestScore);
      if (status === 'playing') startScreen.hide();
      if (status === 'paused') pauseScreen.show();
      else pauseScreen.hide();
      // Game has already decided isNewBest; saveBestScore re-checks against storage, so a lower round
      // never overwrites the best (even one saved from another tab).
      if (status === 'gameOver' && game.state.isNewBest) saveBestScore(game.state.bestScore);
      if (status === 'gameOver') {
        sound.play('gameOver');
        resultsScreen.show(game.state);
      } else {
        resultsScreen.hide();
      }
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
      if (perf) {
        const { render, memory } = view.renderer.info;
        perf.frame(performance.now(), { calls: render.calls, triangles: render.triangles, geometries: memory.geometries });
      }
    },
  });

  const pointer = new PointerControls(canvas, game, view.clientToPlayX);
  pointer.attach();

  // P / Esc toggle pause; hiding the tab pauses.
  const pauseKeys = new PauseControls(window, document, game);
  pauseKeys.attach();

  // If the GPU drops the WebGL context mid-game (driver reset, too many tabs), pause the round and
  // say why; when it comes back, redraw everything and let the player resume from the pause screen.
  const graphicsNotice = new GraphicsNotice(uiRoot);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // allows the browser to restore the context
    if (game.state.status === 'playing') game.pause();
    graphicsNotice.show('Graphics paused: your device reset the 3D view. It should come back in a moment.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    view.refresh();
    graphicsNotice.hide();
  });

  // The game boots in `ready`, which never fires a status change, so show the start screen directly.
  startScreen.show(game.state.bestScore);

  // Full teardown: stops the loop, removes every listener and frees every geometry, material and the
  // WebGL context. Runs when the page is really going away (not when it is kept in the back/forward
  // cache, which may restore it).
  function teardown(): void {
    game.dispose();
    pointer.detach();
    keyboard.detach();
    pauseKeys.detach();
    sound.dispose();
    items.dispose();
    particles.dispose();
    environment.dispose();
    basket.removeFromParent();
    for (const model of gallery) model.removeFromParent();
    disposeModelResources();
    perf?.dispose();
    view.dispose();
  }
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) teardown();
  });

  // ?debug exposes the game objects to the console, e.g. game.state.
  if (params.has('debug')) {
    Object.assign(window, { game, pointer, keyboard, view, items, perf, teardown });
  }
  // ?autostart skips the start screen and begins a round on load (development shortcut).
  if (params.has('autostart')) game.start();
}
