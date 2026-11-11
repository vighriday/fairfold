// Length limits on model-written text are enforced by code (task: robustness on the free model tier). A limit in the
// schema sent to the model turns a 141-character summary into a schema failure, a retry and then the fallback; code
// cuts the text instead and keeps the answer.

const ELLIPSIS = '…';

/** At most `max` characters: cut at the last word boundary that fits, ending with an ellipsis. */
export function truncateText(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max - ELLIPSIS.length);
  const space = room.lastIndexOf(' ');
  const cut = space > 0 ? room.slice(0, space) : room;
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

/** At most `max` characters, keeping whole sentences; a first sentence longer than `max` is cut by word. */
export function truncateSentences(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max);
  let end = -1;
  for (const m of room.matchAll(/[.!?](?=\s|$)/g)) end = m.index + 1;
  return end > 0 ? room.slice(0, end) : truncateText(clean, max);
}
