import type { DisputeDetail, EvidencePackDraft } from '@fairfold/contracts';
export interface PackState {
  photos: { sha256: string; label: string; createdAt: string }[];
  attestation: {
    id: string;
    status: string;
    confidence: number;
    result: unknown;
    createdAt: string;
  } | null;
  inspectionRule: {
    id: string;
    batchCode: string;
    instruction: string;
    requiredPhotoLabel: string;
  } | null;
  batches: { id: string; batchCode: string; qtyRemaining: number; status: string }[];
  canSeal: boolean;
  blockers: string[];
}
export interface Proof {
  verified: boolean;
  brokenAtSeq: number | null;
  entries: { seq: number; type: string; entry_hash: string; server_time: string }[];
}
export interface StoredPack {
  id: string;
  status: string;
  recommendation: EvidencePackDraft['recommendation'];
  narrative: string;
  evidences: unknown[];
  files: EvidencePackDraft['files'];
  actionParams: EvidencePackDraft['actionParams'];
  confidence: number;
}
export interface DisputeRecord {
  dispute: DisputeDetail;
  packs: StoredPack[];
  timeline: { type: string; server_time: string }[];
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function money(amount?: { currency_code: string; value: string } | null): string {
  if (!amount) return '—';
  // Money stays a decimal string throughout the browser/API boundary.
  return (amount.currency_code === 'USD' ? '$' : amount.currency_code + ' ') + amount.value;
}
export const shortId = (id?: string) =>
  id ? (/^[0-9a-f-]{36}$/i.test(id) ? 'FF-' + id.slice(-6).toUpperCase() : id) : '—';
export const percent = (n?: number | null) =>
  n == null ? '—' : (n * 100).toFixed(1).replace('.0', '') + '%';
