import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../../../', import.meta.url);
export const webDist = new URL('../dist/', import.meta.url);
export async function buildWebsite() {
  await mkdir(new URL('assets/', webDist), { recursive: true });
  for (const asset of ['fonts.css', 'threads.js', 'landing.js', 'dc-lite.js'])
    await copyFile(
      new URL(`standalone/assets/${asset}`, root),
      new URL(`assets/${asset}`, webDist),
    );
  const landing = (await readFile(new URL('standalone/Fairfold.html', root), 'utf8'))
    .replaceAll('Fairfold%20Console.html', '/console/orders')
    .replaceAll('"assets/', '"/assets/');
  await writeFile(new URL('index.html', webDist), landing);
  const template = await readFile(new URL('standalone/Fairfold Console.html', root), 'utf8');
  const { bindTemplate } = await import('./template.js');
  await writeFile(new URL('console.html', webDist), bindTemplate(template));
  await build({
    entryPoints: [fileURLToPath(new URL('./console.ts', import.meta.url))],
    outfile: fileURLToPath(new URL('assets/site.js', webDist)),
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    minify: true,
    sourcemap: false,
  });
}
