#!/usr/bin/env node
/**
 * Self-test du MCP Mailu : pilote dist/bundle.js en JSON-RPC (stdio) et exerce
 * les outils en lecture puis un cycle CRUD complet sur un domaine jetable.
 *
 * Requiert MAILU_API_URL et MAILU_API_TOKEN dans l'environnement.
 * Usage : MAILU_API_URL=... MAILU_API_TOKEN=... node test/selftest.mjs
 *
 * Le domaine de test (RFC2606 .example, non routable) est cree puis supprime.
 * Cleanup best-effort dans un finally, meme en cas d'echec.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(__dirname, '..', 'dist', 'bundle.js');

const TEST_DOMAIN = 'mcp-selftest.example';
const TEST_USER = `probe@${TEST_DOMAIN}`;
const TEST_ALIAS = `contact@${TEST_DOMAIN}`;
const TEST_PASSWORD = 'Mcp-Selftest-2026!';

if (!process.env.MAILU_API_TOKEN) {
  console.error('ERREUR: MAILU_API_TOKEN manquant dans l\'environnement.');
  process.exit(2);
}

// --- Client JSON-RPC minimal sur stdio ---------------------------------------
// stderr ignore : les erreurs fonctionnelles sont detectees via isError dans les
// reponses JSON-RPC ; on evite le bruit des suppressions best-effort (404 attendus).
const child = spawn('node', [BUNDLE], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'ignore'],
});

let buf = '';
let nextId = 1;
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 20000);
    pending.set(id, (res) => { clearTimeout(timer); resolve(res); });
    child.stdin.write(JSON.stringify(msg) + '\n');
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

/** Appelle un outil ; renvoie {ok, data|error}. */
async function callTool(name, args = {}) {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res?.result?.content?.[0]?.text ?? '';
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res?.result?.isError) return { ok: false, error: data?.error ?? text };
  return { ok: true, data };
}

// --- Micro framework d'assertions --------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  // Handshake MCP
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'selftest', version: '1.0' },
  });
  check('initialize', init?.result?.serverInfo?.name === 'mailu-mcp', JSON.stringify(init?.result?.serverInfo));
  notify('notifications/initialized');

  // tools/list
  const tl = await rpc('tools/list', {});
  const tools = tl?.result?.tools ?? [];
  check('tools/list >= 30 outils', tools.length >= 30, `${tools.length} outils`);
  check('mailu_request present', tools.some((t) => t.name === 'mailu_request'));

  console.log('\n— Lecture —');
  const domains = await callTool('mailu_list_domains');
  check('list_domains ok', domains.ok && Array.isArray(domains.data), domains.error);
  const firstDomain = domains.ok && domains.data[0]?.name;
  check('au moins un domaine present', !!firstDomain, `${domains.data?.length ?? 0} domaine(s)`);

  if (firstDomain) {
    const getDom = await callTool('mailu_get_domain', { domain: firstDomain });
    check(`get_domain (${firstDomain})`, getDom.ok && getDom.data?.name === firstDomain, getDom.error);

    const dusers = await callTool('mailu_list_domain_users', { domain: firstDomain });
    check('list_domain_users', dusers.ok, dusers.error);
  }

  for (const res of ['aliases', 'alternatives', 'relays', 'users']) {
    const r = await callTool(`mailu_list_${res}`);
    check(`list_${res}`, r.ok && Array.isArray(r.data), r.error);
  }

  const generic = await callTool('mailu_request', { method: 'GET', path: '/domain' });
  check('mailu_request GET /domain', generic.ok && Array.isArray(generic.data), generic.error);

  console.log('\n— Cycle CRUD (domaine jetable ' + TEST_DOMAIN + ') —');
  // Best-effort pre-clean si un run precedent a laisse des restes
  await callTool('mailu_delete_alias', { alias: TEST_ALIAS });
  await callTool('mailu_delete_user', { email: TEST_USER });
  await callTool('mailu_delete_domain', { domain: TEST_DOMAIN });

  const cDom = await callTool('mailu_create_domain', { name: TEST_DOMAIN, comment: 'MCP selftest', max_users: 5 });
  check('create_domain', cDom.ok, cDom.error);

  const gDom = await callTool('mailu_get_domain', { domain: TEST_DOMAIN });
  check('get_domain (cree)', gDom.ok && gDom.data?.name === TEST_DOMAIN, gDom.error);

  const uDom = await callTool('mailu_update_domain', { domain: TEST_DOMAIN, comment: 'MCP selftest maj' });
  check('update_domain', uDom.ok, uDom.error);

  const cUser = await callTool('mailu_create_user', { email: TEST_USER, raw_password: TEST_PASSWORD, quota_bytes: 1000000, comment: 'selftest' });
  check('create_user', cUser.ok, cUser.error);

  const gUser = await callTool('mailu_get_user', { email: TEST_USER });
  check('get_user (cree)', gUser.ok && gUser.data?.email === TEST_USER, gUser.error);

  const cAlias = await callTool('mailu_create_alias', { email: TEST_ALIAS, destination: [TEST_USER], comment: 'selftest' });
  check('create_alias', cAlias.ok, cAlias.error);

  const gAlias = await callTool('mailu_get_alias', { alias: TEST_ALIAS });
  check('get_alias (cree)', gAlias.ok && gAlias.data?.email === TEST_ALIAS, gAlias.error);

  const uAlias = await callTool('mailu_update_alias', { alias: TEST_ALIAS, comment: 'selftest maj' });
  check('update_alias', uAlias.ok, uAlias.error);

  // Suppressions
  const dAlias = await callTool('mailu_delete_alias', { alias: TEST_ALIAS });
  check('delete_alias', dAlias.ok, dAlias.error);
  const dUser = await callTool('mailu_delete_user', { email: TEST_USER });
  check('delete_user', dUser.ok, dUser.error);
  const dDom = await callTool('mailu_delete_domain', { domain: TEST_DOMAIN });
  check('delete_domain', dDom.ok, dDom.error);

  // Verif cleanup
  const domainsAfter = await callTool('mailu_list_domains');
  check('cleanup: domaine de test absent', domainsAfter.ok && !domainsAfter.data.some((d) => d.name === TEST_DOMAIN));
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error('\nErreur fatale:', e?.message || e);
  exitCode = 1;
} finally {
  // Cleanup best-effort quoi qu'il arrive
  try {
    await callTool('mailu_delete_alias', { alias: TEST_ALIAS });
    await callTool('mailu_delete_user', { email: TEST_USER });
    await callTool('mailu_delete_domain', { domain: TEST_DOMAIN });
  } catch {}
  child.stdin.end();
  child.kill();
  console.log(`\n\x1b[1mResultat: ${pass} OK, ${fail} echec(s)\x1b[0m`);
  if (failures.length) { console.log('Echecs:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(exitCode || (fail > 0 ? 1 : 0));
}
