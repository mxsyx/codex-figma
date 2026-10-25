#!/usr/bin/env node
// Entry point for the `codex-figma-bridge` bin.
// Runs the compiled output if present, otherwise falls back to tsx so the
// package is usable straight from a checkout without a build step.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '..', 'dist', 'index.js');
const source = join(here, '..', 'src', 'index.ts');

if (existsSync(compiled)) {
  // Keep one process so a background bridge receives shutdown signals directly.
  await import(pathToFileURL(compiled).href);
} else {
  // No build artefact yet — run via tsx so `npm start` works in dev.
  const loader = createRequire(import.meta.url).resolve('tsx');
  const tsx = spawn(process.execPath, ['--import', pathToFileURL(loader).href, source, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => tsx.kill(signal));
  }
  tsx.on('error', (err) => { console.error(err); process.exitCode = 1; });
  tsx.on('exit', (code) => process.exit(code ?? 1));
}
