// start.ng profile card (start.ng's character rule): this game has no player character, so it shows
// the player's start.ng face, character name and @account, and offers guests a way to sign in.
// It sits just under the HUD and only shows between rounds, so it never covers play.

import type { WhoAmI } from '../startng';

const CARD_HEIGHT = 52;

export class ProfileCard {
  readonly element: HTMLElement;
  private readonly face: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly account: HTMLElement;
  private readonly signIn: HTMLButtonElement;
  private hasPlayer = false;
  private betweenRounds = true;

  constructor(
    private readonly root: HTMLElement,
    private readonly onSignIn: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'startng-card';
    this.element.hidden = true;
    this.element.innerHTML = `
      <img class="startng-face" alt="" width="40" height="40" />
      <div class="startng-who">
        <b data-name></b>
        <span data-account></span>
      </div>
      <button type="button" class="startng-sign-in" data-sign-in hidden>Sign in</button>`;
    this.face = this.element.querySelector('img')!;
    this.name = this.element.querySelector('[data-name]')!;
    this.account = this.element.querySelector('[data-account]')!;
    this.signIn = this.element.querySelector('[data-sign-in]')!;
    this.signIn.addEventListener('click', this.onSignInClick);
    root.append(this.element);
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  // A signed-in player, start.ng's guest look, or nothing (not on start.ng: no card at all).
  setPlayer(who: WhoAmI | null): void {
    const player = who?.user ?? who?.guest ?? null;
    this.hasPlayer = !!player;
    if (player) {
      const signedIn = !!who?.user;
      this.face.src = player.face;
      this.face.hidden = !player.face;
      this.face.alt = `${player.name}'s start.ng character`;
      this.name.textContent = player.name;
      this.account.textContent = signedIn && player.account ? `@${player.account}` : 'Playing as a guest';
      this.signIn.hidden = signedIn;
    }
    this.render();
  }

  // Shown on the start, pause and results screens; hidden while a round is being played.
  setBetweenRounds(between: boolean): void {
    this.betweenRounds = between;
    this.render();
  }

  // Keeps the card just under the HUD strip, whatever its height, and tells the screens where it
  // ends so their cards start below it (CARD_HEIGHT: 40 px face + 12 px padding).
  setTop(pixels: number): void {
    const top = Math.round(pixels) + 8;
    this.element.style.top = `${top}px`;
    this.root.style.setProperty('--startng-profile-bottom', `${top + CARD_HEIGHT + 16}px`);
  }

  dispose(): void {
    this.signIn.removeEventListener('click', this.onSignInClick);
    this.element.remove();
  }

  private render(): void {
    const visible = this.hasPlayer && this.betweenRounds;
    this.element.hidden = !visible;
    this.root.classList.toggle('has-startng-profile', visible);
  }

  private onSignInClick = (): void => {
    this.onSignIn();
  };
}
