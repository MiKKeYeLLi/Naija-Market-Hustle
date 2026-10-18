import { Game } from './game/Game';
import { createScene } from './render/scene';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element');

const view = createScene(canvas);
const game = new Game({ render: () => view.render() });

// No screens yet (NMH-14); with ?debug, drive the state machine from the console, e.g. game.start().
if (new URLSearchParams(window.location.search).has('debug')) {
  Object.assign(window, { game });
}
