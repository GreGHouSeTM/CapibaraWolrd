// Moteur de missions (données + étapes) et liste des missions du jeu.
import * as THREE from 'three';
import type { RegionId } from '../world/layout';
import type { VehicleType, RegionContent } from '../regions/common';
import type { ItemKind } from './markers';
import type { HatId } from '../actors/capybara';
import { roadSamples, heightAt } from '../world/heightmap';
import { TALL_GRASS_ZONES } from '../world/zones';

export interface GameAPI {
  playerPos: () => THREE.Vector3;
  vehicleType: () => VehicleType | null;
  npcPos: (id: string) => THREE.Vector3;
  content: (r: RegionId) => RegionContent;
  lastPhoto: () => { time: number; photoId: string | null; pos: THREE.Vector3 } | null;
  time: () => number;
  /** chapeau porté par le joueur */
  hat: () => string;
  /** nombre d'ennemis chassés (« pouf ») dans une prairie depuis le début de la partie (combat) */
  defeated?: (zone: string) => number;
}

export interface StepView {
  text: string;
  beacon: THREE.Vector3 | null;
  rings?: [THREE.Vector3 | null, THREE.Vector3 | null];
  items?: { pos: THREE.Vector3; kind: ItemKind }[];
  progress?: string;
  timer?: number;
}

export interface Step {
  text: string;
  start?: (g: GameAPI, s: StepState) => void;
  /** renvoie true quand l'étape est réussie */
  check: (g: GameAPI, s: StepState, dt: number) => boolean;
  view: (g: GameAPI, s: StepState) => Omit<StepView, 'text'>;
}

export interface StepState {
  idx: number;
  taken: Set<number>;
  t: number;
  startTime: number;
  data: Record<string, unknown>;
  onItem?: (i: number) => void;
}

export interface Mission {
  id: string;
  title: string;
  region: RegionId;
  giver: string;
  intro: string[];
  outro: string[];
  reward: number;
  hat?: HatId;
  requires?: string[];
  steps: (g: GameAPI) => Step[];
}

// ------------------------------------------------------------------------- briques d'étapes
const near = (a: THREE.Vector3, b: THREE.Vector3, r: number, dy = 6) => Math.hypot(a.x - b.x, a.z - b.z) < r && Math.abs(a.y - b.y) < dy;

export function goto(text: string, pos: () => THREE.Vector3, r = 5, vehicle?: VehicleType | 'any', dy = 6): Step {
  return {
    text,
    check: (g) => near(g.playerPos(), pos(), r, dy) && (!vehicle || (vehicle === 'any' ? !!g.vehicleType() : g.vehicleType() === vehicle)),
    view: () => ({ beacon: pos() }),
  };
}

export function talk(text: string, npc: string): Step {
  return goto(text, () => talkPos(npc), 3.2);
}
let talkPos: (id: string) => THREE.Vector3 = () => new THREE.Vector3();
export function setTalkResolver(f: (id: string) => THREE.Vector3) {
  talkPos = f;
}

export function enter(text: string, type: VehicleType, where: () => THREE.Vector3 | null): Step {
  return {
    text,
    check: (g) => g.vehicleType() === type,
    view: () => ({ beacon: where() }),
  };
}

export function collect(text: string, pts: THREE.Vector3[], kind: ItemKind, r = 2.2): Step {
  return {
    text,
    check: (g, s) => {
      const p = g.playerPos();
      pts.forEach((q, i) => {
        if (!s.taken.has(i) && near(p, q, r, 4)) {
          s.taken.add(i);
          s.onItem?.(i);
        }
      });
      return s.taken.size >= pts.length;
    },
    view: (_g, s) => {
      const left = pts.map((p, i) => ({ p, i })).filter((o) => !s.taken.has(o.i));
      // repère vers l'objet le plus proche
      const pp = _g.playerPos();
      left.sort((a, b) => a.p.distanceTo(pp) - b.p.distanceTo(pp));
      return {
        beacon: left[0]?.p ?? null,
        items: pts.map((pos, i) => ({ pos, kind: s.taken.has(i) ? ('hidden' as ItemKind) : kind })).filter((it) => (it.kind as string) !== 'hidden'),
        progress: `${s.taken.size} / ${pts.length}`,
      };
    },
  };
}

export function checkpoints(text: string, pts: () => THREE.Vector3[], vehicle: VehicleType | null, size = 6, labels?: string[]): Step {
  return {
    text,
    start: (g, s) => (s.startTime = g.time()),
    check: (g, s) => {
      const list = pts();
      const p = g.playerPos();
      if (vehicle && g.vehicleType() !== vehicle) return false;
      if (near(p, list[s.idx], size * 1.1, 12)) {
        s.idx++;
        s.data.ping = (s.data.ping as number ?? 0) + 1;
      }
      return s.idx >= list.length;
    },
    view: (g, s) => {
      const list = pts();
      const needCar = vehicle && g.vehicleType() !== vehicle;
      return {
        beacon: needCar ? null : list[s.idx] ?? null,
        rings: needCar ? [null, null] : [list[s.idx] ?? null, list[s.idx + 1] ?? null],
        progress: labels ? labels[Math.min(s.idx, labels.length - 1)] : `${s.idx} / ${list.length}`,
        timer: g.time() - s.startTime,
      };
    },
  };
}

export function photo(text: string, photoId: string, where?: () => THREE.Vector3): Step {
  return {
    text,
    start: (g, s) => (s.startTime = g.time()),
    check: (g, s) => {
      const lp = g.lastPhoto();
      return !!lp && lp.time > s.startTime && lp.photoId === photoId;
    },
    view: () => ({ beacon: where ? where() : null }),
  };
}

/** Chasser `count` ennemis d'une prairie (comptés depuis le début de l'étape). */
export function defeat(text: string, zone: string, count: number, where: () => THREE.Vector3 | null): Step {
  const done = (g: GameAPI, s: StepState) => (g.defeated?.(zone) ?? 0) - ((s.data.base as number) ?? 0);
  return {
    text,
    start: (g, s) => (s.data.base = g.defeated?.(zone) ?? 0),
    check: (g, s) => done(g, s) >= count,
    view: (g, s) => ({ beacon: where(), progress: `${Math.min(count, done(g, s))} / ${count}` }),
  };
}

export function custom(text: string, check: (g: GameAPI) => boolean, beacon: () => THREE.Vector3 | null): Step {
  return { text, check: (g) => check(g), view: () => ({ beacon: beacon() }) };
}

// ------------------------------------------------------------------------- missions
const sp = (g: GameAPI, r: RegionId, k: string) => g.content(r).spots[k];
const spl = (g: GameAPI, r: RegionId, k: string) => (g.content(r).spots as any)[k] as THREE.Vector3[];
const vehicleOf = (g: GameAPI, r: RegionId, t: VehicleType) => g.content(r).vehicles.find((v) => v.type === t)?.pos ?? null;

export const MISSIONS: Mission[] = [
  // --------------------------------------------------------------- mini-missions de test (Capyville)
  {
    id: 'test-drive', title: 'Mini-mission : Premier volant', region: 'hub', giver: 'coach', reward: 15,
    intro: ['Salut ! Je suis Coach Capy, moniteur d’auto-école.', 'Monte dans le cabriolet bleu (touche E), puis passe dans les anneaux sur la route de Paris. Z pour avancer, Q et D pour tourner, Espace pour freiner !'],
    outro: ['Bravo, permis réussi ! Tu peux conduire partout maintenant.'],
    steps: (g) => {
      const r = roadSamples[0];
      const at = (i: number) => {
        const k = Math.min(i, r.pts.length - 1);
        return new THREE.Vector3(r.pts[k][0], r.h[k], r.pts[k][1]);
      };
      const pts = [at(3), at(10), at(18), at(26)];
      return [
        enter('Monte dans le cabriolet bleu', 'car', () => vehicleOf(g, 'hub', 'car')),
        checkpoints('Passe dans les 4 anneaux bleus', () => pts, 'car', 6),
        custom('Descends de la voiture (touche E)', (gg) => gg.vehicleType() === null, () => null),
        talk('Retourne voir Coach Capy', 'coach'),
      ];
    },
  },
  {
    id: 'test-swim', title: 'Mini-mission : Plouf !', region: 'hub', giver: 'swimmer', reward: 15,
    intro: ['Coucou ! Moi c’est Nina, la championne de natation.', 'Les capybaras nagent super bien ! Saute dans l’étang et attrape les 3 étoiles qui flottent sur l’eau.'],
    outro: ['Quelle nageuse ! Tu peux sortir de l’eau tout seul en avançant vers la rive.'],
    steps: (g) => {
      const c = sp(g, 'hub', 'pond');
      const pts = [[0, 0], [11, 4], [-10, -5]].map(([dx, dz]) => new THREE.Vector3(c.x + dx, -0.3, c.z + dz));
      return [
        collect('Attrape les 3 étoiles dans l’étang', pts, 'star', 2.4),
        talk('Sors de l’eau et retourne voir Nina', 'swimmer'),
      ];
    },
  },
  {
    id: 'test-photo', title: 'Mini-mission : Clic-clac', region: 'hub', giver: 'photographer', reward: 15,
    intro: ['Bonjour ! Je suis Léo, photographe.', 'Va prendre le moulin en photo (touche F, en le regardant bien en face).', 'Ensuite, passe chez Basile le chapelier et change de chapeau : je veux une photo de toi bien habillé !'],
    outro: ['Superbe ! Tu sais faire des photos et changer de tenue. Ton album t’attend (menu Pause).'],
    steps: (g) => {
      let startHat = '';
      return [
        photo('Prends une photo du moulin (touche F)', 'windmill', () => sp(g, 'hub', 'windmill')),
        {
          text: 'Change de chapeau chez Basile le chapelier',
          start: (gg) => (startHat = gg.hat()),
          check: (gg) => gg.hat() !== startHat,
          view: () => ({ beacon: sp(g, 'hub', 'shop') }),
        },
        talk('Montre ton nouveau chapeau à Léo', 'photographer'),
      ];
    },
  },
  {
    // --- COMBAT --- : mini-mission de combat (bible §10.1), donnée par la Gardienne Sora à la porte du Levant
    id: 'grignoteurs', title: 'Les Grignoteurs du Levant', region: 'hub', giver: 'guardian', reward: 40,
    intro: [
      'Halte-là, petit voyageur ! Je suis Sora, gardienne de la porte du Levant.',
      'Au bout du Chemin des Susuki, des Grignoteurs se cachent dans les hautes herbes : de petites boules de ronces grincheuses qui grignotent nos récoltes !',
      'Fais-les déguerpir ! Clic gauche pour donner un coup (trois de suite pour un combo : coup de tête, coup de patte, ruade). Clic droit ou C pour faire une roulade.',
      'Quand un Grignoteur tremble avec un « ! » au-dessus de la tête, il va foncer tout droit : roule sur le côté ! Et pas de panique, ils ne font que des chatouilles.',
    ],
    outro: ['Bravo ! Les Grignoteurs sont partis bouder dans leurs nids. Les récoltes te disent merci !', 'Ils finissent toujours par revenir… mais maintenant, tu sais t’y prendre.'],
    steps: (g) => {
      const z = TALL_GRASS_ZONES.find((t) => t.id === 'levant')!;
      const center = () => new THREE.Vector3(z.x, heightAt(z.x, z.z), z.z);
      return [
        goto('Suis le Chemin des Susuki jusqu’à la prairie du Levant', center, z.r * 0.8, undefined, 30),
        defeat(`Fais déguerpir les ${z.enemies} Grignoteurs de la prairie`, z.id, z.enemies, center),
        talk('Retourne voir la Gardienne Sora', 'guardian'),
      ];
    },
  },
  {
    id: 'welcome', title: 'Bienvenue à Capyville', region: 'hub', giver: 'mamie', reward: 30,
    intro: [
      'Bonjour mon petit ! Bienvenue à Capyville, le village des capybaras.',
      'Tu sais ce que les capybaras préfèrent ? Les bains chauds ! Va donc te détendre dans la source chaude.',
      'Ensuite, rapporte-moi les 5 yuzus du verger. Je ferai une bonne tarte !',
    ],
    outro: ['Merci ! Voilà quelques pièces. Basile le chapelier vend de jolis chapeaux sur la place.', 'Et le monde entier t’attend : suis les panneaux, prends une voiture (touche E) et pars à l’aventure !'],
    steps: (g) => [
      goto('Va te baigner dans la source chaude', () => sp(g, 'hub', 'spring'), 8),
      collect('Ramasse les 5 yuzus autour du village', spl(g, 'hub', 'yuzuList'), 'yuzu'),
      talk('Rapporte les yuzus à Mamie Capy', 'mamie'),
    ],
  },
  {
    id: 'croissants', title: 'Les croissants du matin', region: 'paris', giver: 'baker', reward: 45,
    intro: ['Oh là là ! Mon livreur est enrhumé et les cafés attendent leurs croissants !', 'Tu veux bien les livrer ? Prends mon scooter, il est garé juste à côté.'],
    outro: ['Formidable ! Tous les cafés sont servis. Tiens, c’est pour toi. Bon appétit !'],
    steps: (g) => [
      goto('Livre les croissants au premier café', () => sp(g, 'paris', 'cafe1'), 4.5),
      goto('Livre les croissants au deuxième café', () => sp(g, 'paris', 'cafe2'), 4.5),
      goto('Livre les croissants au troisième café', () => sp(g, 'paris', 'cafe3'), 4.5),
      talk('Retourne voir Pierre le boulanger', 'baker'),
    ],
  },
  {
    id: 'eiffel', title: 'La vue d’en haut', region: 'paris', giver: 'painter', reward: 45,
    intro: ['Je peins la tour Eiffel depuis des années… mais je n’ai jamais vu Paris d’en haut !', 'Monte au deuxième étage avec l’ascenseur et prends une photo pour moi (touche F).'],
    outro: ['Magnifique ! Je vais en faire mon plus beau tableau. Merci, petit capybara !'],
    steps: (g) => [
      custom('Prends l’ascenseur au pied de la tour Eiffel', (gg) => gg.playerPos().y > sp(g, 'paris', 'eiffelTop').y - 2, () => sp(g, 'paris', 'eiffelBase')),
      custom('Prends une photo de Paris depuis la tour (touche F)', (gg) => {
        const lp = gg.lastPhoto();
        return !!lp && lp.pos.y > sp(g, 'paris', 'eiffelTop').y - 2 && gg.time() - lp.time < 1;
      }, () => null),
      talk('Montre la photo à Amélie', 'painter'),
    ],
  },
  {
    id: 'taxi', title: 'Taxi Capy', region: 'newyork', giver: 'cabbie', reward: 60,
    intro: ['Hey ! Mes clients attendent partout en ville et j’ai mal au dos.', 'Prends mon taxi jaune et emmène-les à destination. Les anneaux bleus te montrent le chemin !'],
    outro: ['Super conduite ! Les clients ont adoré. Voilà tes pourboires !'],
    steps: (g) => {
      const rp = g.content('newyork').roadPoints;
      const pick = (i: number) => rp[(i * 37) % rp.length].clone();
      const pts = [pick(3), pick(8), pick(14), pick(19), pick(25), pick(30)];
      return [
        enter('Monte dans le taxi jaune', 'taxi', () => vehicleOf(g, 'newyork', 'taxi')),
        checkpoints('Prends et dépose les clients', () => pts, 'taxi', 6, ['Client 1 : prise en charge', 'Client 1 : dépose', 'Client 2 : prise en charge', 'Client 2 : dépose', 'Client 3 : prise en charge', 'Client 3 : dépose']),
      ];
    },
  },
  {
    id: 'liberty', title: 'L’étoile de la Liberté', region: 'newyork', giver: 'tourist', reward: 55,
    intro: ['Catastrophe ! Une étoile dorée s’est détachée de la statue de la Liberté.', 'Elle est tombée sur l’île. Prends le bateau au ponton… ou nage, les capybaras adorent ça !'],
    outro: ['Tu l’as retrouvée ! La statue va briller de nouveau. Merci !'],
    steps: (g) => [
      collect('Récupère l’étoile sur l’île de la Liberté', [sp(g, 'newyork', 'libertyIsland')], 'star', 3),
      talk('Rapporte l’étoile à Grace sur le ponton', 'tourist'),
    ],
  },
  {
    id: 'bus', title: 'Le bus rouge', region: 'london', giver: 'busdriver', reward: 60,
    intro: ['Lovely ! Tu sais conduire un bus à impériale ?', 'Fais le tour de Londres et passe par tous les arrêts. Doucement dans les virages !'],
    outro: ['Splendid ! Les passagers sont ravis. Voici ton salaire de chauffeur !'],
    steps: (g) => {
      const rp = g.content('london').roadPoints;
      const pts = [5, 11, 18, 26, 33, 40].map((i) => rp[(i * 13) % rp.length].clone());
      return [enter('Monte dans le bus rouge', 'bus', () => vehicleOf(g, 'london', 'bus')), checkpoints('Passe par tous les arrêts de bus', () => pts, 'bus', 7)];
    },
  },
  {
    id: 'umbrellas', title: 'Les parapluies envolés', region: 'london', giver: 'guard', reward: 50,
    intro: ['Ah, ce vent londonien ! Il a emporté cinq parapluies dans les rues.', 'Retrouve-les avant la prochaine averse, veux-tu ?'],
    outro: ['Jolly good ! Tout le monde restera au sec. Voici une récompense.'],
    steps: (g) => [collect('Retrouve les 5 parapluies', spl(g, 'london', 'umbrellaList'), 'umbrella'), talk('Rapporte les parapluies à Sir Reginald', 'guard')],
  },
  {
    id: 'lanterns', title: 'La fête des lanternes', region: 'japan', giver: 'boatgirl', reward: 60,
    intro: ['Konnichiwa ! Ce soir, c’est la fête des lanternes sur le lac.', 'Prends ma barque, passe sous le grand torii puis fais le tour du lac !'],
    outro: ['Sugoi ! Quelle belle balade. Les lanternes brillent pour toi !'],
    steps: (g) => {
      const c = sp(g, 'japan', 'lake');
      const t = sp(g, 'japan', 'torii');
      const pts = [t.clone().setY(0)];
      for (let i = 1; i <= 6; i++) {
        const a = Math.atan2(t.z - c.z, t.x - c.x) + (i / 6) * Math.PI * 2;
        pts.push(new THREE.Vector3(c.x + Math.cos(a) * 38, 0, c.z + Math.sin(a) * 30));
      }
      return [enter('Monte dans la barque de Hana', 'boat', () => vehicleOf(g, 'japan', 'boat')), checkpoints('Passe sous le torii et fais le tour du lac', () => pts, 'boat', 5)];
    },
  },
  {
    id: 'pagoda', title: 'Le gardien de la pagode', region: 'japan', giver: 'monk', reward: 45,
    intro: ['Bienvenue, jeune voyageur. De la pagode, on aperçoit le mont Fuji.', 'Prends-le en photo (touche F) : c’est un souvenir porte-bonheur.'],
    outro: ['Très belle photo. Que la sérénité t’accompagne. Voici une offrande.'],
    steps: (g) => [goto('Approche-toi de la pagode', () => sp(g, 'japan', 'pagoda').clone().setY(sp(g, 'japan', 'pagoda').y - 15), 14), photo('Prends le mont Fuji en photo (touche F)', 'fuji'), talk('Retourne voir Maître Kenji', 'monk')],
  },
  {
    id: 'treasure', title: 'Le trésor du Sphinx', region: 'desert', giver: 'explorer', reward: 80, hat: 'crown',
    intro: ['Fascinant ! La légende dit que quatre scarabées d’or sont cachés dans les dunes.', 'Trouve-les tous, et l’entrée de la grande pyramide s’ouvrira. Prends la jeep si tu veux !'],
    outro: ['Incroyable ! Le trésor des pharaons-capybaras ! Cette couronne royale est pour toi !'],
    steps: (g) => [collect('Trouve les 4 scarabées d’or dans les dunes', spl(g, 'desert', 'scarabList'), 'scarab', 3), goto('Va à l’entrée de la grande pyramide', () => sp(g, 'desert', 'tomb'), 5)],
  },
  {
    id: 'gifts', title: 'Les cadeaux du Pôle', region: 'pole', giver: 'santa', reward: 50,
    intro: ['Ho ho ho ! Mes lutins sont partis en vacances…', 'Peux-tu apporter ces cadeaux aux igloos du village ?'],
    outro: ['Ho ho ho ! Tout le village est content. Merci mon petit lutin capybara !'],
    steps: (g) => spl(g, 'pole', 'giftList').map((p, i) => goto(`Livre le cadeau n°${i + 1} à un igloo`, () => p, 3.5)),
  },
  {
    id: 'snowrace', title: 'Le grand rallye des neiges', region: 'pole', giver: 'santa', reward: 60, requires: ['gifts'],
    intro: ['Une course de motoneige autour du village, ça te dit ?', 'Passe dans tous les anneaux le plus vite possible !'],
    outro: ['Quelle vitesse ! Tu es le champion des neiges !'],
    steps: (g) => [enter('Monte sur une motoneige', 'snowmobile', () => vehicleOf(g, 'pole', 'snowmobile')), checkpoints('Fais le tour du circuit', () => [...spl(g, 'pole', 'snowTrack'), spl(g, 'pole', 'snowTrack')[0]], 'snowmobile', 7)],
  },
];

// ------------------------------------------------------------------------- exécution
export class MissionRunner {
  mission: Mission | null = null;
  steps: Step[] = [];
  stepIndex = 0;
  state: StepState = { idx: 0, taken: new Set(), t: 0, startTime: 0, data: {} };
  onStepDone: ((m: Mission, i: number) => void) | null = null;
  onComplete: ((m: Mission) => void) | null = null;
  onItem: ((i: number) => void) | null = null;

  start(m: Mission, g: GameAPI) {
    this.mission = m;
    this.steps = m.steps(g);
    this.stepIndex = 0;
    this.beginStep(g);
  }

  cancel() {
    this.mission = null;
    this.steps = [];
  }

  private beginStep(g: GameAPI) {
    this.state = { idx: 0, taken: new Set(), t: 0, startTime: g.time(), data: {}, onItem: (i) => this.onItem?.(i) };
    this.steps[this.stepIndex]?.start?.(g, this.state);
  }

  update(g: GameAPI, dt: number) {
    if (!this.mission) return;
    const step = this.steps[this.stepIndex];
    this.state.t += dt;
    if (step.check(g, this.state, dt)) {
      this.onStepDone?.(this.mission, this.stepIndex);
      this.stepIndex++;
      if (this.stepIndex >= this.steps.length) {
        const m = this.mission;
        this.mission = null;
        this.onComplete?.(m);
      } else this.beginStep(g);
    }
  }

  view(g: GameAPI): StepView | null {
    if (!this.mission) return null;
    const step = this.steps[this.stepIndex];
    return { text: step.text, ...step.view(g, this.state) };
  }
}
