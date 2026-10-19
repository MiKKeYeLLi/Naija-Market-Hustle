import { startGame } from './app';
import { showWebGLFallback, supportsWebGL } from './ui/fallback';
import './styles.css';

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('Missing #ui-root element');

// Without WebGL there is no 3D market to draw: say so clearly instead of showing a blank page.
if (!supportsWebGL()) {
  showWebGLFallback(uiRoot);
} else {
  try {
    startGame();
  } catch (error) {
    // WebGL was reported but the renderer still could not start (blocklisted GPU, lost driver).
    console.error(error);
    showWebGLFallback(uiRoot);
  }
}
