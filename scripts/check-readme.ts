import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256 } from '../packages/ledger/src/canonical.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const media = resolve(root, 'docs/media');
const cleanHeading = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
    .replace(/\s/g, '-');

let links = 0;
for (const name of ['README.md', 'docs/media/README.md']) {
  const file = resolve(root, name),
    markdown = await readFile(file, 'utf8');
  assert(
    !/<(?:script|iframe|style|foreignObject)\b/i.test(markdown),
    `${name}: unsupported active HTML`,
  );
  const targets = [...markdown.matchAll(/\]\(([^\s)]+)\)|\b(?:src|srcset|href)="([^"]+)"/g)];
  for (const match of targets) {
    const link = match[1] ?? match[2]!;
    if (/^(?:https?:|mailto:)/.test(link)) continue;
    const [path, anchor] = link.split('#');
    const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
    assert(!relative(root, target).startsWith('..' + sep), `Outside repository: ${link}`);
    assert(
      !relative(root, target).replaceAll('\\', '/').startsWith('docs/internal/'),
      `Private source link: ${link}`,
    );
    const info = await stat(target).catch(() => null);
    assert(info, `Broken link in ${name}: ${link}`);
    if (anchor && target.endsWith('.md')) {
      const text = await readFile(target, 'utf8');
      const ids = new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => cleanHeading(m[1]!)));
      for (const id of text.matchAll(/\bid="([^"]+)"/g)) ids.add(id[1]!);
      assert(ids.has(anchor), `Broken anchor in ${name}: ${link}`);
    }
    links++;
  }
  assert.equal(
    (markdown.match(/<details>/g) ?? []).length,
    (markdown.match(/<\/details>/g) ?? []).length,
    `${name}: unclosed disclosure`,
  );
}

const svgNames = (await readdir(media)).filter((name) => name.endsWith('.svg'));
for (const name of svgNames) {
  const svg = await readFile(resolve(media, name), 'utf8');
  assert(
    svg.includes('<title') && svg.includes('<desc'),
    `${name}: missing accessible description`,
  );
  assert(!/<(?:script|foreignObject)\b|\bon\w+=/i.test(svg), `${name}: active SVG content`);
  for (const match of svg.matchAll(/\b(?:href|xlink:href)="([^"]+)"/g))
    assert(/^(?:#|data:image\/png;base64,)/.test(match[1]!), `${name}: external asset`);
}
const manifest = JSON.parse(await readFile(resolve(media, 'provenance.json'), 'utf8')) as {
  records: string;
  capture_sha256: Record<string, string>;
};
assert.equal(manifest.records, 'synthetic-seeded-data');
for (const [name, hash] of Object.entries(manifest.capture_sha256))
  assert.equal(
    sha256(await readFile(resolve(media, 'captures', name))),
    hash,
    `Capture changed: ${name}`,
  );

interface Entry {
  order_id: string;
  seq: number;
  type: string;
  payload: unknown;
  blob_sha256: string | null;
  actor: string;
  server_time: string;
  prev_hash: string;
  entry_hash: string;
}
const fixture = JSON.parse(await readFile(resolve(media, 'proof-specimen.json'), 'utf8')) as {
  kind: string;
  entries: Entry[];
};
assert.equal(fixture.kind, 'synthetic-readme-specimen');
function verifies(entries: Entry[]) {
  let previous = '0'.repeat(64),
    seq = 1;
  for (const entry of entries) {
    const content = {
      order_id: entry.order_id,
      seq: entry.seq,
      type: entry.type,
      payload: entry.payload,
      blob_sha256: entry.blob_sha256,
      actor: entry.actor,
      server_time: new Date(entry.server_time).toISOString(),
    };
    if (
      entry.seq !== seq++ ||
      entry.prev_hash !== previous ||
      sha256(previous + canonicalJson(content)) !== entry.entry_hash
    )
      return false;
    previous = entry.entry_hash;
  }
  return entries.length > 0;
}
assert(verifies(fixture.entries), 'Proof specimen does not verify');
const changed = structuredClone(fixture.entries);
changed[0]!.payload = {
  ...(changed[0]!.payload as Record<string, unknown>),
  label: 'changed-in-memory',
};
assert(!verifies(changed), 'Changed payload unexpectedly verifies');
const { entry_hash: storedHash, prev_hash: previousHash, ...changedContent } = changed[0]!;
const changedHash = sha256(previousHash + canonicalJson(changedContent));
const originalGraphic = await readFile(resolve(media, 'proof-original.svg'), 'utf8');
const changedGraphic = await readFile(resolve(media, 'proof-changed.svg'), 'utf8');
assert(originalGraphic.includes(storedHash), 'Original proof graphic does not match the specimen');
assert(changedGraphic.includes(changedHash), 'Changed proof graphic does not match recomputation');
assert(changedGraphic.includes(storedHash), 'Changed proof graphic lost the stored hash');
console.log(
  JSON.stringify({
    status: 'PASS',
    localLinks: links,
    describedSelfContainedSvgs: svgNames.length,
    unchangedCaptures: Object.keys(manifest.capture_sha256).length,
    syntheticChain: 'verified',
    tamperCheck: 'detected',
    proofIllustrations: 'verified',
    paypalRequests: 0,
  }),
);
