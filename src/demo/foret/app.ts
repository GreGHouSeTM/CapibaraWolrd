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
import { Forest, placeTrees } from './trees';
import { PropLib } from './props';
import { ForetPost, buildCanopy, canopyUniforms, installShaderChunks } from './light';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { PROP_IDS, STYLES, Scatter } from './scatter';
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
  forest!: Forest;
  wallObj!: THREE.Object3D;
  mirror: THREE.Object3D | null = null;
  post!: ForetPost;
  lamp = new THREE.PointLight(0xffa860, 0, 26, 2);
  flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(9, 4.5, 1.6) }));
  props!: PropLib;
  scatter!: Scatter;
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
    this.renderer.toneMapping = THREE.NoToneMapping; // AgX dans le post-traitement
    installShaderChunks(this.preset);
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
    this.post?.setSize(w, h);
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
    this.wallObj = await buildWall();
    this.scene.add(this.wallObj);
    this.ui.setLoading(0.2, 'Modelage du sol…');
    this.ground = new Ground(D, this.preset);
    await this.ground.build(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene.add(this.ground.group);
    this.buildCollisions();
    const f = D.scene.steps;
    this.scene.add(await buildStairs({ x1: f[0].x, x2: f[f.length - 1].x, zSplit: (f[13].z + f[14].z) / 2 }));
    this.ui.setLoading(0.6, 'Pousse des épicéas…');
    this.forest = new Forest();
    const trees = placeTrees(D, this.preset.density);
    buildCanopy(trees);
    canopyUniforms();
    await this.forest.build(D, trees, this.preset.treeLod0, true);
    this.scene.add(this.forest.group);
    this.ui.setLoading(0.75, 'Sous-bois, racines et bois mort…');
    this.props = new PropLib();
    await this.props.load(PROP_IDS, STYLES);
    this.scatter = new Scatter().build(this.props, D, trees, this.preset.density);
    this.scene.add(this.scatter.group);
    this.setupLights();
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.camera.near = 0.1;
    this.rig.camera.far = 2500;
    this.rig.camera.updateProjectionMatrix();
    this.post = new ForetPost(this.renderer, this.scene, this.rig.camera, this.preset);
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
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 320;
    c.updateProjectionMatrix();
    s.shadow.bias = -0.00025;
    s.shadow.normalBias = 0.04;
    this.scene.add(s, s.target, this.hemi);
    // lanterne : flamme chaude, ombres portées (cube), halo dans la brume (passe volumétrique)
    const L = this.scatter.lantern;
    this.lamp.position.set(L.x, L.y + 0.2, L.z);
    this.lamp.castShadow = false; // activé la nuit seulement (6 rendus de la scène par image)
    this.lamp.shadow.camera.layers.set(2);
    for (const g of [this.scatter.group, this.ground.group, this.wallObj]) g.traverse((o) => o.layers.enable(2));
    this.lamp.shadow.mapSize.set(this.preset.lanternShadow || 256, this.preset.lanternShadow || 256);
    this.lamp.shadow.camera.near = 0.08;
    this.lamp.shadow.camera.far = 22;
    this.lamp.shadow.bias = -0.002;
    this.lamp.decay = 2;
    this.lamp.distance = 32;
    this.flame.position.copy(this.lamp.position);
    this.scene.add(this.lamp, this.flame);
    // flaque : reflet plan (arbres, paroi, lanterne, ciel : calque 1) à résolution réduite
    if (this.preset.reflection > 0) {
      const P = this.data.scene.puddle;
      const geo = new THREE.CircleGeometry(1, 48);
      const r = new Reflector(geo, { textureWidth: Math.round(innerWidth * this.preset.reflection), textureHeight: Math.round(innerHeight * this.preset.reflection), color: 0x6a6a64, clipBias: 0.003 });
      r.rotation.x = -Math.PI / 2;
      r.scale.set(P.rx * 1.05, P.rz * 1.05, 1);
      r.rotation.z = -P.rot;
      r.position.set(P.x, this.data.height(P.x, P.z) + P.depth * 0.55, P.z);
      (r as any).camera.layers.set(1);
      this.scene.add(r);
      this.mirror = r;
      for (const g of [this.forest.group, this.wallObj]) g.traverse((o) => o.layers.enable(1));
      this.flame.layers.enable(1);
    }
  }

  get night() {
    return this.sky.hour < 6 || this.sky.hour > 20;
  }

  private applyTime() {
    const n = this.night;
    // soleil voilé haut, à contre-jour léger vers le nord-est : lumière douce et diffuse, quelques taches au sol
    const dir = n ? new THREE.Vector3(0.3, 0.8, 0.5).normalize() : new THREE.Vector3(0.3, 0.62, -0.72).normalize();
    this.sun.position.copy(dir).multiplyScalar(180);
    this.sun.target.position.set(0, 4, -5);
    this.sun.position.add(this.sun.target.position);
    this.sun.color.set(n ? 0x8095c8 : 0xffeedd);
    this.sun.intensity = n ? 0.12 : 2.6;
    this.hemi.color.set(n ? 0x141a2a : 0xb8c6d4);
    this.hemi.groundColor.set(n ? 0x050608 : 0x2a2619);
    this.hemi.intensity = n ? 0.02 : 0.1;
    this.scene.environmentIntensity = n ? 0.07 : 1.0;
    this.scene.background = n ? new THREE.Color().setRGB(0.004, 0.006, 0.01) : new THREE.Color().setRGB(1.5, 1.62, 1.72);
    this.lamp.intensity = n ? 16 : 0;
    this.lamp.castShadow = n && this.preset.lanternShadow > 0;
    this.flame.visible = n;
    if (this.mirror) this.mirror.visible = n;
    const f = this.post.fog.fogMat.uniforms;
    f.uDens.value = n ? 0.03 : 0.011;
    f.uHeight.value = n ? 5 : 9;
    f.uBase.value = 5;
    f.uExpo.value = n ? 4.5 : 1.0; // exposition (œil adapté à la nuit)
    f.uSunDir.value.copy(dir);
    f.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.55);
    f.uAmb.value.setRGB(...(n ? [0.012, 0.016, 0.026] : [0.62, 0.68, 0.74]) as [number, number, number]);
    this.post.fog.resetHistory();
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
    this.forest?.update(this.rig.camera.position, this.time);
    if (this.props) this.props.wind.value = this.time;
    this.scatter?.update(this.rig.camera.position);
    if (this.sky.hour !== this.lastHour) { this.lastHour = this.sky.hour; this.applyTime(); }
    if (this.state === 'play') {
      this.ui.setRegion('Forêt d’épicéas', this.sky.hour);
      if (this.fpsEl) this.fpsEl.textContent = `${Math.round(this.fps)} FPS · qualité ${this.quality}`;
    }
  }

  private render(dt: number) {
    const f = this.post.fog.fogMat.uniforms;
    f.tShadow.value = this.sun.shadow.map?.texture ?? null;
    f.uShadowMat.value.copy(this.sun.shadow.matrix);
    f.uTime.value = this.time;
    // flamme : scintillement léger
    const fl = 1 + 0.06 * Math.sin(this.time * 13.1) + 0.04 * Math.sin(this.time * 23.7 + 1.3);
    if (this.night) this.lamp.intensity = 16 * fl;
    f.uLampPos.value.copy(this.lamp.position);
    f.uLampCol.value.setRGB(1.0, 0.55, 0.22).multiplyScalar(this.night ? 6 * fl : 0);
    this.post.render(dt);
  }
}

export async function startForet() {
  const demo = new ForetDemo();
  await demo.init();
  return demo;
}
