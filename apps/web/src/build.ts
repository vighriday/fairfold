import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { landingView, productImages, productThumb } from './products.js';

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
  let landing = (await readFile(new URL('standalone/Fairfold.html', root), 'utf8'))
    .replaceAll('Fairfold%20Console.html', '/console/orders')
    .replaceAll('"assets/', '"/assets/');
  const bind = (from: string, to: string, what: string) => {
    if (!landing.includes(from)) throw new Error(`Design binding missing: landing ${what}`);
    landing = landing.replace(from, to);
  };
  const illustrated = (label: string) => `" role="img" aria-label="Illustration: ${label}`;
  bind(
    'width:56px;height:56px;flex:none;border-radius:12px;background:repeating-linear-gradient(135deg,rgba(21,19,29,.1) 0 5px,rgba(21,19,29,.03) 5px 10px)',
    `width:56px;height:56px;flex:none;border-radius:12px;background:${productThumb('HD-IND-01')}${illustrated('Block-print cotton hoodie')}`,
    'product thumbnail',
  );
  // The three evidence cards that rise out of the 3D parcel: item, size label, batch label.
  const card =
    'flex:1;border-radius:3px;background:repeating-linear-gradient(135deg,rgba(21,19,29,.14) 0 4px,rgba(21,19,29,.04) 4px 8px)';
  for (const [view, label] of [
    ['item', 'hoodie, whole item'],
    ['size', 'hoodie neck and size area'],
    ['batch', 'hoodie woven batch label'],
  ] as const)
    bind(
      card,
      `flex:1;border-radius:3px;background:${landingView(view)}${illustrated(label)}`,
      'parcel card',
    );
  // The Pack Station preview tiles: item, size_label, batch_label, sealed_parcel.
  const tile =
    'aspect-ratio:1;border-radius:10px;background:repeating-linear-gradient(135deg,rgba(21,19,29,.1) 0 5px,rgba(21,19,29,.03) 5px 10px)';
  for (const [view, label] of [
    ['item', 'hoodie, whole item'],
    ['size', 'hoodie neck and size area'],
    ['batch', 'hoodie woven batch label'],
    ['parcel', 'sealed parcel'],
  ] as const)
    bind(
      tile,
      `aspect-ratio:1;border-radius:10px;background:${landingView(view)}${illustrated(label)}`,
      'pack tile',
    );
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
