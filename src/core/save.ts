// Sauvegarde automatique dans le navigateur (localStorage), tolérante aux erreurs.
import type { HatId } from '../actors/capybara';

export interface SaveData {
  version: 1;
  coins: number;
  hat: HatId;
  hats: HatId[];
  done: string[]; // missions terminées
  photos: string[]; // monuments photographiés
  coinsTaken: number[]; // indices des pièces ramassées
  babies: string[]; // bébés capybaras retrouvés
  discovered: string[]; // régions visitées
  pos: [number, number, number] | null;
  hour: number;
  settings: { quality: 'low' | 'medium' | 'high'; music: number; sfx: number; sensitivity: number; invertY: boolean };
}

const KEY = 'capy-world-save-v1';

export function defaultSave(): SaveData {
  return {
    version: 1, coins: 0, hat: 'yuzu', hats: ['none', 'yuzu'], done: [], photos: [], coinsTaken: [], babies: [], discovered: ['hub'],
    pos: null, hour: 9.5,
    settings: { quality: 'medium', music: 0.5, sfx: 0.8, sensitivity: 1, invertY: false },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* stockage indisponible : on continue sans sauvegarde */
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien */
  }
}
