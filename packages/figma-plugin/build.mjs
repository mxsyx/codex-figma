/**
 * esbuild-based bundler for the Figma plugin.
 *
 * Produces two artefacts in dist/:
 *   - code.js  — sandbox code (figma global access, no DOM)
 *   - ui.html  — iframe UI with ui.ts inlined as a <script>
 *
 * Run with --watch for dev mode.
 */
import { build, context } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const watch = process.argv.includes('--watch');

await mkdir(dist, { recursive: true });

// --- Sandbox bundle (code.ts → dist/code.js) ------------------------------
const codeConfig = {
  entryPoints: [join(here, 'src', 'code.ts')],
  bundle: true,
  outfile: join(dist, 'code.js'),
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  legalComments: 'none',
};

// --- Iframe bundle (ui.ts → inlined into dist/ui.html) -------------------
const uiConfig = {
  entryPoints: [join(here, 'src', 'ui', 'ui.ts')],
  bundle: true,
  target: 'es2017',
  format: 'iife',
  write: false,
  logLevel: 'info',
  legalComments: 'none',
};

async function buildUi() {
  const result = await build(uiConfig);
  const uiJs = result.outputFiles[0].text;
  const template = await readFile(join(here, 'src', 'ui', 'ui.html'), 'utf-8');
  const finalHtml = template.replace(
    '<!-- {{UI_JS}} -->',
    `<script>(function(){${uiJs}})();</script>`,
  );
  await writeFile(join(dist, 'ui.html'), finalHtml);
}

if (watch) {
  const codeCtx = await context(codeConfig);
  await codeCtx.watch();
  // For the UI, esbuild doesn't have a built-in "inline into HTML" step, so
  // we rebuild it on every change by polling the watch context's events.
  const uiCtx = await context({
    ...uiConfig,
    plugins: [
      {
        name: 'inline-ui-html',
        setup(b) {
          b.onEnd(async () => {
            try {
              await buildUi();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[ui inline]', err);
            }
          });
        },
      },
    ],
  });
  await uiCtx.watch();
  // Build once upfront so a fresh `--watch` start has the HTML ready.
  await buildUi();
} else {
  await build(codeConfig);
  await buildUi();
}
