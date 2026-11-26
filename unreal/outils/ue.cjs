// Client de l’agent unreal-monde (repris de la preuve), complète mcp.cjs (du producteur).
// node ue.cjs py <fichier.py>             → exécute un script Python dans l'éditeur (execute_python)
// node ue.cjs tool <Toolset.Outil> '<json>'|@f → call_tool
// node ue.cjs desc <Toolset> [...]         → describe_toolsets (avec schémas)
// node ue.cjs tools <Toolset.Outil> [...]  → describe_tools
// Réessaie automatiquement si l'éditeur est occupé (« slow task »).
const fs = require('fs');
const URL_MCP = process.env.UE_MCP_URL || 'http://127.0.0.1:8000/mcp';
let session = null, id = 0;
const PY = 'editor_toolset.toolsets.python_scripting.PythonScriptingTools';

async function rpc(method, params, notify = false) {
  const body = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}), ...(notify ? {} : { id: ++id }) };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session) headers['Mcp-Session-Id'] = session;
  const r = await fetch(URL_MCP, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = r.headers.get('mcp-session-id'); if (sid) session = sid;
  if (notify) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${text.slice(0, 800)}`);
  let msg = null;
  if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try { const m = JSON.parse(line.slice(5)); if (m.id === body.id) msg = m; } catch {}
    }
  } else msg = JSON.parse(text);
  if (!msg) throw new Error('réponse vide : ' + text.slice(0, 500));
  if (msg.error) throw new Error('erreur MCP : ' + JSON.stringify(msg.error));
  return msg.result;
}

function show(res) {
  if (res && Array.isArray(res.content)) {
    for (const c of res.content) {
      if (c.type !== 'text') { console.log(JSON.stringify(c)); continue; }
      let t = c.text;
      try { const j = JSON.parse(t); if (j && typeof j.returnValue === 'string') t = j.returnValue; } catch {}
      console.log(t);
    }
    if (res.isError) process.exitCode = 1;
  } else console.log(JSON.stringify(res, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, args) {
  for (let k = 0; k < 20; k++) {
    try {
      const res = await rpc('tools/call', { name, arguments: args });
      const txt = JSON.stringify(res);
      if (/slow task/i.test(txt) && k < 19) { console.error('éditeur occupé, nouvel essai dans 30 s'); await sleep(30000); continue; }
      return res;
    } catch (e) {
      if (/slow task/i.test(e.message) && k < 19) { console.error('éditeur occupé, nouvel essai dans 30 s'); await sleep(30000); continue; }
      throw e;
    }
  }
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'capy-u1-agent', version: '1' } });
  await rpc('notifications/initialized', undefined, true);
  if (cmd === 'py') {
    let src = fs.readFileSync(rest[0], 'utf8').replace(/^﻿/, '');
    // arguments optionnels : ARGS = [...] injecté en tête du script
    if (rest.length > 1) src = 'ARGS = ' + JSON.stringify(rest.slice(1)) + '\n' + src;
    show(await call('call_tool', { toolset_name: PY, tool_name: 'execute_python', arguments: { script: { content: src, language: 'Python' } } }));
  } else if (cmd === 'tool') {
    const i = rest[0].lastIndexOf('.');
    const a = rest[1] ? (rest[1].startsWith('@') ? JSON.parse(fs.readFileSync(rest[1].slice(1), 'utf8')) : JSON.parse(rest[1])) : {};
    show(await call('call_tool', { toolset_name: rest[0].slice(0, i), tool_name: rest[0].slice(i + 1), arguments: a }));
  } else if (cmd === 'desc') show(await call('describe_toolsets', { toolset_names: rest, include_schemas: true }));
  else if (cmd === 'tools') show(await call('describe_tools', { tool_names: rest }));
  else { console.log('commandes : py <f> | tool <T.O> <json> | desc <T> | tools <T.O>'); process.exitCode = 2; }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
