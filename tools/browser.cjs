// Lancement de Chromium (Playwright) commun à tous les outils de capture et de test.
//
// Par défaut, Chromium utilise la vraie carte graphique (ANGLE, Direct3D 11 sous Windows, OpenGL/Vulkan ailleurs).
// Variable d'environnement CAPY_GL :
//   gpu (défaut)  → carte graphique ; mesures de FPS fiables, captures rapides
//   swiftshader   → rendu logiciel (ancien comportement de la session cloud, machine sans GPU)
//
// Verrou : un seul navigateur à la fois pour toute l'équipe (remplace tools/shot-lock.sh, qui utilisait `flock`,
// absent de Windows). Le verrou est un fichier dans le dossier temporaire ; il est libéré à la fermeture du navigateur
// ou à la fin du processus, et un verrou abandonné (processus mort) est repris automatiquement.
// CAPY_NOLOCK=1 désactive le verrou.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCK = path.join(os.tmpdir(), 'capy-chromium.lock');

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function acquireLock() {
  if (process.env.CAPY_NOLOCK) return () => {};
  let warned = false;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      let released = false;
      const release = () => { if (released) return; released = true; try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK); } catch {} };
      process.on('exit', release);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0;
      try { pid = +fs.readFileSync(LOCK, 'utf8'); } catch {}
      // verrou d'un processus mort, ou verrou vide / illisible de plus de 5 s (ancien shot-lock.sh) : on le considère libre
      let stale = pid ? !alive(pid) : false;
      if (!pid) { try { stale = Date.now() - fs.statSync(LOCK).mtimeMs > 5000; } catch {} }
      if (stale) { try { fs.unlinkSync(LOCK); } catch {} continue; }
      if (!warned) { console.log(`(attente du verrou ${LOCK} tenu par le processus ${pid})`); warned = true; }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function launchArgs() {
  const mode = (process.env.CAPY_GL || 'gpu').toLowerCase();
  if (mode === 'swiftshader') return ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const angle = process.platform === 'win32' ? 'd3d11' : 'default';
  return ['--use-gl=angle', `--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    // pas de limitation des images en arrière-plan (mesures de FPS)
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
}

/** Lance Chromium (GPU par défaut) sous verrou ; `browser.close()` libère le verrou. */
async function launch(opts = {}) {
  const release = await acquireLock();
  // le mode « headless » complet de Chromium (channel chromium) sait utiliser le GPU, contrairement au headless-shell
  // (en rendu logiciel, on garde le headless-shell par défaut, comme dans la session cloud)
  const soft = (process.env.CAPY_GL || '').toLowerCase() === 'swiftshader';
  // Sous Windows, on prend le Google Chrome installé (channel chrome) : c'est lui que Windows envoie sur la carte dédiée
  // (Graphiques > « Hautes performances ») sur un portable à deux cartes ; le Chromium de Playwright resterait sur la puce intégrée.
  // CAPY_CHANNEL=chromium (ou msedge…) force un autre navigateur.
  const channel = process.env.CAPY_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium');
  const browser = await chromium.launch({ ...(soft ? {} : { channel }), headless: !process.env.CAPY_HEADED, args: launchArgs(), ...opts });
  const close = browser.close.bind(browser);
  browser.close = async () => { try { await close(); } finally { release(); } };
  return browser;
}

/** Nom du moteur de rendu WebGL vu par la page (pour vérifier qu'on est bien sur le GPU). */
async function rendererName(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'inconnu';
  });
}

module.exports = { launch, rendererName };
