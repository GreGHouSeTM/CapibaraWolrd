// Cœurs de vie dans le HUD (demi-cœurs) et écran « Ouf ! » quand ils tombent à zéro. Spécialité Combat.
import './combat.css';

const HEART = 'M16 28.5C14.6 27.4 2 19.6 2 10.6 2 6 5.4 2.5 9.6 2.5c2.7 0 4.9 1.4 6.4 3.6 1.5-2.2 3.7-3.6 6.4-3.6C26.6 2.5 30 6 30 10.6c0 9-12.6 16.8-14 17.9z';

export class HeartsUI {
  readonly el: HTMLDivElement;
  private hearts: SVGSVGElement[] = [];
  private shown = -1;
  private shownMax = -1;
  private ouf: HTMLDivElement;

  constructor(parent: HTMLElement | null = document.getElementById('hud')) {
    this.el = document.createElement('div');
    this.el.id = 'hearts';
    this.el.setAttribute('aria-label', 'Cœurs');
    (parent ?? document.body).appendChild(this.el);
    this.ouf = document.createElement('div');
    this.ouf.id = 'ouf';
    this.ouf.className = 'hidden';
    this.ouf.innerHTML = `<div class="ouf-box"><div class="ouf-title">Ouf !</div>
      <div class="ouf-sub">Petit capybara a besoin d’un bon bain chaud…</div><div class="ouf-steam">♨</div></div>`;
    (document.getElementById('app') ?? document.body).appendChild(this.ouf);
  }

  /** Affiche `halves` demi-cœurs sur `max` (max pair : 10 = 5 cœurs). */
  set(halves: number, max: number) {
    if (halves === this.shown && max === this.shownMax) return;
    if (max !== this.shownMax) {
      this.el.innerHTML = '';
      this.hearts = [];
      for (let i = 0; i < max / 2; i++) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 32 30');
        s.classList.add('heart');
        s.innerHTML = `<path class="bg" d="${HEART}"/><path class="fg" d="${HEART}"/><path class="shine" d="M8 7.5c-1.8.6-3 2.3-3 4.2"/>`;
        this.el.appendChild(s);
        this.hearts.push(s);
      }
      this.shownMax = max;
    }
    const gained = this.shown >= 0 && halves > this.shown;
    this.hearts.forEach((h, i) => {
      const v = Math.max(0, Math.min(2, halves - i * 2));
      h.classList.toggle('full', v === 2);
      h.classList.toggle('half', v === 1);
      h.classList.toggle('empty', v === 0);
    });
    this.el.classList.toggle('low', halves <= 2 && halves > 0);
    if (gained) this.pulse('heal');
    this.shown = halves;
  }

  /** Petite secousse des cœurs quand le capybara est touché. */
  hurt() {
    this.pulse('hurt');
  }

  private pulse(cls: 'hurt' | 'heal') {
    this.el.classList.remove('hurt', 'heal');
    void this.el.offsetWidth; // relance l'animation CSS
    this.el.classList.add(cls);
  }

  showOuf() {
    this.ouf.classList.remove('hidden', 'out');
    void this.ouf.offsetWidth;
    this.ouf.classList.add('on');
  }

  hideOuf() {
    this.ouf.classList.remove('on');
    this.ouf.classList.add('out');
    window.setTimeout(() => this.ouf.classList.contains('out') && this.ouf.classList.add('hidden'), 700);
  }

  get oufVisible() {
    return this.ouf.classList.contains('on');
  }
}
