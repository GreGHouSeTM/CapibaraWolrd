// Entrées clavier (AZERTY et QWERTY via les codes physiques), souris et manette.
export type Action = 'jump' | 'run' | 'interact' | 'photo' | 'map' | 'pause' | 'horn' | 'vehicle' | 'respawn' | 'brake' | 'help';

const KEYMAP: Record<string, Action> = {
  Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyE: 'interact', Enter: 'interact', KeyF: 'photo', KeyP: 'photo',
  KeyM: 'map', Tab: 'map', Escape: 'pause', KeyH: 'horn', KeyV: 'vehicle', KeyR: 'respawn', KeyX: 'brake', F1: 'help',
};

export class Input {
  keys = new Set<string>();
  pressed = new Set<Action>();
  private held = new Set<Action>();
  look = { x: 0, y: 0 };
  wheel = 0;
  pointerLocked = false;
  gamepad: Gamepad | null = null;
  private padPrev: boolean[] = [];
  enabled = true;
  usingPad = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        const a = KEYMAP[e.code];
        if (a) this.pressed.add(a);
      }
      this.keys.add(e.code);
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    el.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => (this.pointerLocked = document.pointerLockElement === el));
  }

  requestLock() {
    if (!this.pointerLocked) this.el.requestPointerLock?.();
  }

  private k(...codes: string[]) {
    return codes.some((c) => this.keys.has(c)) ? 1 : 0;
  }

  /** Déplacement : x (droite), y (avant). */
  move() {
    let x = this.k('KeyD', 'ArrowRight') - this.k('KeyA', 'ArrowLeft');
    let y = this.k('KeyW', 'ArrowUp') - this.k('KeyS', 'ArrowDown');
    const p = this.gamepad;
    if (p) {
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) { x = ax; y = -ay; this.usingPad = true; }
      // gâchettes pour la conduite
      const rt = p.buttons[7]?.value ?? 0, lt = p.buttons[6]?.value ?? 0;
      if (rt > 0.1 || lt > 0.1) { y = rt - lt; this.usingPad = true; }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  held_(a: Action) {
    if (a === 'run' && (this.k('ShiftLeft', 'ShiftRight') || this.gamepad?.buttons[10]?.pressed || this.gamepad?.buttons[1]?.pressed)) return true;
    if (a === 'brake' && (this.k('KeyX', 'Space') || this.gamepad?.buttons[2]?.pressed)) return true;
    if (a === 'jump' && (this.k('Space') || this.gamepad?.buttons[0]?.pressed)) return true;
    return this.held.has(a);
  }

  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    this.gamepad = null;
    for (const p of pads) if (p && p.connected) { this.gamepad = p; break; }
    const p = this.gamepad;
    if (p) {
      const map: [number, Action][] = [[0, 'jump'], [3, 'interact'], [2, 'photo'], [8, 'map'], [9, 'pause'], [4, 'vehicle'], [5, 'horn'], [1, 'interact']];
      for (const [i, a] of map) {
        const on = !!p.buttons[i]?.pressed;
        if (on && !this.padPrev[i]) { this.pressed.add(a); this.usingPad = true; }
        this.padPrev[i] = on;
      }
      const rx = p.axes[2] ?? 0, ry = p.axes[3] ?? 0;
      if (Math.abs(rx) > 0.15) this.look.x += rx * 14;
      if (Math.abs(ry) > 0.15) this.look.y += ry * 9;
    }
  }

  consume(a: Action) {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
    this.look.x = 0;
    this.look.y = 0;
    this.wheel = 0;
  }
}
