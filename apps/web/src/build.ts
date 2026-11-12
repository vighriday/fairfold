import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { productImages, productThumb } from './products.js';

const root = new URL('../../../', import.meta.url);
export const webDist = new URL('../dist/', import.meta.url);
export async function buildWebsite() {
  await mkdir(new URL('assets/', webDist), { recursive: true });
  for (const asset of ['fonts.css', 'threads.js', 'landing.js', 'dc-lite.js'])
    await copyFile(
      new URL(`standalone/assets/${asset}`, root),
      new URL(`assets/${asset}`, webDist),
    );
  // Illustrations of the fictional catalogue products (drawn artwork, never packing evidence).
  for (const image of productImages)
    await copyFile(
      new URL(`./products/${image}`, import.meta.url),
      new URL(`assets/${image}`, webDist),
    );
  const landing = (await readFile(new URL('standalone/Fairfold.html', root), 'utf8'))
    .replaceAll('Fairfold%20Console.html', '/console/orders')
    .replaceAll('"assets/', '"/assets/');
  const placeholder =
    'width:56px;height:56px;flex:none;border-radius:12px;background:repeating-linear-gradient(135deg,rgba(21,19,29,.1) 0 5px,rgba(21,19,29,.03) 5px 10px)';
  if (!landing.includes(placeholder))
    throw new Error('Design binding missing: landing product thumbnail');
  await writeFile(
    new URL('index.html', webDist),
    landing.replace(
      placeholder,
      `width:56px;height:56px;flex:none;border-radius:12px;background:${productThumb('HD-IND-01')}" role="img" aria-label="Illustration of the Block-print cotton hoodie`,
    ),
  );
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
