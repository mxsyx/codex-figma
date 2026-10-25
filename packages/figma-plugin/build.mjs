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
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// --- Sandbox bundle (code.ts → dist/code.js) ------------------------------
const codeConfig = {
  absWorkingDir: here,
  entryPoints: [join(here, 'src', 'code.ts')],
  bundle: true,
  outfile: join(dist, 'code.js'),
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  legalComments: 'none',
  write: false,
};

// --- Iframe bundle (ui.ts → inlined into dist/ui.html) -------------------
const uiConfig = {
  absWorkingDir: here,
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
  return finalHtml;
}

/** Fresh in-memory artifacts shared by local development and Codex ZIP packaging. */
export async function buildFigmaPlugin() {
  const [code, html] = await Promise.all([build(codeConfig), buildUi()]);
  return new Map([
    ['dist/code.js', Buffer.from(code.outputFiles[0].contents)],
    ['dist/ui.html', Buffer.from(html)],
  ]);
}

async function main() {
  await mkdir(dist, { recursive: true });
  if (process.argv.includes('--watch')) {
    const codeCtx = await context({ ...codeConfig, write: true });
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
                await writeFile(join(dist, 'ui.html'), await buildUi());
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
    await writeFile(join(dist, 'ui.html'), await buildUi());
  } else {
    for (const [name, bytes] of await buildFigmaPlugin()) await writeFile(join(here, name), bytes);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
