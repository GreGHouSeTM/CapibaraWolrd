// Client en ligne de commande du serveur MCP de l'éditeur Unreal (HTTP « streamable »).
// Usage :
//   node mcp.cjs toolsets                         → list_toolsets
//   node mcp.cjs describe <Toolset>               → describe_toolset
//   node mcp.cjs call <Toolset> <outil> '<json>'  → call_tool (arguments en JSON, ou @fichier.json)
//   node mcp.cjs raw <méthode> '<json params>'    → requête JSON-RPC brute (ex. tools/list)
// Variable UE_MCP_URL pour changer l'adresse (défaut http://127.0.0.1:8000/mcp).
const fs = require('fs');
const URL_MCP = process.env.UE_MCP_URL || 'http://127.0.0.1:8000/mcp';
let session = null, id = 0;

async function rpc(method, params, notify = false) {
  const body = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}), ...(notify ? {} : { id: ++id }) };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session) headers['Mcp-Session-Id'] = session;
  const r = await fetch(URL_MCP, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = r.headers.get('mcp-session-id'); if (sid) session = sid;
  if (notify) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} : ${text.slice(0, 500)}`);
  // réponse JSON directe, ou flux SSE dont on garde le message qui porte notre id
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

function arg(s) {
  if (!s) return {};
  if (s.startsWith('@')) return JSON.parse(fs.readFileSync(s.slice(1), 'utf8'));
  return JSON.parse(s);
}

function show(res) {
  // les outils renvoient en général un tableau `content` de blocs texte
  if (res && Array.isArray(res.content)) {
    for (const c of res.content) console.log(c.type === 'text' ? c.text : JSON.stringify(c));
    if (res.isError) process.exitCode = 1;
  } else console.log(JSON.stringify(res, null, 2));
}

(async () => {
  const [cmd, a, b, c] = process.argv.slice(2);
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'capy-preuve', version: '1' } });
  await rpc('notifications/initialized', undefined, true);
  if (cmd === 'toolsets') show(await rpc('tools/call', { name: 'list_toolsets', arguments: {} }));
  else if (cmd === 'describe') show(await rpc('tools/call', { name: 'describe_toolsets', arguments: { toolset_names: [a] } }));
  else if (cmd === 'call') show(await rpc('tools/call', { name: 'call_tool', arguments: { toolset_name: a, tool_name: b, arguments: arg(c) } }));
  else if (cmd === 'raw') show(await rpc(a, arg(b)));
  else { console.log('commandes : toolsets | describe <Toolset> | call <Toolset> <outil> <json> | raw <méthode> <json>'); process.exitCode = 2; }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
