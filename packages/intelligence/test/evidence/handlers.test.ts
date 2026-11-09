import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttestationResult } from '@fairfold/contracts';
import {
  createEvidenceHandlers,
  type AttestationRow,
  type EvidenceStore,
} from '../../src/evidence/handlers.js';
import { createHandlers } from '../../src/handlers.js';
import { sha, uid } from '../helpers/ids.js';
import { mockModel, promptOf } from '../helpers/mockModel.js';

const I1 = uid(0xa1),
  I2 = uid(0xa2),
  O1 = uid(1),
  H1 = uid(0xb1);
const [S1, S2, S3] = [sha('s1'), sha('s2'), sha('s3')];

const answer: AttestationResult = {
  items: [
    {
      orderItemId: I1,
      seen: { itemType: 'hoodie', colour: 'navy', sizeLabel: 'M', quantity: 1 },
      matches: true,
      confidence: 0.9,
      notes: '',
    },
    {
      orderItemId: I2,
      seen: { itemType: 't-shirt', colour: 'ochre', sizeLabel: 'L', quantity: 1 },
      matches: true,
      confidence: 0.9,
      notes: '',
    },
  ],
  batchLabelText: 'B17',
  shippingLabel: { visible: true, trackingNumberText: 'FF100000001' },
  defects: [],
  couldNotVerify: [],
  confidence: 0.9,
  // the store below reports an active inspection rule, so a clean pack read must include a clean inspection
  inspection: {
    instruction: 'Photograph the left sleeve seam close up.',
    defectVisible: false,
    matchesCluster: false,
  },
};

function memoryStore(): EvidenceStore & {
  rows: AttestationRow[];
  ledger: Array<{ orderId: string; entry: unknown }>;
} {
  const rows: AttestationRow[] = [];
  const ledger: Array<{ orderId: string; entry: unknown }> = [];
  return {
    rows,
    ledger,
    loadOrderForAttestation: vi.fn(async () => ({
      items: [
        {
          orderItemId: I1,
          name: 'Block-print cotton hoodie',
          sku: 'HD-IND-01',
          colour: 'navy',
          size: 'M',
          quantity: 1,
        },
        {
          orderItemId: I2,
          name: 'Hand-block T-shirt',
          sku: 'TS-IND-02',
          colour: 'ochre',
          size: 'L',
          quantity: 1,
        },
      ],
      inspectionRule: {
        instruction: 'Photograph the left sleeve seam close up.',
        requiredPhotoLabel: 'seam_closeup',
        clusterLabel: 'sleeve seam opening',
      },
    })),
    loadInspectionRule: vi.fn(async () => ({
      instruction: 'Photograph the left sleeve seam close up.',
      requiredPhotoLabel: 'seam_closeup',
      clusterLabel: 'sleeve seam opening',
    })),
    loadPhoto: vi.fn(async (sha: string) => ({
      mime: 'image/jpeg',
      bytes: new TextEncoder().encode(sha),
    })),
    insertAttestation: vi.fn(async (row: AttestationRow, ledgerEntry?: (id: string) => unknown) => {
      rows.push(row);
      const id = `att-${rows.length}`;
      if (ledgerEntry) ledger.push({ orderId: row.orderId!, entry: ledgerEntry(id) });
      return id;
    }),
  };
}

const packPayload = {
  orderId: O1,
  photoShas: [S1, S2, S3],
  labels: ['item', 'size_label', 'seam_closeup'],
  batchCodes: { [I1]: 'B17', [I2]: 'B17' },
};

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('pack.photos_uploaded handler', () => {
  it('pack handler writes one attestation and one ledger entry', async () => {
    const store = memoryStore();
    const { model } = mockModel([answer]);
    await createEvidenceHandlers({ store, model })['pack.photos_uploaded'](packPayload);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      orderId: O1,
      hypothesisId: null,
      step: 'pack',
      status: 'match',
      model: 'mock-vision',
      photoShas: [S1, S2, S3],
      photoLabels: ['item', 'size_label', 'seam_closeup'],
      batchCode: 'B17',
      confidence: 0.9,
    });
    expect(store.ledger).toEqual([
      {
        orderId: O1,
        entry: {
          type: 'attestation',
          actor: 'system',
          payload: {
            attestationId: 'att-1',
            status: 'match',
            confidence: 0.9,
            model: 'mock-vision',
            photoShas: [S1, S2, S3],
          },
        },
      },
    ]);
  });

  it('passes the order items and the active inspection rule to the agent', async () => {
    const store = memoryStore();
    const { model, calls } = mockModel([answer]);
    await createEvidenceHandlers({ store, model })['pack.photos_uploaded'](packPayload);
    expect(store.loadOrderForAttestation).toHaveBeenCalledWith(O1, { [I1]: 'B17', [I2]: 'B17' });
    const p = promptOf(calls[0]!);
    expect(p.userText).toContain(I2);
    expect(p.system).toContain('sleeve seam opening');
  });

  it('an active inspection rule with no inspection read blocks match', async () => {
    const store = memoryStore();
    const { model } = mockModel([{ ...answer, inspection: null }]);
    await createEvidenceHandlers({ store, model })['pack.photos_uploaded'](packPayload);
    expect(store.rows[0]?.status).toBe('could_not_verify');
  });

  it('records batch_code only when every item shares one code', async () => {
    const store = memoryStore();
    const { model } = mockModel([answer]);
    await createEvidenceHandlers({ store, model })['pack.photos_uploaded']({
      ...packPayload,
      batchCodes: { [I1]: 'B17', [I2]: 'B15' },
    });
    expect(store.rows[0]?.batchCode).toBeNull();
  });

  it('rejects a malformed payload without writing anything', async () => {
    const store = memoryStore();
    const { model } = mockModel([answer]);
    const handler = createEvidenceHandlers({ store, model })['pack.photos_uploaded'];
    await expect(
      handler({ orderId: O1, photoShas: [S1], labels: [], batchCodes: {} }),
    ).rejects.toThrow(/labels/);
    await expect(handler({ orderId: O1 })).rejects.toThrow();
    expect(store.rows).toHaveLength(0);
  });
});

describe('inspection.uploaded handler', () => {
  it('writes an attestation with order_id null and hypothesis_id set, and no ledger entry', async () => {
    const store = memoryStore();
    const { model, calls } = mockModel([
      {
        ...answer,
        items: [],
        inspection: { instruction: 'x', defectVisible: true, matchesCluster: true },
      },
    ]);
    await createEvidenceHandlers({ store, model })['inspection.uploaded']({
      hypothesisId: H1,
      batchCode: 'B17',
      photoShas: [sha('seam1')],
    });
    expect(store.loadInspectionRule).toHaveBeenCalledWith(H1, 'B17');
    expect(store.rows[0]).toMatchObject({
      orderId: null,
      hypothesisId: H1,
      step: 'inspection',
      batchCode: 'B17',
      photoLabels: ['seam_closeup'],
    });
    expect(store.rows[0]?.result.inspection?.defectVisible).toBe(true);
    expect(store.ledger).toHaveLength(0);
    expect(promptOf(calls[0]!).userText).toContain('1. seam_closeup');
  });
});

describe('createHandlers', () => {
  it('registers the evidence jobs without touching the runtime until a job runs', () => {
    const runtime = vi.fn(() => {
      throw new Error('not yet');
    });
    const handlers = createHandlers(runtime);
    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining(['inspection.uploaded', 'pack.photos_uploaded']),
    );
    expect(runtime).not.toHaveBeenCalled();
  });
});
