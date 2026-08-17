#!/usr/bin/env node
// Entry point for the `codex-figma-bridge` bin.
// Runs the compiled output if present, otherwise falls back to tsx so the
// package is usable straight from a checkout without a build step.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, '..', 'dist', 'index.js');
const source = join(here, '..', 'src', 'index.ts');

if (existsSync(compiled)) {
  // Spawn compiled JS in a child process so this .mjs shim stays tiny.
  const child = spawn(process.execPath, [compiled, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  // No build artefact yet — run via tsx so `npm start` works in dev.
  const tsx = spawn(process.execPath, ['--import', 'tsx', source, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  tsx.on('exit', (code) => process.exit(code ?? 0));
}
