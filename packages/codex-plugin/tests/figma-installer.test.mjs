import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { buildFigmaPlugin } from '../../figma-plugin/build.mjs';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const installer = join(plugin, 'assets/figma-plugin');
const scriptName = 'skills/figma-install-plugin/scripts/prepare-download.mjs';

async function isolatedPlugin(t) {
  const root = await mkdtemp(join(tmpdir(), 'figma installer '));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['.codex-plugin', 'assets/figma-plugin', 'skills/figma-install-plugin']) {
    await cp(join(plugin, path), join(root, 'plugin', path), { recursive: true });
  }
  const script = join(root, 'plugin', scriptName);
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: root, env: { ...process.env, PATH: '', NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8',
  }));
  return { root, script, run };
}

test('ZIP contains a complete importable plugin built from current source', async () => {
  const files = unzipSync(await readFile(join(installer, 'codex-figma-plugin.zip')));
  const prefix = 'codex-figma-plugin/';
  assert.deepEqual(Object.keys(files).sort(), ['INSTALL.md', 'LICENSE', 'VERSION.txt', 'dist/code.js', 'dist/ui.html', 'manifest.json'].map((n) => prefix + n).sort());
  const manifest = JSON.parse(Buffer.from(files[prefix + 'manifest.json']));
  assert.deepEqual(manifest, JSON.parse(await readFile(new URL('../../figma-plugin/manifest.json', import.meta.url))));
  for (const path of [manifest.main, manifest.ui]) assert.ok(files[prefix + path]?.length);
  for (const [path, bytes] of await buildFigmaPlugin()) assert.deepEqual(Buffer.from(files[prefix + path]), bytes);
  const html = Buffer.from(files[prefix + manifest.ui]).toString();
  assert.ok(!html.includes('<!-- {{UI_JS}} -->'), 'UI bundle must be inlined');
  new Script(Buffer.from(files[prefix + manifest.main]).toString());
  new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  assert.deepEqual(Buffer.from(files[prefix + 'INSTALL.md']), await readFile(join(installer, 'INSTALL.md')));
});

test('shipped ZIP is reproducible across working directories and timezones', () => {
  execFileSync(process.execPath, [join(plugin, 'build.mjs'), '--check'], {
    cwd: tmpdir(), env: { ...process.env, TZ: 'Pacific/Honolulu' }, stdio: 'pipe',
  });
});

test('installed skill resolves the real ZIP without a repository, dependencies or connected Bridge', async (t) => {
  const { root, run } = await isolatedPlugin(t);
  const result = run();
  assert.equal(result.archivePath, join(root, 'plugin/assets/figma-plugin/codex-figma-plugin.zip'));
  const bytes = await readFile(result.archivePath);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.copied, false);
  assert.ok(await readFile(result.tutorialPath));
  assert.deepEqual(await readdir(root), ['plugin'], 'delivery without a destination must not create user files');
});

test('explicit save folder supports spaces and repeated identical copies', async (t) => {
  const { root, run } = await isolatedPlugin(t);
  const folder = join(root, 'User chosen folder', 'Figma 插件');
  const result = run(folder);
  assert.equal(result.archivePath, join(folder, 'codex-figma-plugin.zip'));
  assert.equal(result.tutorialPath, join(folder, 'INSTALL.md'));
  assert.equal(result.copied, true);
  assert.deepEqual(await readFile(result.archivePath), await readFile(join(installer, 'codex-figma-plugin.zip')));
  assert.deepEqual(run(folder), result);
});

test('saving preserves different existing files and does not partially copy the archive', async (t) => {
  const { root, script } = await isolatedPlugin(t);
  const folder = join(root, 'User folder');
  await cp(join(installer, 'INSTALL.md'), join(folder, 'INSTALL.md'), { recursive: true });
  await writeFile(join(folder, 'INSTALL.md'), 'User notes');
  const result = spawnSync(process.execPath, [script, folder], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.equal(await readFile(join(folder, 'INSTALL.md'), 'utf8'), 'User notes');
  assert.deepEqual(await readdir(folder), ['INSTALL.md']);
});

test('incomplete installed package reports failure instead of inventing a download link', async (t) => {
  const { root, script } = await isolatedPlugin(t);
  await rm(join(root, 'plugin/assets/figma-plugin/codex-figma-plugin.zip'));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Cannot prepare the Figma plugin download/);
});
