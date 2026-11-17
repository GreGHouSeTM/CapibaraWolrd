// Le jeu : boucle principale, interactions, missions, photos, sauvegarde.
import * as THREE from 'three';
import { loadAssets, setMaxAnisotropy } from './core/assets';
import { Input } from './core/input';
import { AudioSystem } from './core/audio';
import { PostFX } from './core/postfx';
import { PRESETS, Quality } from './core/quality';
import { loadSave, writeSave, resetSave, SaveData, defaultSave } from './core/save';
import { clamp, damp, lerp, Rng } from './core/math';
import { SkySystem } from './world/sky';
import { buildWorld, World } from './world/world';
import { REGIONS, RegionDef, RegionId, nearestRegion, regionById } from './world/layout';
import { groundAt } from './world/physics';
import { heightAt, roadSamples } from './world/heightmap';
import { windUniform } from './world/vegetation';
import { setNight } from './procgen/kit';
import { Player } from './gameplay/player';
import { CameraRig } from './gameplay/camera';
import { Markers, CoinField } from './gameplay/markers';
import { MISSIONS, MissionRunner, GameAPI, Mission, setTalkResolver } from './gameplay/missions';
import { NpcManager } from './actors/npcs';
import { Capybara, HATS, HatId } from './actors/capybara';
import { Vehicle } from './vehicles/vehicle';
import { Traffic } from './vehicles/traffic';
import { UI, toggleFullscreen } from './ui/ui';
import { buildMapImage, Minimap, worldToMap } from './ui/map';
import type { VehicleType } from './regions/common';

const WATER: Record<RegionId, [number[], number[]]> = {
  hub: [[0.12, 0.66, 0.6], [0.02, 0.18, 0.28]],
  paris: [[0.28, 0.46, 0.42], [0.05, 0.15, 0.17]],
  newyork: [[0.24, 0.45, 0.48], [0.03, 0.12, 0.2]],
  london: [[0.3, 0.42, 0.38], [0.06, 0.13, 0.14]],
  japan: [[0.08, 0.78, 0.7], [0.01, 0.2, 0.32]],
  desert: [[0.08, 0.8, 0.75], [0.01, 0.22, 0.36]],
  pole: [[0.35, 0.62, 0.72], [0.02, 0.1, 0.22]],
};

const CHAT: Record<string, string[]> = {
  default: ['Quelle belle journée pour se promener !', 'Tu as goûté les yuzus de Capyville ? Un délice.', 'On dit qu’il y a des bébés capybaras cachés dans chaque région…', 'Psst ! Les pièces dorées brillent le long des routes.'],
  penguin: ['Couac ! 🐧', 'Couac couac ! (Il a l’air de bien t’aimer.)'],
};

const BABY_SPOTS: { region: RegionId; key: string; off: [number, number] }[] = [
  { region: 'paris', key: 'arc', off: [30, 28] },
  { region: 'newyork', key: 'times', off: [-12, 48] },
  { region: 'london', key: 'eye', off: [18, 26] },
  { region: 'japan', key: 'pagoda', off: [-16, 14] },
  { region: 'desert', key: 'oasis', off: [-34, 30] },
  { region: 'pole', key: 'workshop', off: [-14, -16] },
];

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  ui = new UI();
  input: Input;
  audio = new AudioSystem();
  save: SaveData;
  quality: Quality;
  sky!: SkySystem;
  world!: World;
  post!: PostFX;
  rig!: CameraRig;
  player!: Player;
  markers = new Markers();
  coins!: CoinField;
  npcs = new NpcManager();
  traffic = new Traffic();
  vehicles: Vehicle[] = [];
  runner = new MissionRunner();
  minimap!: Minimap;
  mapImg!: HTMLCanvasElement;
  clock = new THREE.Clock();
  time = 0;
  state: 'loading' | 'title' | 'play' | 'paused' = 'loading';
  region: RegionDef = REGIONS[0];
  private lastPhoto: { time: number; photoId: string | null; pos: THREE.Vector3 } | null = null;
  private calledCar: Vehicle | null = null;
  private saveTimer = 0;
  private babies: { mesh: Capybara; pos: THREE.Vector3; id: string }[] = [];
  private springBabies = new THREE.Group();
  private interactTarget: { label: string; run: () => void } | null = null;
  private api!: GameAPI;
  private updaters: ((t: number, dt: number) => void)[] = [];
  private gradeTarget = { saturation: 0.1, contrast: 0.05, warmth: 0 };
  private titleAngle = 0;
  private fps = 60;
  private lastCheckpointPing = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game';
    document.getElementById('app')!.prepend(this.canvas);
    this.save = loadSave();
    const qp = new URLSearchParams(location.search).get('q') as Quality | null;
    this.quality = qp && qp in PRESETS ? qp : this.save.settings.quality;
    const q = PRESETS[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.quality === 'high' ? dpr : Math.min(dpr, 1.25) * q.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this.resize());
    // la souris est libérée (Échap) : on met en pause
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !this.ui.dialogOpen && !this.manual) this.pause();
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.ui.dialogOpen) this.ui.advanceDialog();
    });
    this.canvas.addEventListener('click', () => {
      if (this.state === 'play') this.input.requestLock();
    });
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
    const q = PRESETS[this.quality];
    this.ui.setLoading(0.02, 'Chargement des textures…');
    await loadAssets((p) => this.ui.setLoading(0.02 + p * 0.18));
    this.sky = new SkySystem(this.renderer, this.scene);
    this.sky.setShadowQuality(q.shadowSize, q.shadowExtent);
    this.sky.hour = this.save.hour;
    this.scene.fog = new THREE.FogExp2(0xbcd0e0, 0.0012);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.rig.sensitivity = this.save.settings.sensitivity;
    this.rig.invertY = this.save.settings.invertY;
    this.world = await buildWorld(this.scene, q, { teleport: (p, l) => this.teleport(p, l) }, (p, l) => this.ui.setLoading(p, l));
    this.ui.setLoading(0.9, 'Réveil des capybaras…');
    await new Promise((r) => setTimeout(r, 0));
    this.setupActors();
    this.scene.add(this.markers.group);
    this.post = new PostFX(this.renderer, this.scene, this.rig.camera, q);
    this.mapImg = buildMapImage(2048);
    this.minimap = new Minimap(this.ui.minimapCanvas(), this.mapImg);
    this.ui.setLoading(0.96, 'Préparation des shaders…');
    await new Promise((r) => setTimeout(r, 0));
    this.sky.update(0.016, 0, new THREE.Vector3(), 0);
    this.rig.camera.position.set(0, 30, 60);
    this.rig.camera.lookAt(0, 6, 0);
    try {
      this.renderer.compile(this.scene, this.rig.camera);
    } catch {
      /* compilation paresseuse */
    }
    this.ui.setLoading(1, 'C’est parti !');
    this.ui.hideLoading();
    this.showTitle();
    this.loop();
  }

  // ------------------------------------------------------------------------------------------ acteurs
  private setupActors() {
    const c = this.world.contents;
    this.player = new Player(this.save.hat);
    this.scene.add(this.player.object);
    const start = this.save.pos ? new THREE.Vector3(...this.save.pos) : c.hub.spots.start.clone();
    start.y = groundAt(start.x, start.z, start.y + 1);
    this.player.setPosition(start);
    this.player.onStep = () => this.audio.play('step', this.player.state === 'ground' ? 1 : 0.5);
    this.player.onJump = () => this.audio.play('jump');
    this.player.onSplash = () => this.audio.play('splash');

    // PNJ
    for (const r of Object.values(c)) for (const n of r.npcs) this.npcs.add(n);
    this.scene.add(this.npcs.group);
    const rng = new Rng(8);
    for (const id of ['paris', 'newyork', 'london', 'japan', 'hub'] as RegionId[]) this.npcs.addWalkers(c[id].walkPoints, id === 'hub' ? 6 : 10, rng.int(0, 999));

    // véhicules garés
    for (const r of Object.values(c))
      for (const v of r.vehicles) {
        const veh = new Vehicle(v.type, v.pos, v.rot);
        this.vehicles.push(veh);
        this.scene.add(veh.root);
      }
    this.player.others = this.vehicles;
    // circulation
    this.traffic.addRegion('paris', c.paris.loops, 12, 1);
    this.traffic.addRegion('newyork', c.newyork.loops, 16, 2);
    this.traffic.addRegion('london', c.london.loops, 12, 3);
    this.traffic.addRegion('japan', c.japan.loops, 4, 4);
    this.scene.add(this.traffic.group);

    // pièces : le long des routes et dans les villes
    const coinPos: THREE.Vector3[] = [];
    for (const r of roadSamples)
      for (let i = 8; i < r.pts.length - 8; i += 9) {
        const [x, z] = r.pts[i];
        coinPos.push(new THREE.Vector3(x, Math.max(r.h[i], heightAt(x, z)) + 0.1, z));
      }
    for (const r of Object.values(c)) for (let i = 0; i < r.walkPoints.length; i += 3) coinPos.push(r.walkPoints[i].clone());
    this.coins = new CoinField(coinPos, this.save.coinsTaken);
    this.scene.add(this.coins.mesh);

    // bébés capybaras cachés
    for (const b of BABY_SPOTS) {
      const s = c[b.region].spots[b.key];
      if (!s) continue;
      const x = s.x + b.off[0], z = s.z + b.off[1];
      const pos = new THREE.Vector3(x, groundAt(x, z, 400), z);
      const id = 'baby-' + b.region;
      if (this.save.babies.includes(id)) continue;
      const m = new Capybara({ size: 0.48, fur: 0xb5865a, hat: b.region === 'pole' ? 'bonnet' : 'none' });
      m.root.position.copy(pos);
      this.scene.add(m.root);
      this.babies.push({ mesh: m, pos, id });
    }
    this.scene.add(this.springBabies);
    this.refreshSpringBabies();

    // mises à jour des régions
    for (const r of Object.values(c))
      for (const u of r.update)
        this.updaters.push((t, dt) => u(t, dt, { hour: this.sky.hour, night: this.sky.state.night, playerPos: this.player.pos }));

    // API pour les missions
    setTalkResolver((id) => this.npcs.get(id)?.obj.position ?? new THREE.Vector3());
    this.api = {
      playerPos: () => this.player.pos,
      vehicleType: () => (this.player.vehicle ? this.player.vehicle.type : null),
      npcPos: (id) => this.npcs.get(id)?.obj.position ?? new THREE.Vector3(),
      content: (r) => this.world.contents[r],
      lastPhoto: () => this.lastPhoto,
      time: () => this.time,
      hat: () => this.player.capy.hatId,
    };
    this.runner.onStepDone = () => this.audio.play('checkpoint');
    this.runner.onItem = () => this.audio.play('coin');
    this.runner.onComplete = (m) => this.completeMission(m);
    this.refreshMissionFlags();
  }

  private refreshSpringBabies() {
    this.springBabies.clear();
    const s = this.world.contents.hub.spots.spring;
    this.save.babies.forEach((_, i) => {
      const b = new Capybara({ size: 0.5, fur: 0xb5865a, hat: 'yuzu' });
      const a = i * 1.05;
      b.root.position.set(s.x + Math.cos(a) * 5, s.y - 0.35, s.z + Math.sin(a) * 5);
      b.root.rotation.y = -a;
      this.springBabies.add(b.root);
    });
  }

  private availableMission(npcId: string): Mission | null {
    return MISSIONS.find((m) => m.giver === npcId && !this.save.done.includes(m.id) && (m.requires ?? []).every((r) => this.save.done.includes(r))) ?? null;
  }

  private refreshMissionFlags() {
    for (const n of this.npcs.list) {
      const m = this.availableMission(n.def.id);
      this.npcs.setMissionFlag(n.def.id, !!m && this.runner.mission?.id !== m.id);
    }
  }

  // ------------------------------------------------------------------------------------------ écrans
  /** Démarre la partie sans passer par l'écran titre (tests). */
  startPlay() {
    this.ui.hideTitle();
    this.state = 'play';
  }

  private showTitle() {
    this.state = 'title';
    const hasSave = this.save.done.length > 0 || this.save.coins > 0 || !!this.save.pos;
    this.ui.showTitle(
      hasSave,
      (fresh) => {
        if (fresh) {
          resetSave();
          const settings = this.save.settings;
          this.save = { ...defaultSave(), settings };
          location.reload();
          return;
        }
        this.audio.init();
        this.audio.resume();
        this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
        this.ui.hideTitle();
        this.state = 'play';
        this.input.requestLock();
        this.rig.yaw = this.player.yaw + 0.0001;
        if (!this.save.done.includes('welcome') && !this.runner.mission) {
          this.ui.toast('Capy World', 'Parle aux capybaras avec un point d’exclamation jaune !', 5000);
        } else this.ui.toast(this.region.name, 'Content de te revoir !');
      },
      () => this.ui.settings(this.save, (s) => this.applySettings(s), () => { this.ui.close(); }),
      () => this.ui.help(() => this.ui.close()),
    );
  }

  private applySettings(s: SaveData['settings']) {
    const reload = s.quality !== this.save.settings.quality;
    this.save.settings = s;
    this.audio.setVolumes(s.music, s.sfx);
    this.rig.sensitivity = s.sensitivity;
    this.rig.invertY = s.invertY;
    this.persist();
    if (reload) setTimeout(() => location.reload(), 150);
  }

  private pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    document.exitPointerLock?.();
    const resume = () => { this.ui.close(); this.state = 'play'; this.input.requestLock(); };
    const back = () => this.pauseMenu(resume);
    this.pauseMenu(resume);
    void back;
  }

  private pauseMenu(resume: () => void) {
    this.ui.pause({
      resume,
      map: () => this.openMap(() => this.pauseMenu(resume)),
      album: () => this.openAlbum(() => this.pauseMenu(resume)),
      settings: () => this.ui.settings(this.save, (s) => this.applySettings(s), () => this.pauseMenu(resume)),
      help: () => this.ui.help(() => this.pauseMenu(resume)),
      title: () => { this.persist(); location.reload(); },
    });
  }

  private openMap(back: () => void) {
    const labels = REGIONS.map((r) => {
      const m = worldToMap(r.x, r.z);
      const ok = this.save.discovered.includes(r.id);
      return {
        name: r.name, u: m.u, v: m.v, ok,
        go: () => {
          this.ui.close();
          this.state = 'play';
          const c = this.world.contents[r.id];
          const dest = (c.spots.start ?? c.walkPoints[0] ?? new THREE.Vector3(r.x, r.ground, r.z)).clone();
          this.teleport(dest, r.name);
          this.input.requestLock();
        },
      };
    });
    const pm = worldToMap(this.player.pos.x, this.player.pos.z);
    const markers: { u: number; v: number; color: string }[] = [];
    const view = this.runner.view(this.api);
    if (view?.beacon) { const m = worldToMap(view.beacon.x, view.beacon.z); markers.push({ ...m, color: '#ffc83a' }); }
    for (const n of this.npcs.list) if (n.bang) { const m = worldToMap(n.obj.position.x, n.obj.position.z); markers.push({ ...m, color: '#ff7a3d' }); }
    this.ui.worldMap(this.mapImg, labels, { ...pm, yaw: this.player.yaw }, markers, back);
  }

  private openAlbum(back: () => void) {
    const all = Object.values(this.world.contents).flatMap((c) => c.photos);
    this.ui.album(
      all.map((p) => ({ name: p.name, region: regionById(p.region).name, done: this.save.photos.includes(p.id) })),
      this.save.babies.length, BABY_SPOTS.length, this.save.done.length, MISSIONS.length, back,
    );
  }

  // ------------------------------------------------------------------------------------------ actions
  teleport(p: THREE.Vector3, label: string) {
    if (this.player.vehicle) this.exitVehicle();
    const q = p.clone();
    q.y = groundAt(q.x, q.z, q.y + 1);
    this.player.setPosition(q);
    this.audio.play('whoosh');
    if (label) this.ui.note(label);
  }

  private enterVehicle(v: Vehicle) {
    this.player.enter(v);
    this.audio.play('door');
    this.ui.note(`${v.spec.name} : flèches/ZQSD pour conduire, E pour descendre`);
  }

  private exitVehicle() {
    const v = this.player.vehicle!;
    this.player.exit();
    v.setHeadlight(false, this.scene);
    this.audio.setEngine(false, 0);
    this.audio.play('door');
  }

  private takePhoto() {
    this.ui.flash();
    this.audio.play('photo');
    const cam = this.rig.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    let best: { id: string; name: string; score: number } | null = null;
    for (const c of Object.values(this.world.contents))
      for (const p of c.photos) {
        const to = p.target.clone().sub(cam.position);
        const d = to.length();
        if (d > p.radius) continue;
        const ang = to.normalize().angleTo(fwd);
        if (ang > 0.42) continue;
        const score = ang + d / p.radius * 0.2;
        if (!best || score < best.score) best = { id: p.id, name: p.name, score };
      }
    this.lastPhoto = { time: this.time, photoId: best?.id ?? null, pos: this.player.pos.clone() };
    if (best) {
      if (!this.save.photos.includes(best.id)) {
        this.save.photos.push(best.id);
        this.addCoins(10);
        this.ui.toast('📸 ' + best.name, 'Nouvelle photo dans l’album ! +10 pièces');
        this.persist();
      } else this.ui.note('📸 Encore une jolie photo : ' + best.name);
    } else this.ui.note('📸 Joli souvenir !');
  }

  private addCoins(n: number) {
    this.save.coins += n;
    this.ui.setCoins(this.save.coins);
  }

  private completeMission(m: Mission) {
    this.save.done.push(m.id);
    this.addCoins(m.reward);
    if (m.hat && !this.save.hats.includes(m.hat)) this.save.hats.push(m.hat);
    this.audio.play('success');
    this.ui.toast('Mission réussie !', `${m.title} · +${m.reward} pièces`, 4000);
    this.ui.setObjective(null);
    this.ui.setTimer(null);
    this.markers.setBeacon(null);
    this.markers.setRings(null, null);
    this.markers.setItems([]);
    const giver = this.npcs.get(m.giver);
    if (giver && giver.obj.position.distanceTo(this.player.pos) < 12)
      this.ui.dialog(giver.def.name, m.outro, () => this.refreshMissionFlags());
    else this.ui.note(m.outro[0]);
    this.refreshMissionFlags();
    this.persist();
  }

  private persist() {
    this.save.coinsTaken = [...this.coins.taken];
    if (this.player) {
      const p = this.player.vehicle ? this.player.vehicle.pos : this.player.pos;
      const safe = this.player.state === 'swim' ? this.player.lastSafe : p;
      this.save.pos = [safe.x, safe.y + 0.2, safe.z];
      this.save.hat = this.player.capy.hatId;
    }
    this.save.hour = this.sky?.hour ?? 9.5;
    writeSave(this.save);
  }

  private findInteraction() {
    const p = this.player.pos;
    this.interactTarget = null;
    if (this.player.vehicle) {
      this.interactTarget = { label: `<kbd>E</kbd> Descendre`, run: () => this.exitVehicle() };
      return;
    }
    let bestD = Infinity;
    const consider = (d: number, label: string, run: () => void) => {
      if (d < bestD) { bestD = d; this.interactTarget = { label, run }; }
    };
    for (const n of this.npcs.list) {
      const d = n.obj.position.distanceTo(p);
      if (d > 3) continue;
      const npc = n;
      consider(d, `<kbd>E</kbd> Parler à ${npc.def.name}`, () => this.talkTo(npc.def.id));
    }
    for (const v of this.vehicles) {
      const d = v.pos.distanceTo(p) - v.spec.radius;
      if (d > 1.8) continue;
      consider(d + 0.5, `<kbd>E</kbd> Monter : ${v.spec.name}`, () => this.enterVehicle(v));
    }
    for (const c of Object.values(this.world.contents))
      for (const it of c.interact) {
        const d = it.pos.distanceTo(p);
        if (d < it.radius) consider(d, `<kbd>E</kbd> ${it.label}`, it.action);
      }
  }

  private talkTo(id: string) {
    const n = this.npcs.get(id)!;
    if (id === 'shop') {
      this.ui.dialog(n.def.name, ['Bienvenue dans ma boutique ! Un chapeau, ça change un capybara.'], () => this.openShop());
      return;
    }
    const m = this.availableMission(id);
    if (m && this.runner.mission?.id !== m.id) {
      if (this.runner.mission) {
        this.ui.dialog(n.def.name, ['Tu as déjà une mission en cours. Reviens me voir quand tu l’auras terminée !', `(${this.runner.mission.title})`]);
        return;
      }
      this.ui.dialog(n.def.name, m.intro, () => {
        this.runner.start(m, this.api);
        this.refreshMissionFlags();
        this.ui.toast(m.title, 'Nouvelle mission !');
        this.audio.play('checkpoint');
      });
      return;
    }
    if (this.runner.mission && this.runner.mission.giver === id) {
      const v = this.runner.view(this.api);
      this.ui.dialog(n.def.name, ['Tu y es presque, courage !', v ? `Objectif : ${v.text}.` : '']);
      return;
    }
    const lines = n.def.kind === 'penguin' ? CHAT.penguin : CHAT.default;
    this.ui.dialog(n.def.name, [lines[Math.floor(Math.random() * lines.length)]]);
  }

  private openShop() {
    this.state = 'paused';
    document.exitPointerLock?.();
    const close = () => { this.ui.close(); this.state = 'play'; this.input.requestLock(); };
    this.ui.shop(
      this.save,
      (id) => {
        const h = HATS.find((x) => x.id === id)!;
        if (this.save.coins >= h.price) {
          this.save.coins -= h.price;
          this.save.hats.push(id);
          this.equipHat(id);
          this.audio.play('success');
          this.ui.setCoins(this.save.coins);
        } else this.audio.play('bump');
      },
      (id) => this.equipHat(id),
      close,
    );
  }

  private equipHat(id: HatId) {
    this.save.hat = id;
    this.player.capy.setHat(id);
    this.audio.play('click');
    this.persist();
  }

  private callCar() {
    if (this.player.vehicle || this.player.state === 'swim') return;
    const p = this.player.pos;
    const yaw = this.player.yaw;
    const pos = new THREE.Vector3(p.x + Math.sin(yaw) * 4 + Math.cos(yaw) * 2, p.y, p.z + Math.cos(yaw) * 4 - Math.sin(yaw) * 2);
    if (groundAt(pos.x, pos.z) < 0) return this.ui.note('Impossible d’appeler une voiture ici !');
    if (this.calledCar) {
      this.scene.remove(this.calledCar.root);
      this.vehicles.splice(this.vehicles.indexOf(this.calledCar), 1);
    }
    const t: VehicleType = this.region.id === 'pole' ? 'snowmobile' : this.region.id === 'desert' ? 'jeep' : 'car';
    const v = new Vehicle(t, pos, yaw, t === 'car' ? [0x3fa8d8, 0xff6fa8, 0x8fd84a, 0xffb03a][Math.floor(Math.random() * 4)] : undefined);
    this.vehicles.push(v);
    this.scene.add(v.root);
    this.calledCar = v;
    this.audio.play('horn');
    this.ui.note('Ton véhicule est arrivé ! Appuie sur E pour monter.');
  }

  private respawn() {
    if (this.player.vehicle) {
      const v = this.player.vehicle;
      if (v.spec.boat) return;
      v.pos.y += 3;
      v.speed = 0;
      v.pitch = v.roll = 0;
      return;
    }
    this.player.setPosition(this.player.lastSafe.clone());
    this.audio.play('whoosh');
  }

  // ------------------------------------------------------------------------------------------ boucle
  /** Mode test : pas de boucle automatique, on avance image par image (captures automatisées). */
  manual = new URLSearchParams(location.search).has('manual');

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
      if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'play') this.updatePlay(dt);
      else if (this.state === 'paused') this.updatePaused(dt);
      this.updateWorld(dt);
      if (render) this.post.render(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
  }

  private updateTitle(dt: number) {
    this.titleAngle += dt * 0.05;
    const r = 70;
    const cam = this.rig.camera;
    cam.position.set(Math.cos(this.titleAngle) * r, 26, Math.sin(this.titleAngle) * r);
    cam.lookAt(0, 8, 0);
    this.player.capy.animate(dt, 0, 'ground', this.time);
  }

  private updatePaused(_dt: number) {
    if (this.input.consume('pause') && this.ui.panelOpen) {
      this.ui.close();
      this.state = 'play';
      this.input.requestLock();
    }
  }

  private updatePlay(dt: number) {
    const inp = this.input;
    // dialogue modal
    if (this.ui.dialogOpen) {
      this.ui.tickDialog(dt);
      if (inp.consume('interact') || inp.consume('jump')) this.ui.advanceDialog();
      this.rig.update(dt, this.player, inp);
      this.player.capy.animate(dt, 0, this.player.vehicle ? 'sit' : 'ground', this.time);
      this.ui.setPrompt(null);
      return;
    }
    if (inp.consume('pause')) return this.pause();
    if (inp.consume('map')) {
      this.state = 'paused';
      document.exitPointerLock?.();
      return this.openMap(() => { this.ui.close(); this.state = 'play'; this.input.requestLock(); });
    }
    if (inp.consume('fullscreen')) toggleFullscreen();
    if (inp.consume('photo')) this.takePhoto();
    if (inp.consume('vehicle')) this.callCar();
    if (inp.consume('respawn')) this.respawn();
    if (inp.consume('horn') && this.player.vehicle) this.audio.play('horn');
    if (inp.consume('help')) {
      this.state = 'paused';
      document.exitPointerLock?.();
      this.ui.help(() => { this.ui.close(); this.state = 'play'; this.input.requestLock(); });
      return;
    }

    this.findInteraction();
    if (inp.consume('interact') && this.interactTarget) this.interactTarget.run();
    this.ui.setPrompt(this.interactTarget?.label ?? null);

    // physique du joueur et des véhicules
    this.player.update(dt, inp, this.rig.moveYaw, this.time);
    for (const v of this.vehicles) if (v !== this.player.vehicle && (Math.abs(v.speed) > 0.05 || v.vy !== 0)) v.update(dt, 0, 0, false, this.vehicles);
    this.rig.update(dt, this.player, inp);

    // pièces
    const got = this.coins.collect(this.player.vehicle ? this.player.vehicle.pos : this.player.pos, this.player.vehicle ? 2.4 : 1.2);
    if (got.length) {
      this.addCoins(got.length);
      this.audio.play('coin');
    }
    // bébés capybaras
    for (const b of this.babies) {
      if (!b.mesh.root.visible) continue;
      b.mesh.animate(dt, 0, 'ground', this.time);
      b.mesh.root.rotation.y += dt * 0.3;
      if (b.pos.distanceTo(this.player.pos) < 2.5) {
        b.mesh.root.visible = false;
        this.save.babies.push(b.id);
        this.addCoins(20);
        this.audio.play('success');
        this.ui.toast('Un bébé capybara !', `${this.save.babies.length} / ${BABY_SPOTS.length} retrouvés · il t’attend à la source chaude`);
        this.refreshSpringBabies();
        this.persist();
      }
    }

    // mission en cours
    this.runner.update(this.api, dt);
    const view = this.runner.view(this.api);
    if (view && this.runner.mission) {
      this.ui.setObjective(this.runner.mission.title, view.text, view.progress ?? '');
      this.markers.setBeacon(view.beacon);
      this.markers.setRings(view.rings?.[0] ?? null, view.rings?.[1] ?? null, 6);
      const items = view.items ?? [];
      if ((this.markers as any)._n !== items.length) {
        this.markers.setItems(items);
        (this.markers as any)._n = items.length;
      }
      this.ui.setTimer(view.timer !== undefined ? view.timer : null);
      const ping = (this.runner.state.data.ping as number) ?? 0;
      if (ping !== this.lastCheckpointPing) { this.lastCheckpointPing = ping; this.audio.play('checkpoint'); }
    } else {
      this.markers.setBeacon(null);
      this.markers.setRings(null, null);
      if ((this.markers as any)._n) { this.markers.setItems([]); (this.markers as any)._n = 0; }
      this.lastCheckpointPing = 0;
    }

    // région courante
    const pp = this.player.pos;
    const reg = nearestRegion(pp.x, pp.z);
    const inside = Math.hypot(pp.x - reg.x, pp.z - reg.z) < reg.radius;
    if (inside && reg.id !== this.region.id) {
      this.region = reg;
      if (!this.save.discovered.includes(reg.id)) {
        this.save.discovered.push(reg.id);
        this.ui.toast(reg.welcome, 'Nouvelle région découverte !', 3500);
        this.audio.play('success');
        this.persist();
      } else this.ui.toast(reg.name, '', 2000);
    }

    // conduite : HUD + son
    const v = this.player.vehicle;
    if (v) {
      this.ui.setSpeed(Math.abs(v.speed) * 3.6);
      this.audio.setEngine(true, clamp(Math.abs(v.speed) / v.spec.maxSpeed, 0, 1), v.spec.boat ? 'boat' : v.type === 'snowmobile' ? 'snow' : v.type === 'bus' ? 'bus' : v.type === 'scooter' ? 'scooter' : 'car');
      if (v.bump > 0.5) { this.audio.play('bump', v.bump); this.rig.addShake(v.bump * 0.5); v.bump = 0.49; }
      v.setHeadlight(this.sky.state.night > 0.4, this.scene);
    } else this.ui.setSpeed(null);

    // sauvegarde périodique
    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      this.persist();
    }
  }

  private updateWorld(dt: number) {
    const t = this.time;
    const focus = this.state === 'title' ? new THREE.Vector3(0, 6, 0) : this.player.pos;
    const reg = this.state === 'title' ? REGIONS[0] : nearestRegion(focus.x, focus.z);
    this.sky.update(dt, t, focus, reg.id === 'pole' ? 1 : 0);
    const st = this.sky.state;
    setNight(st.night);
    windUniform.value = t;
    // brouillard et étalonnage selon la région
    const fog = this.scene.fog as THREE.FogExp2;
    const regionFog = new THREE.Color(...reg.fog);
    const fogCol = st.horizon.clone().lerp(regionFog, 0.45 * (1 - st.night));
    fog.color.lerp(fogCol, 1 - Math.exp(-dt * 1.5));
    fog.density = damp(fog.density, reg.fogDensity * (1 + st.night * 0.3), 1, dt);
    const g = this.post.grade;
    this.gradeTarget = { saturation: reg.saturation, contrast: reg.contrast, warmth: reg.warmth + st.dusk * 0.4 };
    g.set('saturation', damp(g.get('saturation'), this.gradeTarget.saturation, 1, dt));
    g.set('contrast', damp(g.get('contrast'), this.gradeTarget.contrast, 1, dt));
    g.set('warmth', damp(g.get('warmth'), this.gradeTarget.warmth, 1, dt));
    if (this.post.bloom) this.post.bloom.intensity = 0.6 + st.night * 0.9;
    // eau
    const [sh, dp] = WATER[reg.id];
    this.world.water.update(t, new THREE.Color(...sh), new THREE.Color(...dp), dt);
    // herbe
    const pushers = [new THREE.Vector4(focus.x, focus.z, 1.0, 1)];
    if (this.player?.vehicle) pushers.push(new THREE.Vector4(this.player.vehicle.pos.x, this.player.vehicle.pos.z, 2.2, 1));
    this.world.grass.update(t, focus, st.sunDir, this.sky.sun.color, this.sky.sun.intensity, new THREE.Color(0.35, 0.42, 0.5).multiplyScalar(lerp(1, 0.25, st.night)), pushers);
    // éléments animés
    for (const u of this.updaters) u(t, dt);
    this.npcs.update(dt, t, focus);
    this.traffic.update(dt, focus, this.player?.vehicle ?? null);
    this.markers.update(t);
    this.coins.update(t);
    // visibilité des régions lointaines
    const cam = this.rig.camera.position;
    for (const c of Object.values(this.world.contents)) {
      const r = c.group.userData.region as RegionDef;
      c.group.visible = Math.hypot(cam.x - r.x, cam.z - r.z) < 1650;
    }
    // HUD
    if (this.state === 'play') {
      this.ui.setRegion(this.region.name, this.sky.hour);
      this.ui.setCoins(this.save.coins);
      const markers: { pos: THREE.Vector3; color: string; icon?: string }[] = [];
      for (const n of this.npcs.list) if (n.bang && n.obj.position.distanceTo(focus) < 420) markers.push({ pos: n.obj.position, color: '#ffc83a', icon: '!' });
      if (this.markers.beaconPos) markers.push({ pos: this.markers.beaconPos, color: '#3fd0ff', icon: '★' });
      for (const v of this.vehicles) if (v.pos.distanceTo(focus) < 200 && v !== this.player.vehicle) markers.push({ pos: v.pos, color: '#7a8a9a' });
      this.minimap.draw(focus.x, focus.z, this.rig.yaw, this.player.vehicle ? this.player.vehicle.yaw : this.player.yaw, markers);
      const nearWater = heightAt(focus.x, focus.z) < 2;
      this.audio.update(this.region.id, st.night, nearWater, this.region.look);
    }
  }
}
