/** Resolve the shipped installer; optionally copy it to a user-specified folder. */
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  if (process.argv.length > 3) throw new Error('Usage: node prepare-download.mjs [destination-directory]');
  const source = fileURLToPath(new URL('../../../assets/figma-plugin/', import.meta.url));
  const manifest = JSON.parse(await readFile(new URL('../../../.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  const paths = ['codex-figma-plugin.zip', 'INSTALL.md'].map((name) => join(source, name));
  const bytes = await Promise.all(paths.map((path) => readFile(path)));
  const destination = process.argv[2] ? resolve(process.argv[2]) : null;
  if (destination) {
    await mkdir(destination, { recursive: true });
    // Check every target before copying, so an existing different file is preserved.
    for (const [i, path] of paths.entries()) {
      const target = join(destination, basename(path));
      const existing = await readFile(target).catch((err) => { if (err.code === 'ENOENT') return null; throw err; });
      if (existing && !existing.equals(bytes[i])) throw new Error(`Refusing to overwrite a different file: ${target}. Choose another directory.`);
    }
    for (const [i, path] of paths.entries()) {
      const target = join(destination, basename(path));
      if (target !== path) await copyFile(path, target, constants.COPYFILE_EXCL).catch(async (err) => {
        if (err.code !== 'EEXIST' || !(await readFile(target)).equals(bytes[i])) throw err;
      });
      paths[i] = target;
    }
  }
  console.log(JSON.stringify({ archivePath: paths[0], tutorialPath: paths[1],
    pluginVersion: manifest.version, bytes: bytes[0].length,
    sha256: createHash('sha256').update(bytes[0]).digest('hex'), copied: !!destination }, null, 2));
} catch (err) {
  console.error(`Cannot prepare the Figma plugin download: ${err.message}`);
  process.exitCode = 1;
}
