// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileCard } from './profile';

const FACE = 'data:image/png;base64,iVBORw0KGgo=';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const onSignIn = vi.fn();
  const card = new ProfileCard(root, onSignIn);
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  return { card, onSignIn, q };
}

describe('ProfileCard', () => {
  it('shows a signed-in player\'s face, character name and @account, with no sign-in button', () => {
    const { card, q } = mount();
    card.setPlayer({ user: { name: 'Runner Tee', account: 'Hamzat', face: FACE }, guest: null });
    expect(card.isVisible).toBe(true);
    expect(q<HTMLImageElement>('img').getAttribute('src')).toBe(FACE);
    expect(q('img').getAttribute('alt')).toBe("Runner Tee's start.ng character");
    expect(q('[data-name]').textContent).toBe('Runner Tee');
    expect(q('[data-account]').textContent).toBe('@Hamzat');
    expect(q<HTMLButtonElement>('[data-sign-in]').hidden).toBe(true);
  });

  it('shows guests start.ng\'s guest look and a sign-in button', () => {
    const { card, q, onSignIn } = mount();
    card.setPlayer({ user: null, guest: { name: 'Guest', face: FACE } });
    expect(q('[data-name]').textContent).toBe('Guest');
    expect(q('[data-account]').textContent).toBe('Playing as a guest');
    const button = q<HTMLButtonElement>('[data-sign-in]');
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe('Sign in');
    button.click();
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('stays hidden when start.ng is not there (local play)', () => {
    const { card } = mount();
    card.setPlayer(null);
    expect(card.isVisible).toBe(false);
  });

  it('only shows between rounds, never over play', () => {
    const { card } = mount();
    card.setPlayer({ user: { name: 'Tee', account: 't', face: FACE }, guest: null });
    card.setBetweenRounds(false);
    expect(card.isVisible).toBe(false);
    card.setBetweenRounds(true);
    expect(card.isVisible).toBe(true);
  });

  it('sits just under the HUD', () => {
    const { card } = mount();
    card.setTop(56);
    expect(card.element.style.top).toBe('64px');
  });
});

describe('ProfileCard and the screens', () => {
  it('tells the screens to start below it while it shows', () => {
    const { card } = mount();
    const root = card.element.parentElement!;
    card.setTop(56);
    expect(root.style.getPropertyValue('--startng-profile-bottom')).toBe('132px');
    card.setPlayer({ user: null, guest: { name: 'Guest', face: FACE } });
    expect(root.classList.contains('has-startng-profile')).toBe(true);
    card.setBetweenRounds(false);
    expect(root.classList.contains('has-startng-profile')).toBe(false);
  });
});
