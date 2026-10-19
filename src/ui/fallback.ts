// WebGL fallback and graphics-lost notice (NMH-24).

// True when the browser can create a WebGL context. A throwaway canvas, so the real one is untouched.
export function supportsWebGL(doc: Document = document): boolean {
  try {
    const probe = doc.createElement('canvas');
    const context = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (!context) return false;
    (context as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// Replaces the canvases with a plain explanation and what to try next.
export function showWebGLFallback(root: HTMLElement, doc: Document = document): HTMLElement {
  for (const id of ['game-canvas', 'backdrop-canvas']) {
    const canvas = doc.getElementById(id);
    if (canvas) canvas.hidden = true;
  }
  const screen = doc.createElement('section');
  screen.className = 'screen fallback-screen';
  screen.setAttribute('role', 'alert');
  screen.setAttribute('aria-labelledby', 'fallback-title');
  screen.innerHTML = `
    <div class="screen-card">
      <h1 id="fallback-title" class="screen-title">Naija Market Hustle</h1>
      <p class="screen-note"><strong>This browser can't show the 3D market.</strong> The game needs WebGL, which is turned off or not supported here.</p>
      <ul class="fallback-tips">
        <li>Open the game in an up-to-date Chrome, Safari, Firefox or Edge.</li>
        <li>Turn on hardware acceleration (graphics acceleration) in your browser settings.</li>
        <li>Update your phone or computer, then reload this page.</li>
      </ul>
    </div>`;
  root.append(screen);
  return screen;
}

// A short notice over the game while the graphics are lost; the round is paused underneath it.
export class GraphicsNotice {
  private readonly element: HTMLElement;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'graphics-notice';
    this.element.setAttribute('role', 'status');
    this.element.hidden = true;
    root.append(this.element);
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  show(message: string): void {
    this.element.textContent = message;
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
