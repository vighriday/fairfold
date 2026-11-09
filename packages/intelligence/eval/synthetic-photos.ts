// Draws the synthetic packing-photo sets described in eval/fixtures/photos/expected.json.
// Run: pnpm photos:synthetic. Replace with real camera photos (and set "synthetic": false) before publishing eval numbers.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type GarmentId = 'G1' | 'G2' | 'G3' | 'G4';
interface Garment {
  sku: string;
  name: string;
  colour: string;
  size: string;
}
interface PhotoSet {
  id: string;
  trackingNumber: string;
  shown: { garment: GarmentId; batchTag: string; defect: string | null };
}
interface Expected {
  garments: Record<GarmentId, Garment>;
  sets: PhotoSet[];
  inspection: { file: string };
}

const W = 1024;
const H = 768;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'photos');

const FILL: Record<string, { base: string; print: string; outline: string }> = {
  navy: { base: '#1f2a4d', print: '#8fa3d1', outline: '#121a33' },
  ochre: { base: '#c98f2b', print: '#7a4f10', outline: '#8a5f17' },
  indigo: { base: '#3b3f8f', print: '#c9c3f0', outline: '#262a63' },
  white: { base: '#f4f3ee', print: '#9fb7c9', outline: '#a9a9a3' },
};

function fill(colour: string) {
  const f = FILL[colour];
  if (!f) throw new Error(`no fill defined for colour ${colour}`);
  return f;
}

/** Shared <defs>: a wooden-table texture and a block-print pattern in the garment's colours. */
function defs(colour: string): string {
  const f = fill(colour);
  return `<defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.35" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.27  0 0 0 0.35 0"/></filter>
    <filter id="weave"><feTurbulence type="turbulence" baseFrequency="0.9" numOctaves="1" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <pattern id="print" width="56" height="56" patternUnits="userSpaceOnUse">
      <rect width="56" height="56" fill="${f.base}"/>
      <circle cx="28" cy="28" r="9" fill="none" stroke="${f.print}" stroke-width="3"/>
      <path d="M28 12 L32 22 L28 19 L24 22 Z M28 44 L32 34 L28 37 L24 34 Z" fill="${f.print}"/>
      <circle cx="0" cy="0" r="4" fill="${f.print}"/><circle cx="56" cy="56" r="4" fill="${f.print}"/>
    </pattern>
  </defs>`;
}

function table(): string {
  return `<rect width="${W}" height="${H}" fill="#cfb68c"/><rect width="${W}" height="${H}" filter="url(#grain)"/>`;
}

function hoodie(colour: string, defect: string | null): string {
  const f = fill(colour);
  const hole =
    defect === 'hole_front'
      ? `<path d="M470 470 l22 -14 l18 10 l6 22 l-14 18 l-26 2 l-14 -16 z" fill="#14100c"/>
       <path d="M468 470 l-10 -8 M492 456 l4 -12 M516 488 l12 2 M504 506 l6 12 M478 508 l-8 10" stroke="${f.print}" stroke-width="2"/>`
      : '';
  return `<g stroke="${f.outline}" stroke-width="4" stroke-linejoin="round">
    <path d="M330 230 L200 300 L150 560 L230 580 L290 380 Z" fill="url(#print)"/>
    <path d="M694 230 L824 300 L874 560 L794 580 L734 380 Z" fill="url(#print)"/>
    <path d="M330 230 Q512 190 694 230 L734 380 L720 640 L304 640 L290 380 Z" fill="url(#print)"/>
    <path d="M420 230 Q512 110 604 230 Q512 270 420 230 Z" fill="${f.base}"/>
    <path d="M400 500 L624 500 L660 610 L364 610 Z" fill="${f.base}" opacity="0.85"/>
    <path d="M490 250 L484 330 M534 250 L540 330" stroke="#e8e2d0" stroke-width="5" fill="none"/>
    <rect x="304" y="625" width="416" height="18" fill="${f.base}"/>
  </g>${hole}`;
}

function tee(colour: string): string {
  const f = fill(colour);
  return `<g stroke="${f.outline}" stroke-width="4" stroke-linejoin="round">
    <path d="M340 220 L220 290 L265 380 L320 350 Z" fill="url(#print)"/>
    <path d="M684 220 L804 290 L759 380 L704 350 Z" fill="url(#print)"/>
    <path d="M340 220 Q512 200 684 220 L704 350 L700 630 L324 630 L320 350 Z" fill="url(#print)"/>
    <path d="M450 214 Q512 270 574 214" fill="none" stroke-width="10"/>
  </g>`;
}

function garmentDrawing(g: Garment, defect: string | null): string {
  return g.sku.startsWith('HD') ? hoodie(g.colour, defect) : tee(g.colour);
}

function fabricBackground(colour: string): string {
  return `<rect width="${W}" height="${H}" fill="url(#print)"/><rect width="${W}" height="${H}" fill="${fill(colour).base}" opacity="0.35"/>
    <rect width="${W}" height="${H}" fill="${fill(colour).base}" filter="url(#weave)"/>`;
}

function itemPhoto(g: Garment, defect: string | null): string {
  return `${table()}${garmentDrawing(g, defect)}`;
}

function sizeLabelPhoto(g: Garment): string {
  return `${fabricBackground(g.colour)}
    <g transform="rotate(-4 512 384)">
      <rect x="352" y="214" width="320" height="340" rx="6" fill="#fbfaf5" stroke="#cfcac0" stroke-width="3"/>
      <rect x="352" y="214" width="320" height="340" rx="6" fill="#000" filter="url(#weave)" opacity="0.5"/>
      <text x="512" y="270" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#333">NEEL BLOCK PRINTS</text>
      <text x="512" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="140" fill="#222">${g.size}</text>
      <text x="512" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#444">100% COTTON</text>
      <text x="512" y="515" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#444">MADE IN INDIA</text>
    </g>`;
}

function batchTagPhoto(g: Garment, tag: string): string {
  return `${fabricBackground(g.colour)}
    <path d="M300 170 Q380 120 440 250" stroke="#f1ede0" stroke-width="5" fill="none"/>
    <g transform="rotate(-9 512 400)">
      <path d="M380 260 L640 260 L700 400 L640 540 L380 540 Z" fill="#e3c98f" stroke="#b39556" stroke-width="3"/>
      <circle cx="660" cy="400" r="14" fill="${fill(g.colour).base}" stroke="#b39556" stroke-width="3"/>
      <text x="420" y="330" font-family="Segoe Print, Comic Sans MS, cursive" font-size="34" fill="#2b2b2b">batch</text>
      <text x="420" y="470" font-family="Segoe Print, Comic Sans MS, cursive" font-size="118" fill="#1d1d1d">${tag}</text>
    </g>`;
}

function barcode(trackingNumber: string): string {
  let x = 330;
  const bars: string[] = [];
  for (const ch of `${trackingNumber}*${trackingNumber}`) {
    const code = ch.charCodeAt(0);
    for (let b = 0; b < 4; b += 1) {
      const w = ((code >> b) & 1) + 2;
      if ((code + b) % 2 === 0)
        bars.push(`<rect x="${x}" y="470" width="${w}" height="70" fill="#111"/>`);
      x += w + 1;
    }
  }
  return bars.join('');
}

function parcelPhoto(trackingNumber: string): string {
  return `${table()}
    <g transform="rotate(3 512 384)">
      <rect x="170" y="110" width="684" height="548" rx="8" fill="#b98a55" stroke="#8a6234" stroke-width="4"/>
      <rect x="170" y="350" width="684" height="64" fill="#d9b886" opacity="0.8"/>
      <rect x="300" y="200" width="430" height="380" fill="#ffffff" stroke="#999" stroke-width="2"/>
      <text x="320" y="240" font-family="Arial, sans-serif" font-size="20" fill="#222">FROM: Neel Block Prints, Jaipur IN</text>
      <text x="320" y="272" font-family="Arial, sans-serif" font-size="20" fill="#222">TO: Customer, Columbus OH, US</text>
      <text x="320" y="320" font-family="Arial, sans-serif" font-weight="bold" font-size="30" fill="#111">EXPRESS PARCEL</text>
      <text x="320" y="370" font-family="Arial, sans-serif" font-size="20" fill="#222">TRACKING NO.</text>
      <text x="320" y="425" font-family="Consolas, Courier New, monospace" font-weight="bold" font-size="44" fill="#111">${trackingNumber}</text>
      ${barcode(trackingNumber)}
    </g>`;
}

function seamCloseup(colour: string): string {
  const f = fill(colour);
  const stitches = Array.from({ length: 30 }, (_, i) => i * 34)
    .filter((x) => x < 380 || x > 600)
    .map((x) => `<rect x="${x}" y="372" width="20" height="6" rx="2" fill="#e9e4d4"/>`)
    .join('');
  return `${fabricBackground(colour)}
    <path d="M0 330 L1024 330 L1024 420 L0 420 Z" fill="${f.base}" opacity="0.6"/>
    ${stitches}
    <path d="M380 360 Q490 330 600 360 L600 396 Q490 430 380 396 Z" fill="#0d0d12"/>
    <path d="M380 375 q30 -40 60 -10 M600 378 q-20 50 -60 30 M470 360 q10 -30 30 -40" stroke="#e9e4d4" stroke-width="3" fill="none"/>`;
}

async function render(svgBody: string, colour: string, outPath: string): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs(colour)}${svgBody}</svg>`;
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(outPath);
}

async function main(): Promise<void> {
  const expected = JSON.parse(readFileSync(join(ROOT, 'expected.json'), 'utf8')) as Expected;
  for (const set of expected.sets) {
    const g = expected.garments[set.shown.garment];
    const dir = join(ROOT, set.id);
    await render(itemPhoto(g, set.shown.defect), g.colour, join(dir, 'item.jpg'));
    await render(sizeLabelPhoto(g), g.colour, join(dir, 'size_label.jpg'));
    await render(batchTagPhoto(g, set.shown.batchTag), g.colour, join(dir, 'batch_label.jpg'));
    await render(parcelPhoto(set.trackingNumber), g.colour, join(dir, 'sealed_parcel.jpg'));
  }
  await render(seamCloseup('navy'), 'navy', join(ROOT, expected.inspection.file));
  process.stdout.write(`wrote ${expected.sets.length * 4 + 1} synthetic photos to ${ROOT}\n`);
}

await main();
