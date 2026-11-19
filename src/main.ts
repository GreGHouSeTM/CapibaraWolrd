// Point d'entrée de Capy World.
import { Game } from './game';

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webglOk()) {
  document.getElementById('app')!.innerHTML =
    '<div style="color:#fff;font:20px sans-serif;padding:40px;text-align:center">Ton navigateur ne gère pas WebGL 2.<br>Essaie avec une version récente de Chrome, Edge ou Firefox.</div>';
} else if (new URLSearchParams(location.search).get('demo') === 'foret') {
  // --- PREUVE NEXT-GEN --- zone de démonstration « forêt » : module et assets chargés seulement dans ce cas
  import('./demo/foret/app')
    .then((m) => m.startForet())
    .catch((e) => {
      console.error(e);
      const t = document.getElementById('loadtip');
      if (t) t.textContent = 'Oups, une erreur est survenue : ' + (e?.message ?? e);
    });
} else {
  const game = new Game();
  game.init().catch((e) => {
    console.error(e);
    const t = document.getElementById('loadtip');
    if (t) t.textContent = 'Oups, une erreur est survenue : ' + (e?.message ?? e);
  });
}
