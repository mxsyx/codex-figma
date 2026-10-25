import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const hook = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const bridge = fileURLToPath(new URL('../runtime/bridge.mjs', import.meta.url));

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'figma hook test '));
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const pidsFile = join(root, 'pids');
  const entry = join(root, 'bridge entry.mjs');
  await writeFile(entry, `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(pidsFile)}, process.pid + '\\n');
await import(${JSON.stringify(pathToFileURL(bridge).href)});
`);
  const env = { ...process.env, CODEX_FIGMA_BRIDGE_ENTRY: entry,
    CODEX_FIGMA_BRIDGE_LOG_DIR: join(root, 'logs'), CODEX_FIGMA_BRIDGE_PORT: String(port),
    CODEX_FIGMA_BRIDGE_HOST: '127.0.0.1', PLUGIN_DATA: join(root, 'plugin data') };
  t.after(async () => {
    const pids = (await readFile(pidsFile, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(Number);
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    for (let i = 0; i < 60; i++) {
      const alive = pids.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
      if (!alive.length) break;
      await delay(100);
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, env, port, pidsFile };
}

function runHook(f, script = hook, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: f.root, env: { ...f.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 18_000,
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.stdin.end(JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: f.root }));
  });
}

function success(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

test('starts a detached bridge from an unrelated cwd and reuses it across sessions', async (t) => {
  const f = await fixture(t);
  success(await runHook(f));
  const before = await readFile(f.pidsFile, 'utf8');
  const health = await (await fetch(`http://127.0.0.1:${f.port}/health`)).json();
  assert.equal(health.service, 'codex-figma-bridge');
  success(await runHook(f));
  assert.equal(await readFile(f.pidsFile, 'utf8'), before, 'reuse must not spawn a process');
  // The hook has exited; the background service is still available.
  assert.equal((await fetch(`http://127.0.0.1:${f.port}/health`)).status, 200);
});

test('simultaneous sessions converge on one listening bridge', async (t) => {
  const f = await fixture(t);
  for (const result of await Promise.all(Array.from({ length: 6 }, () => runHook(f)))) success(result);
  const rows = (await readFile(join(f.env.CODEX_FIGMA_BRIDGE_LOG_DIR, 'bridge.log'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter((row) => row.msg === 'bridge listening').length, 1);
  const before = await readFile(f.pidsFile, 'utf8');
  success(await runHook(f));
  assert.equal(await readFile(f.pidsFile, 'utf8'), before);
  await delay(100);
  const alive = before.trim().split('\n').map(Number).filter((pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  });
  assert.equal(alive.length, 1, 'losing startup processes must exit');
});

test('starts again after the shared bridge stops', async (t) => {
  const f = await fixture(t);
  success(await runHook(f));
  const pid = Number((await readFile(f.pidsFile, 'utf8')).trim());
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 60; i++) {
    try { process.kill(pid, 0); } catch { break; }
    await delay(100);
  }
  success(await runHook(f));
  assert.equal((await readFile(f.pidsFile, 'utf8')).trim().split('\n').length, 2);
});

test('does not launch or terminate anything when the port belongs to another service', async (t) => {
  const f = await fixture(t);
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
  f.env.CODEX_FIGMA_BRIDGE_PORT = String(await listen(server));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await runHook(f);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /another service or an outdated bridge/);
  await assert.rejects(readFile(f.pidsFile), { code: 'ENOENT' });
  assert.equal((await fetch(`http://127.0.0.1:${f.env.CODEX_FIGMA_BRIDGE_PORT}/health`)).status, 200);
});

test('isolated plugin starts its bundled bridge without npm, node_modules, sibling source or global bridge', async (t) => {
  const f = await fixture(t);
  const installed = join(f.root, 'installed plugin');
  const manifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
  for (const path of [...manifest.files, 'package.json']) {
    await cp(join(pluginRoot, path), join(installed, path), { recursive: true });
  }
  const installedHook = join(installed, 'hooks/session-start.mjs');
  const installedBridge = join(installed, 'runtime/bridge.mjs');
  assert.ok(!(await readdir(installed)).includes('node_modules'));
  const tracer = join(f.root, 'trace.mjs');
  await writeFile(tracer, `import { appendFileSync } from 'node:fs';
if (process.argv[1] === ${JSON.stringify(installedBridge)}) appendFileSync(${JSON.stringify(f.pidsFile)}, process.pid + '\\n');
`);
  // Poison the old global fallback; it must never be invoked.
  const bin = join(f.root, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'codex-figma-bridge'), `#!${process.execPath}\nprocess.exit(99);`, { mode: 0o755 });
  const extra = { CODEX_FIGMA_BRIDGE_ENTRY: '', PATH: bin, NODE_PATH: '', NODE_OPTIONS: `--import ${pathToFileURL(tracer).href}` };
  success(await runHook(f, installedHook, extra));
  const before = await readFile(f.pidsFile, 'utf8');
  assert.equal(before.trim().split('\n').length, 1);
  success(await runHook(f, installedHook, extra));
  assert.equal(await readFile(f.pidsFile, 'utf8'), before);
  const health = await (await fetch(`http://127.0.0.1:${f.port}/health`)).json();
  assert.equal(health.mode, 'live-name-query');
  const pkg = JSON.parse(await readFile(new URL('../../bridge/package.json', import.meta.url), 'utf8'));
  assert.equal(health.version, pkg.version, 'bundled version must not depend on a checkout manifest');

  // Exercise bundled SDK/validation dependencies through HTTP, beyond a health probe.
  const rpc = async (body, session) => {
    const response = await fetch(`http://127.0.0.1:${f.port}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        ...(session ? { 'Mcp-Session-Id': session } : {}) }, body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = text.startsWith('event:') ? JSON.parse(text.match(/^data: (.+)$/m)[1]) : text ? JSON.parse(text) : null;
    assert.equal(response.ok, true, text);
    return { data, session: response.headers.get('mcp-session-id') };
  };
  const initialized = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'isolated-test', version: '1' },
  } });
  const session = initialized.session;
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, session);
  assert.ok(listed.data.result.tools.some((tool) => tool.name === 'resolve_node'));
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'resolve_node', arguments: { nodeName: '登录页' } } }, session);
  assert.equal(call.data.result.isError, true);
  assert.match(call.data.result.content[0].text, /not connected/);
  await fetch(`http://127.0.0.1:${f.port}/mcp`, { method: 'DELETE', headers: { 'Mcp-Session-Id': session } });
});

test('refuses an old bridge protocol without spawning or terminating a process', async (t) => {
  const f = await fixture(t);
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'codex-figma-bridge', selectionCount: 1 }));
  });
  f.env.CODEX_FIGMA_BRIDGE_PORT = String(await listen(server));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await runHook(f);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /outdated bridge/);
  await assert.rejects(readFile(f.pidsFile), { code: 'ENOENT' });
  assert.equal((await fetch(`http://127.0.0.1:${f.env.CODEX_FIGMA_BRIDGE_PORT}/health`)).status, 200);
});

test('missing bundle and invalid overrides fail without using a global fallback', async (t) => {
  const f = await fixture(t);
  const installedHook = join(f.root, 'session-start.mjs');
  await copyFile(hook, installedHook);
  const missing = await runHook(f, installedHook, { CODEX_FIGMA_BRIDGE_ENTRY: '', PATH: f.root });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /missing runtime\/bridge.mjs/);
  assert.match(missing.stderr, /Reinstall the complete/);
  const invalid = await runHook(f, hook, { CODEX_FIGMA_BRIDGE_ENTRY: 'relative.mjs' });
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /existing absolute path/);
});

test('failed startup times out without a lingering child', async (t) => {
  const f = await fixture(t);
  await writeFile(f.env.CODEX_FIGMA_BRIDGE_ENTRY, `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(f.pidsFile)}, String(process.pid));
setInterval(() => {}, 1000);
`);
  const result = await runHook(f);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /did not become ready/);
  assert.match(result.stderr, /startup.log/);
  await delay(100);
  const pid = Number(await readFile(f.pidsFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('invalid port does not start a bridge', async (t) => {
  const f = await fixture(t);
  const result = await runHook(f, hook, { CODEX_FIGMA_BRIDGE_PORT: '11111oops' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid CODEX_FIGMA_BRIDGE_PORT/);
  await assert.rejects(readFile(f.pidsFile), { code: 'ENOENT' });
});
