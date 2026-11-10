// Evidence PDF (section 10 / I5) with pdf-lib: cover and timeline, packing photos with SHA-256 and server time,
// the attestation table, the ledger check, the listing text, the return policy and any buyer photos.
// Kept under 10 MB by downscaling embedded photos when needed.
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Money } from '@fairfold/contracts';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PAGE: [number, number] = [595.28, 841.89]; // A4 in points
const MARGIN = 48;

export interface EvidencePdfData {
  dispute: { id: string; reason: string; status: string; amount: Money };
  order: {
    id: string;
    invoiceId: string;
    capturedAt: Date | null;
    sealedAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  } | null;
  timeline: Array<{ seq: number; type: string; serverTime: Date; actor: string }>;
  packingPhotos: Array<{
    sha256: string;
    label: string;
    serverTime: Date | null;
    bytes: Uint8Array;
    /** Evidence-integrity flags (EXIF time gap, the same photo on another order), shown in the caption. */
    flags: string[];
  }>;
  buyerPhotos: Array<{ sha256: string; bytes: Uint8Array }>;
  /** The Evidence Agent's check of the buyer's photos against the order (step buyer_photo), in words. */
  buyerPhotoCheck: string | null;
  attestation: {
    status: string;
    confidence: number;
    model: string;
    batchLabelText: string | null;
    trackingNumberText: string | null;
    items: Array<{ name: string; expected: string; seen: string; matches: boolean }>;
    defects: string[];
  } | null;
  ledger: { verified: boolean; brokenAtSeq: number | null; entries: number };
  listing: { name: string; sku: string; description: string } | null;
  returnPolicyUrl: string | null;
  shipment: { carrier: string; trackingNumber: string; status: string } | null;
}

const REPLACEMENTS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '→': '->',
  '×': 'x',
  '₹': 'INR ',
  '€': 'EUR ',
};

/** The standard fonts only encode WinAnsi; anything else is replaced so a stray character never breaks the PDF. */
export function pdfSafe(text: string): string {
  return [...text]
    .map((ch) => REPLACEMENTS[ch] ?? (/[\x20-\x7e\xa0-\xff]/.test(ch) ? ch : '?'))
    .join('');
}

const iso = (d: Date | null) => (d ? d.toISOString().replace('.000Z', 'Z') : '-');

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
  }
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }
  text(value: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const width = PAGE[0] - 2 * MARGIN;
    for (const line of wrap(pdfSafe(value), font, size, width)) {
      this.ensure(size + 4);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 2;
  }
  heading(value: string) {
    this.y -= 6;
    this.text(value, { size: 13, bold: true, gap: 4 });
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
    }
    lines.push(line);
  }
  return lines;
}

async function shrink(bytes: Uint8Array, maxSide: number, quality: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp(bytes)
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer(),
  );
}

async function drawPhoto(w: Writer, bytes: Uint8Array, caption: string[]) {
  const image = await w.doc.embedJpg(bytes);
  const maxW = PAGE[0] - 2 * MARGIN;
  const maxH = 300;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  w.ensure(height + 14 * caption.length + 10);
  w.page.drawImage(image, { x: MARGIN, y: w.y - height, width, height });
  w.y -= height + 6;
  for (const line of caption) w.text(line, { size: 8 });
  w.y -= 6;
}

async function render(data: EvidencePdfData, photoSide: number | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Fairfold evidence for dispute ${data.dispute.id}`));
  doc.setProducer('Fairfold');
  const w = new Writer(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );
  const photo = async (bytes: Uint8Array) =>
    photoSide ? shrink(bytes, photoSide, 70) : shrink(bytes, 2048, 85);

  w.text('Fairfold evidence pack', { size: 18, bold: true, gap: 8 });
  w.text(`Dispute ${data.dispute.id} - ${data.dispute.reason} - status ${data.dispute.status}`);
  w.text(`Amount: ${data.dispute.amount.currency_code} ${data.dispute.amount.value}`);
  if (data.order) {
    w.text(`Order ${data.order.invoiceId} (${data.order.id})`);
    w.text(
      `Paid ${iso(data.order.capturedAt)}; sealed ${iso(data.order.sealedAt)}; shipped ${iso(data.order.shippedAt)}; delivered ${iso(data.order.deliveredAt)}`,
    );
  }
  if (data.shipment)
    w.text(
      `Shipment: ${data.shipment.carrier} ${data.shipment.trackingNumber} (${data.shipment.status})`,
    );

  w.heading('Timeline (from the order ledger)');
  for (const e of data.timeline)
    w.text(`#${e.seq}  ${iso(e.serverTime)}  ${e.type}  by ${e.actor}`, { size: 9 });

  w.heading('Ledger check');
  w.text(
    data.ledger.verified
      ? `All ${data.ledger.entries} entries verify: each entry's SHA-256 hash includes the previous one.`
      : `The hash chain breaks at entry ${data.ledger.brokenAtSeq ?? '?'} of ${data.ledger.entries}.`,
  );

  w.heading('Packing check (Evidence Agent)');
  if (data.attestation) {
    const a = data.attestation;
    w.text(`Result: ${a.status} - confidence ${a.confidence.toFixed(2)} - model ${a.model}`);
    w.text(
      `Batch label read: ${a.batchLabelText ?? '-'}; tracking label read: ${a.trackingNumberText ?? '-'}`,
    );
    for (const item of a.items)
      w.text(
        `${item.matches ? 'MATCH' : 'NO MATCH'}  ${item.name}: expected ${item.expected}; seen ${item.seen}`,
        { size: 9 },
      );
    for (const d of a.defects) w.text(`Defect seen: ${d}`, { size: 9 });
  } else {
    w.text('No packing check was recorded for this order.');
  }

  if (data.listing) {
    w.heading('Listing as sold');
    w.text(`${data.listing.name} (${data.listing.sku})`, { bold: true });
    w.text(data.listing.description);
  }
  if (data.returnPolicyUrl) {
    w.heading('Return policy');
    w.text(data.returnPolicyUrl);
  }

  if (data.packingPhotos.length) {
    w.newPage();
    w.heading('Packing photos');
    for (const p of data.packingPhotos)
      await drawPhoto(w, await photo(p.bytes), [
        `${p.label} - SHA-256 ${p.sha256}`,
        `Server time ${iso(p.serverTime)}${p.flags.length ? ` - FLAG: ${p.flags.join('; ')}` : ''}`,
      ]);
  }
  if (data.buyerPhotos.length) {
    w.heading("Buyer's photos (for comparison)");
    if (data.buyerPhotoCheck) w.text(data.buyerPhotoCheck);
    for (const p of data.buyerPhotos)
      await drawPhoto(w, await photo(p.bytes), [`SHA-256 ${p.sha256}`]);
  }
  return doc.save();
}

export async function buildEvidencePdf(data: EvidencePdfData): Promise<Uint8Array> {
  for (const side of [null, 1280, 800, 480]) {
    const bytes = await render(data, side);
    if (bytes.length < MAX_PDF_BYTES) return bytes;
  }
  throw new Error('PDF_TOO_LARGE: the evidence PDF stays above 10 MB even with small photos');
}
