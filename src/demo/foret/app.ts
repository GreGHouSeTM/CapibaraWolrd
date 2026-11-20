// Preuve « next-gen » : zone de démonstration jouable « forêt d'épicéas » (?demo=foret, &q=max).
// Application autonome (sa propre boucle) qui réutilise le capybara, la caméra, les entrées, l'interface et la
// physique du jeu ; le monde principal n'est pas construit. Compatible avec tools/shot.cjs et tools/perf.cjs
// (window.__game expose startPlay, step, teleport, rig, player, sky.hour…).
import * as THREE from 'three';
import { Input } from '../../core/input';
import { UI, toggleFullscreen } from '../../ui/ui';
import { loadSave, writeSave, SaveData } from '../../core/save';
import { Quality, QUALITIES } from '../../core/quality';
import { setGroundOverride } from '../../world/heightmap';
import { addBox, groundAt } from '../../world/physics';
import { Player } from '../../gameplay/player';
import { CameraRig } from '../../gameplay/camera';
import { lerp } from '../../core/math';
import { ForetData } from './data';
import { FORET_PRESETS, ForetPreset } from './presets';
import { Ground } from './ground';
import { buildWall } from './wall';
import { buildStairs } from './stairs';
import { setAniso } from './tex';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { BASE } from './data';

export class ForetDemo {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  ui = new UI();
  input: Input;
  save: SaveData;
  quality: Quality;
  preset: ForetPreset;
  data = new ForetData();
  rig!: CameraRig;
  player!: Player;
  ground!: Ground;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  envMap: THREE.Texture | null = null;
  hemi = new THREE.HemisphereLight(0xc8d4e0, 0x3a3424, 0.8);
  state: 'loading' | 'title' | 'play' | 'paused' = 'loading';
  time = 0;
  /** Heure (10 = jour diffus, 22 = nuit) ; outils de capture : sky.hour = … */
  sky = { hour: 10, forceEnvUpdate: () => {} };
  /** compatibilité avec tools/shot.cjs (statistiques de la flore du monde principal) */
  world = { flora: null };
  manual = new URLSearchParams(location.search).has('manual');
  private clock = new THREE.Clock();
  private fps = 60;
  private fpsEl: HTMLElement | null = null;
  private keyN = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game';
    document.getElementById('app')!.prepend(this.canvas);
    this.save = loadSave();
    const qp = new URLSearchParams(location.search).get('q') as Quality | null;
    this.quality = qp && QUALITIES.includes(qp) ? qp : this.save.settings.quality;
    this.preset = FORET_PRESETS[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.preset.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !this.manual) this.pause();
    });
    this.canvas.addEventListener('click', () => { if (this.state === 'play') this.input.requestLock(); });
    (window as any).__game = this;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.rig) {
      this.rig.camera.aspect = w / h;
      this.rig.camera.updateProjectionMatrix();
    }
  }

  async init() {
    document.querySelector('#title .tag')!.textContent = 'Preuve next-gen · forêt d’épicéas';
    this.ui.setLoading(0.03, 'Chargement du relief de la forêt…');
    await this.data.load((p) => this.ui.setLoading(0.03 + p * 0.1));
    const D = this.data;
    setGroundOverride(D.height);
    setAniso(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    // lumière du ciel (IBL) : HDRI Poly Haven « misty_pines » (pinède brumeuse, ciel couvert)
    const hdr = await new RGBELoader().loadAsync(BASE() + 'hdri/misty_pines_2k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
    this.scene.environment = this.envMap;
    this.ui.setLoading(0.15, 'Sculpture de la paroi de granite…');
    this.scene.add(await buildWall());
    this.ui.setLoading(0.2, 'Modelage du sol…');
    this.ground = new Ground(D, this.preset);
    await this.ground.build(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene.add(this.ground.group);
    this.buildCollisions();
    const f = D.scene.steps;
    this.scene.add(await buildStairs({ x1: f[0].x, x2: f[f.length - 1].x, zSplit: (f[13].z + f[14].z) / 2 }));
    this.setupLights();
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.camera.near = 0.1;
    this.rig.camera.far = 2500;
    this.rig.camera.updateProjectionMatrix();
    this.rig.sensitivity = this.save.settings.sensitivity;
    this.rig.invertY = this.save.settings.invertY;
    this.player = new Player(this.save.hat);
    this.scene.add(this.player.object);
    const sp = D.scene.spawn;
    this.player.setPosition(new THREE.Vector3(sp.x, groundAt(sp.x, sp.z, 99), sp.z));
    this.player.yaw = sp.yaw;
    this.rig.yaw = sp.yaw;
    this.ui.setLoading(0.95, 'Préparation des shaders…');
    await new Promise((r) => setTimeout(r, 0));
    this.applyTime();
    this.rig.update(0.016, this.player, this.input);
    try { this.renderer.compile(this.scene, this.rig.camera); } catch { /* compilation paresseuse */ }
    this.ui.setLoading(1, 'C’est parti !');
    this.ui.hideLoading();
    this.setupHud();
    this.showTitle();
    this.loop();
  }

  // ------------------------------------------------------------------------------------------ collisions
  private buildCollisions() {
    const S = this.data.scene;
    // marches : dessus marchable
    for (const s of S.steps) {
      const cz = s.z - Math.cos(s.yaw) * s.run / 2, cx = s.x - Math.sin(s.yaw) * s.run / 2;
      addBox(cx, cz, s.width, s.run + 0.02, s.y - 0.45, s.y, s.yaw, true, 'step');
    }
    // pied de la paroi : chaîne de boîtes (la pente raide du relief ne doit pas se gravir)
    const f = S.wallFoot;
    for (let i = 0; i + 1 < f.length; i++) {
      const [x0, z0, y0, h0] = f[i], [x1, z1, , h1] = f[i + 1];
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len; // vers l'est
      const sgn = nx > 0 ? 1 : -1;
      addBox((x0 + x1) / 2 + nx * sgn * 0.6, (z0 + z1) / 2 + nz * sgn * 0.6, 1.2, len + 0.05, y0 - 2, y0 + Math.max(h0, h1) + 4, Math.atan2(dx, dz), false, 'paroi');
    }
    // limites de la zone (derrière les arbres et les blocs ; « thin » : la caméra les ignore)
    const t = S.terrain, W = (t.nx - 1) * t.cell, Dz = (t.nz - 1) * t.cell, m = 2.5;
    const cx = t.x0 + W / 2, cz = t.z0 + Dz / 2;
    addBox(cx, t.z0 + m, W, 1, -50, 200, 0, false, 'thin');
    addBox(cx, t.z0 + Dz - m, W, 1, -50, 200, 0, false, 'thin');
    addBox(t.x0 + m, cz, 1, Dz, -50, 200, 0, false, 'thin');
    addBox(t.x0 + W - m, cz, 1, Dz, -50, 200, 0, false, 'thin');
  }

  /** J1 : marches provisoires (remplacées par le modèle Blender au jalon 2). */
  private buildPlaceholders() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.9 });
    const g = new THREE.Group();
    g.name = 'escalier-provisoire';
    for (const s of this.data.scene.steps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.width, 0.45, s.run + 0.04), mat);
      m.position.set(s.x - Math.sin(s.yaw) * s.run / 2, s.y - 0.225, s.z - Math.cos(s.yaw) * s.run / 2);
      m.rotation.y = s.yaw;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    this.scene.add(g);
  }

  // ------------------------------------------------------------------------------------------ lumière
  private setupLights() {
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(this.preset.shadowSize, this.preset.shadowSize);
    const c = s.shadow.camera as THREE.OrthographicCamera;
    c.left = -75; c.right = 75; c.top = 75; c.bottom = -75; c.near = 1; c.far = 400;
    c.updateProjectionMatrix();
    s.shadow.bias = -0.0002;
    s.shadow.normalBias = 0.03;
    this.scene.add(s, s.target, this.hemi);
    this.scene.fog = new THREE.FogExp2(0xb8c2c8, 0.012);
  }

  get night() {
    return this.sky.hour < 6 || this.sky.hour > 20;
  }

  private applyTime() {
    const n = this.night;
    // soleil voilé haut dans le dos du joueur (sud-ouest), légèrement de côté : lumière douce et diffuse
    const dir = new THREE.Vector3(-0.35, 0.82, 0.45).normalize();
    this.sun.position.copy(dir).multiplyScalar(200);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.set(n ? 0x8fa6d8 : 0xfff1dc);
    this.sun.intensity = n ? 0.05 : 2.2;
    this.hemi.color.set(n ? 0x1a2236 : 0xc8d4e0);
    this.hemi.groundColor.set(n ? 0x06070a : 0x3a3424);
    this.hemi.intensity = n ? 0.05 : 0.15;
    this.scene.environmentIntensity = n ? 0.04 : 0.9;
    (this.scene.fog as THREE.FogExp2).color.set(n ? 0x05070b : 0xb8c2c8);
    this.scene.background = new THREE.Color(n ? 0x04060a : 0xc4ccd2);
  }

  // ------------------------------------------------------------------------------------------ écrans
  private setupHud() {
    for (const id of ['coins', 'minimap']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'chip';
    this.fpsEl.style.cssText = 'position:absolute;right:16px;top:16px;font-size:14px;opacity:.85';
    document.getElementById('hud')!.appendChild(this.fpsEl);
  }

  startPlay() {
    this.ui.hideTitle();
    this.state = 'play';
  }

  private showTitle() {
    this.state = 'title';
    this.ui.showTitle(false, () => {
      this.ui.hideTitle();
      this.state = 'play';
      this.input.requestLock();
      this.rig.yaw = this.player.yaw + 0.0001;
      this.ui.toast('La forêt d’épicéas', 'N : jour / nuit · Échap : réglages (qualité Max)', 6000);
    }, () => this.settings(() => this.ui.close()), () => this.ui.help(() => this.ui.close()));
  }

  private settings(back: () => void) {
    this.ui.settings({ ...this.save, settings: { ...this.save.settings, quality: this.quality } }, (s) => {
      const reload = s.quality !== this.quality;
      this.save.settings = s;
      this.rig.sensitivity = s.sensitivity;
      this.rig.invertY = s.invertY;
      writeSave(this.save);
      if (reload) {
        const u = new URL(location.href);
        u.searchParams.set('q', s.quality);
        setTimeout(() => (location.href = u.toString()), 150);
      }
    }, back);
  }

  private pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    document.exitPointerLock?.();
    const resume = () => { this.ui.close(); this.state = 'play'; this.input.requestLock(); };
    const menu = () => this.ui.pause({
      resume,
      map: () => this.ui.note('Pas de carte dans la zone de démonstration.'),
      album: () => this.ui.note('Pas d’album dans la zone de démonstration.'),
      settings: () => this.settings(menu),
      help: () => this.ui.help(menu),
      title: () => location.reload(),
    });
    menu();
  }

  teleport(p: THREE.Vector3, label: string) {
    const q = p.clone();
    q.y = groundAt(q.x, q.z, q.y + 1);
    this.player.setPosition(q);
    if (label) this.ui.note(label);
  }

  // ------------------------------------------------------------------------------------------ boucle
  step(frames = 1, dt = 1 / 30) {
    for (let i = 0; i < frames; i++) this.frame(dt, i === frames - 1);
  }

  private loop = () => {
    if (this.manual) return;
    requestAnimationFrame(this.loop);
    this.frame(Math.min(0.05, this.clock.getDelta()), true);
  };

  private frame(dt: number, render: boolean) {
    this.time += dt;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    this.input.poll();
    try {
      if (this.state === 'play') this.updatePlay(dt);
      else if (this.state === 'title') this.player.capy.animate(dt, 0, 'ground', this.time);
      else if (this.state === 'paused' && this.input.consume('pause') && this.ui.panelOpen) { this.ui.close(); this.state = 'play'; this.input.requestLock(); }
      if (this.state !== 'play') this.rig.update(dt, this.player, this.input);
      this.updateWorld(dt);
      if (render) this.render(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
  }

  private updatePlay(dt: number) {
    const inp = this.input;
    if (inp.consume('pause')) return this.pause();
    if (inp.consume('fullscreen')) toggleFullscreen();
    if (inp.consume('help')) { this.state = 'paused'; document.exitPointerLock?.(); this.ui.help(() => { this.ui.close(); this.state = 'play'; this.input.requestLock(); }); return; }
    const n = inp.keys.has('KeyN');
    if (n && !this.keyN) { this.sky.hour = this.night ? 10 : 22; this.ui.note(this.night ? 'Nuit : la lanterne s’allume' : 'Jour diffus'); }
    this.keyN = n;
    if (inp.consume('respawn')) this.player.setPosition(this.player.lastSafe.clone());
    this.player.update(dt, inp, this.rig.moveYaw, this.time);
    this.rig.update(dt, this.player, inp);
  }

  private lastHour = -1;
  private updateWorld(_dt: number) {
    if (this.sky.hour !== this.lastHour) { this.lastHour = this.sky.hour; this.applyTime(); }
    if (this.state === 'play') {
      this.ui.setRegion('Forêt d’épicéas', this.sky.hour);
      if (this.fpsEl) this.fpsEl.textContent = `${Math.round(this.fps)} FPS · qualité ${this.quality}`;
    }
  }

  private render(_dt: number) {
    this.renderer.render(this.scene, this.rig.camera);
  }
}

export async function startForet() {
  const demo = new ForetDemo();
  await demo.init();
  return demo;
}
