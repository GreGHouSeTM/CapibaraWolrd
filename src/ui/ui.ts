// Interface utilisateur (HTML) : chargement, titre, HUD, dialogues, menus, boutique, album, réglages.
import './style.css';
import { HATS, HatId } from '../actors/capybara';
import type { SaveData } from '../core/save';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const HAT_EMOJI: Record<HatId, string> = {
  none: '🙂', yuzu: '🍊', flower: '🌸', beret: '🎨', cap: '🧢', tophat: '🎩', kasa: '👒', safari: '🤠', bonnet: '🎅', chef: '👨‍🍳', crown: '👑',
};

export const TIPS = [
  'Les capybaras sont d’excellents nageurs : n’aie pas peur de l’eau !',
  'Appuie sur E pour monter dans un véhicule ou parler aux habitants.',
  'Appuie sur F pour prendre une photo des monuments et remplir ton album.',
  'Le point d’exclamation jaune indique quelqu’un qui a besoin d’aide.',
  'Touche M : la carte du monde. Tu peux t’y téléporter dans les régions déjà visitées.',
  'La nuit, Paris scintille et le ciel du Pôle Nord s’illumine d’aurores boréales…',
];

export function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* plein écran refusé par le navigateur */
  }
}

export class UI {
  root = $('#app');
  dialogOpen = false;
  panelOpen: string | null = null;
  private dialogQueue: { name: string; lines: string[]; done?: () => void } | null = null;
  private dialogLine = 0;
  private toastTimer = 0;
  private typing = 0;
  private typed = '';

  constructor() {
    this.root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="loading"><div class="logo">Capy World</div><div class="sub">Un grand voyage autour du monde</div>
        <div class="bar"><div id="loadbar"></div></div><div class="tip" id="loadtip"></div></div>
      <div id="title" class="hidden"><div class="logo">Capy World</div><div class="tag">Paris · New York · Londres · Japon · Désert · Pôle Nord</div>
        <div class="menu" id="titlemenu"></div></div>
      <div id="hud" class="hidden">
        <div class="chip" id="region"><span id="regionname">Capyville</span><span class="clock" id="clock">9:30</span></div>
        <div class="chip" id="coins"><div class="coin"></div><span id="coincount">0</span></div>
        <div class="chip hidden" id="objective"><div class="title" id="objtitle"></div><div id="objtext"></div><div class="progress" id="objprog"></div></div>
        <div class="chip hidden" id="prompt"></div>
        <div class="chip hidden" id="speed"><span id="speedval">0</span><small>km/h</small></div>
        <div class="chip hidden" id="timer"></div>
        <div id="minimap"><canvas id="minimapc" width="256" height="256"></canvas></div>
        <div id="toast"></div>
        <div id="notice"></div>
      </div>
      <div id="dialog" class="hidden"><div class="name" id="dname"></div><div class="text" id="dtext"></div><div class="next">E / Entrée / clic pour continuer ▶</div></div>
      <div id="flash"></div>
      <div id="photoframe" class="hidden"></div>
      <div id="overlay" class="overlay hidden"><div class="panel" id="panel"></div></div>
    `,
    );
    $('#loadtip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    $('#dialog').addEventListener('click', () => this.advanceDialog());
  }

  setLoading(p: number, label?: string) {
    $('#loadbar').style.width = `${Math.round(p * 100)}%`;
    if (label) $('#loadtip').textContent = label;
  }

  hideLoading() {
    $('#loading').classList.add('hidden');
  }

  showTitle(hasSave: boolean, onPlay: (fresh: boolean) => void, onSettings: () => void, onHelp: () => void) {
    const t = $('#title');
    t.classList.remove('hidden');
    const m = $('#titlemenu');
    m.innerHTML = '';
    const add = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.onclick = fn;
      m.appendChild(b);
      return b;
    };
    if (hasSave) {
      add('Continuer l’aventure', 'primary', () => onPlay(false)).focus();
      add('Nouvelle partie', '', () => { if (confirm('Effacer la sauvegarde et recommencer ?')) onPlay(true); });
    } else add('Jouer', 'primary', () => onPlay(false)).focus();
    add('Réglages', '', onSettings);
    add('Commandes', '', onHelp);
    // Démo « next gen » : zone forêt autonome en qualité Max (src/demo/foret), N pour passer du jour à la nuit
    if (new URLSearchParams(location.search).get('demo') === 'foret') add('Retour au monde de Capy World', 'small', () => { location.search = ''; });
    else add('Démo forêt (qualité Max)', 'small', () => { location.search = '?demo=foret&q=max'; });
    add('Plein écran', 'small', () => toggleFullscreen());
  }

  hideTitle() {
    $('#title').classList.add('hidden');
    $('#hud').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- HUD
  setRegion(name: string, hour: number) {
    $('#regionname').textContent = name;
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    const icon = hour > 6.5 && hour < 19 ? '☀️' : '🌙';
    $('#clock').textContent = `${icon} ${h}:${m.toString().padStart(2, '0')}`;
  }
  setCoins(n: number) {
    $('#coincount').textContent = String(n);
  }
  setObjective(title: string | null, text = '', progress = '') {
    const o = $('#objective');
    if (!title) return o.classList.add('hidden');
    o.classList.remove('hidden');
    $('#objtitle').textContent = title;
    $('#objtext').textContent = text;
    $('#objprog').textContent = progress;
  }
  setPrompt(html: string | null) {
    const p = $('#prompt');
    if (!html || this.dialogOpen) return p.classList.add('hidden');
    p.classList.remove('hidden');
    if (p.innerHTML !== html) p.innerHTML = html;
  }
  setSpeed(kmh: number | null) {
    const s = $('#speed');
    if (kmh === null) return s.classList.add('hidden');
    s.classList.remove('hidden');
    $('#speedval').textContent = String(Math.round(kmh));
  }
  setTimer(sec: number | null) {
    const t = $('#timer');
    if (sec === null) return t.classList.add('hidden');
    t.classList.remove('hidden');
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    t.textContent = `⏱ ${m}:${s.toString().padStart(2, '0')}`;
  }
  toast(main: string, sub = '', ms = 3000) {
    const t = $('#toast');
    t.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ''}`;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }
  note(text: string, ms = 2600) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = text;
    $('#notice').appendChild(n);
    setTimeout(() => n.remove(), ms);
    while ($('#notice').children.length > 3) $('#notice').firstElementChild?.remove();
  }
  flash() {
    const f = $('#flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }
  minimapCanvas() {
    return $<HTMLCanvasElement>('#minimapc');
  }

  // ---------------------------------------------------------------- dialogues
  dialog(name: string, lines: string[], done?: () => void) {
    this.dialogQueue = { name, lines, done };
    this.dialogLine = 0;
    this.dialogOpen = true;
    $('#dialog').classList.remove('hidden');
    $('#dname').textContent = name;
    this.showLine();
  }
  private showLine() {
    this.typed = this.dialogQueue!.lines[this.dialogLine];
    this.typing = 0;
    $('#dtext').textContent = '';
  }
  /** effet machine à écrire */
  tickDialog(dt: number) {
    if (!this.dialogOpen) return;
    if (this.typing < this.typed.length) {
      this.typing = Math.min(this.typed.length, this.typing + dt * 55);
      $('#dtext').textContent = this.typed.slice(0, Math.floor(this.typing));
    }
  }
  advanceDialog() {
    if (!this.dialogQueue) return;
    if (this.typing < this.typed.length) {
      this.typing = this.typed.length;
      $('#dtext').textContent = this.typed;
      return;
    }
    this.dialogLine++;
    if (this.dialogLine >= this.dialogQueue.lines.length) {
      const d = this.dialogQueue.done;
      this.dialogQueue = null;
      this.dialogOpen = false;
      $('#dialog').classList.add('hidden');
      d?.();
    } else this.showLine();
  }

  // ---------------------------------------------------------------- panneaux
  private open(id: string, html: string) {
    this.panelOpen = id;
    $('#overlay').classList.remove('hidden');
    $('#panel').innerHTML = html;
    return $('#panel');
  }
  close() {
    this.panelOpen = null;
    $('#overlay').classList.add('hidden');
    $('#panel').innerHTML = '';
  }

  pause(actions: { resume: () => void; map: () => void; album: () => void; settings: () => void; help: () => void; title: () => void }) {
    const p = this.open('pause', `<h2>Pause</h2><div class="menu">
      <button class="btn primary" data-a="resume">Reprendre</button>
      <button class="btn" data-a="map">Carte du monde</button>
      <button class="btn" data-a="album">Album photo</button>
      <button class="btn" data-a="settings">Réglages</button>
      <button class="btn" data-a="help">Commandes</button>
      <button class="btn" data-a="fullscreen">Plein écran</button>
      <button class="btn small" data-a="title">Écran titre</button></div>`);
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => (b.dataset.a === 'fullscreen' ? toggleFullscreen() : (actions as any)[b.dataset.a!]())));
    p.querySelector<HTMLButtonElement>('button')?.focus();
  }

  help(back: () => void) {
    const p = this.open('help', `<h2>Commandes</h2><div class="keys">
      <span><kbd>Z Q S D</kbd> / <kbd>↑←↓→</kbd></span><span>Se déplacer / conduire</span>
      <span><kbd>Souris</kbd></span><span>Tourner la caméra (clique dans le jeu)</span>
      <span><kbd>Maj</kbd></span><span>Courir</span>
      <span><kbd>Espace</kbd></span><span>Sauter / frein à main</span>
      <span><kbd>E</kbd></span><span>Parler, monter ou descendre d’un véhicule</span>
      <span><kbd>F</kbd></span><span>Prendre une photo</span>
      <span><kbd>V</kbd></span><span>Appeler un cabriolet</span>
      <span><kbd>H</kbd></span><span>Klaxon</span>
      <span><kbd>M</kbd></span><span>Carte du monde</span>
      <span><kbd>R</kbd></span><span>Revenir sur la terre ferme</span>
      <span><kbd>O</kbd></span><span>Plein écran</span>
      <span><kbd>Échap</kbd></span><span>Pause</span>
      <span><kbd>🎮</kbd></span><span>Manette : stick gauche, A sauter, Y/B interagir, X photo, gâchettes pour conduire</span>
      </div><div style="margin-top:16px;text-align:right"><button class="btn" id="back">Retour</button></div>`);
    p.querySelector<HTMLButtonElement>('#back')!.onclick = back;
  }

  settings(save: SaveData, apply: (s: SaveData['settings']) => void, back: () => void) {
    const s = { ...save.settings };
    const p = this.open('settings', `<h2>Réglages</h2>
      <div class="row"><span>Qualité graphique</span><span>
        <button class="btn small" data-q="low">Basse</button> <button class="btn small" data-q="medium">Moyenne</button> <button class="btn small" data-q="high">Haute</button> <button class="btn small" data-q="max">Max</button></span></div>
      <div class="row"><span>Musique</span><input type="range" min="0" max="1" step="0.05" id="mus" value="${s.music}"></div>
      <div class="row"><span>Effets sonores</span><input type="range" min="0" max="1" step="0.05" id="sfx" value="${s.sfx}"></div>
      <div class="row"><span>Sensibilité de la souris</span><input type="range" min="0.3" max="2.5" step="0.05" id="sens" value="${s.sensitivity}"></div>
      <div class="row"><span>Inverser l’axe vertical</span><input type="checkbox" id="inv" ${s.invertY ? 'checked' : ''}></div>
      <div class="muted" style="font-size:15px">La qualité « Haute » est plus belle mais demande un ordinateur puissant ; « Max » pousse tous les effets (carte graphique récente). Le changement de qualité recharge la page.</div>
      <div style="margin-top:16px;text-align:right"><button class="btn" id="back">Retour</button></div>`);
    const mark = () => p.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => (b.style.background = b.dataset.q === s.quality ? 'var(--gold)' : ''));
    mark();
    p.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => (b.onclick = () => { s.quality = b.dataset.q as any; mark(); apply(s); }));
    const bind = (id: string, key: 'music' | 'sfx' | 'sensitivity') => {
      const el = p.querySelector<HTMLInputElement>('#' + id)!;
      el.oninput = () => { s[key] = parseFloat(el.value); apply(s); };
    };
    bind('mus', 'music'); bind('sfx', 'sfx'); bind('sens', 'sensitivity');
    p.querySelector<HTMLInputElement>('#inv')!.onchange = (e) => { s.invertY = (e.target as HTMLInputElement).checked; apply(s); };
    p.querySelector<HTMLButtonElement>('#back')!.onclick = back;
  }

  shop(save: SaveData, buy: (id: HatId) => void, equip: (id: HatId) => void, back: () => void) {
    const render = () => {
      const p = this.open('shop', `<h2>🎩 Chez Basile le chapelier</h2><p class="muted">Tu as <b>${save.coins}</b> pièces. Clique sur un chapeau pour l’acheter ou le porter.</p>
        <div class="grid">${HATS.map((h) => {
          const owned = save.hats.includes(h.id);
          const eq = save.hat === h.id;
          const cls = eq ? 'equipped' : owned ? 'owned' : save.coins < h.price ? 'locked' : '';
          return `<div class="card ${cls}" data-h="${h.id}"><div class="emoji">${HAT_EMOJI[h.id]}</div><div class="nm">${h.name}</div><div class="pr">${eq ? 'Porté' : owned ? 'À toi' : (h.id === 'crown' ? 'Trésor caché ou ' : '') + h.price + ' pièces'}</div></div>`;
        }).join('')}</div><div style="margin-top:16px;text-align:right"><button class="btn" id="back">Fermer</button></div>`);
      p.querySelectorAll<HTMLElement>('.card').forEach((c) => (c.onclick = () => {
        const id = c.dataset.h as HatId;
        if (save.hats.includes(id)) equip(id);
        else buy(id);
        render();
      }));
      p.querySelector<HTMLButtonElement>('#back')!.onclick = back;
    };
    render();
  }

  album(items: { name: string; region: string; done: boolean }[], babies: number, babiesTotal: number, missions: number, missionsTotal: number, back: () => void) {
    const p = this.open('album', `<h2>📸 Album de voyage</h2>
      <p>Missions réussies : <b>${missions} / ${missionsTotal}</b> · Bébés capybaras retrouvés : <b>${babies} / ${babiesTotal}</b></p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${items.map((i) => `<div class="album-item ${i.done ? 'done' : ''}">${i.done ? '✅' : '⬜'} <div><b>${i.name}</b><div class="muted" style="font-size:14px">${i.region}</div></div></div>`).join('')}</div>
      <div style="margin-top:16px;text-align:right"><button class="btn" id="back">Retour</button></div>`);
    p.querySelector<HTMLButtonElement>('#back')!.onclick = back;
  }

  worldMap(img: HTMLCanvasElement, labels: { name: string; u: number; v: number; ok: boolean; go: () => void }[], player: { u: number; v: number; yaw: number }, markers: { u: number; v: number; color: string }[], back: () => void) {
    const p = this.open('map', `<h2>🗺️ Carte du monde</h2><div id="worldmap"></div><p class="muted">Clique sur une région déjà visitée pour t’y rendre.</p><div style="text-align:right"><button class="btn" id="back">Fermer</button></div>`);
    const wm = p.querySelector<HTMLElement>('#worldmap')!;
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 1024, 1024);
    for (const m of markers) {
      g.fillStyle = m.color;
      g.beginPath(); g.arc(m.u * 1024, m.v * 1024, 12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
    }
    g.save();
    g.translate(player.u * 1024, player.v * 1024);
    g.rotate(-player.yaw + Math.PI);
    g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(14, 16); g.lineTo(0, 8); g.lineTo(-14, 16); g.closePath(); g.fill(); g.stroke();
    g.restore();
    wm.appendChild(c);
    for (const l of labels) {
      const d = document.createElement('div');
      d.className = 'label' + (l.ok ? '' : ' locked');
      d.textContent = l.ok ? l.name : '❓ ' + l.name;
      d.style.left = `${l.u * 100}%`;
      d.style.top = `${l.v * 100}%`;
      if (l.ok) d.onclick = l.go;
      wm.appendChild(d);
    }
    p.querySelector<HTMLButtonElement>('#back')!.onclick = back;
  }

  setPhotoFrame(on: boolean) {
    $('#photoframe').classList.toggle('hidden', !on);
  }
}
