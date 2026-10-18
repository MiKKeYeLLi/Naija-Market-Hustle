import { createScene } from './render/scene';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element');

const view = createScene(canvas);

// Until the game loop lands (NMH-03), draw once on load; the scene redraws itself on resize.
view.render();
