import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  jsonb,
  bigserial,
  numeric,
  timestamp,
  customType,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

// SQL names and constraints mirror the architecture's authoritative PostgreSQL schema.
export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  country: text('country').notNull(),
  paypal_merchant_id: text('paypal_merchant_id'),
  paypal_client_id: text('paypal_client_id'),
  paypal_client_secret_enc: text('paypal_client_secret_enc'),
  paypal_webhook_id: text('paypal_webhook_id'),
  policy_urls: jsonb('policy_urls').notNull().default(sql.raw("'[]'")),
  domain_registered_at: timestamp('domain_registered_at', { withTimezone: true }),
  is_simulated: boolean('is_simulated').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const buyers = pgTable('buyers', {
  id: uuid('id').primaryKey().defaultRandom(),
  paypal_payer_id: text('paypal_payer_id').unique(),
  email_hash: text('email_hash'),
  display_name: text('display_name'),
  country: text('country'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    colour: text('colour'),
    size: text('size'),
    listing_version: text('listing_version').notNull().default('v1'),
    unit_value: numeric('unit_value', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
  },
  (t) => [unique('products_merchant_id_sku_key').on(t.merchant_id, t.sku)],
);

export const inventory_batches = pgTable(
  'inventory_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id),
    batch_code: text('batch_code').notNull(),
    supplier: text('supplier'),
    received_at: timestamp('received_at', { withTimezone: true }).notNull(),
    qty_received: integer('qty_received').notNull(),
    qty_remaining: integer('qty_remaining').notNull(),
    status: text('status').notNull().default('active'),
  },
  (t) => [
    check('inventory_batches_status_check', sql.raw("status in ('active','on_hold','retired')")),
    unique('inventory_batches_merchant_id_batch_code_key').on(t.merchant_id, t.batch_code),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    buyer_id: uuid('buyer_id').references(() => buyers.id),
    paypal_order_id: text('paypal_order_id').notNull().unique(),
    paypal_capture_id: text('paypal_capture_id').unique(),
    invoice_id: text('invoice_id').notNull().unique(),
    status: text('status').notNull(),
    amount_value: numeric('amount_value', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    ship_to_country: text('ship_to_country'),
    ship_to_postal: text('ship_to_postal'),
    ship_to_hash: text('ship_to_hash'),
    payer_account_status: text('payer_account_status'),
    seller_protection_status: text('seller_protection_status'),
    seller_protection_categories: jsonb('seller_protection_categories'),
    hold_reason: text('hold_reason'),
    held_by_hypothesis_id: uuid('held_by_hypothesis_id'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    captured_at: timestamp('captured_at', { withTimezone: true }),
    sealed_at: timestamp('sealed_at', { withTimezone: true }),
    shipped_at: timestamp('shipped_at', { withTimezone: true }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'orders_status_check',
      sql.raw(
        "status in ('created','approved','captured','packing','sealed','shipped','delivered','refunded','cancelled')",
      ),
    ),
    index('orders_merchant_id_status_idx').on(t.merchant_id, t.status),
  ],
);

export const order_items = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    unit_value: numeric('unit_value', { precision: 12, scale: 2 }).notNull(),
    listing_version: text('listing_version').notNull(),
    batch_code: text('batch_code'),
    packed_by: text('packed_by'),
    packed_at: timestamp('packed_at', { withTimezone: true }),
  },
  (t) => [index('order_items_batch_code_idx').on(t.batch_code)],
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_id: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    carrier: text('carrier').notNull(),
    carrier_name_other: text('carrier_name_other'),
    tracking_number: text('tracking_number').notNull(),
    paypal_tracker_id: text('paypal_tracker_id'),
    status: text('status').notNull().default('label_created'),
    last_scan_at: timestamp('last_scan_at', { withTimezone: true }),
    events: jsonb('events').notNull().default(sql.raw("'[]'")),
  },
  (_t) => [
    check(
      'shipments_status_check',
      sql.raw("status in ('label_created','in_transit','delivered','exception')"),
    ),
  ],
);

export const evidence_blobs = pgTable('evidence_blobs', {
  sha256: text('sha256').primaryKey(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes'),
  width: integer('width'),
  height: integer('height'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  purged_at: timestamp('purged_at', { withTimezone: true }),
});

export const ledger_entries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    order_id: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    blob_sha256: text('blob_sha256').references(() => evidence_blobs.sha256),
    actor: text('actor').notNull(),
    server_time: timestamp('server_time', { withTimezone: true, precision: 3 }).notNull(),
    prev_hash: text('prev_hash').notNull(),
    entry_hash: text('entry_hash').notNull(),
  },
  (t) => [
    check(
      'ledger_entries_type_check',
      sql.raw(
        "type in ('captured','photo','attestation','inspection','override','sealed','tracking_pushed','scan','delivered','gap_alert','held','released','complaint','dispute_opened','evidence_submitted','offer_made','claim_accepted','message_sent','refund','resolved')",
      ),
    ),
    unique('ledger_entries_order_id_seq_key').on(t.order_id, t.seq),
  ],
);

export const inspection_rules = pgTable('inspection_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchant_id: uuid('merchant_id')
    .notNull()
    .references(() => merchants.id),
  product_id: uuid('product_id').references(() => products.id),
  batch_code: text('batch_code').notNull(),
  instruction: text('instruction').notNull(),
  required_photo_label: text('required_photo_label').notNull(),
  created_by_hypothesis_id: uuid('created_by_hypothesis_id'),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    order_id: uuid('order_id').references(() => orders.id),
    type: text('type').notNull(),
    ref_id: text('ref_id'),
    message: text('message').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (_t) => [
    check(
      'alerts_type_check',
      sql.raw(
        "type in ('tracking_gap','seal_overdue','dispute_due_soon','shared_cause','inspection_required','safety_complaint','evidence_submit_failed','tracking_push_failed','signal_contest')",
      ),
    ),
  ],
);

export const paypal_events = pgTable('paypal_events', {
  id: text('id').primaryKey(),
  event_type: text('event_type').notNull(),
  resource_type: text('resource_type'),
  resource_id: text('resource_id'),
  merchant_id: uuid('merchant_id').references(() => merchants.id),
  payload: jsonb('payload').notNull(),
  verified: boolean('verified').notNull(),
  received_at: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
});

export const disputes = pgTable('disputes', {
  id: text('id').primaryKey(),
  merchant_id: uuid('merchant_id')
    .notNull()
    .references(() => merchants.id),
  order_id: uuid('order_id').references(() => orders.id),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  life_cycle_stage: text('life_cycle_stage'),
  amount_value: numeric('amount_value', { precision: 12, scale: 2 }),
  currency: text('currency'),
  seller_response_due_date: timestamp('seller_response_due_date', { withTimezone: true }),
  outcome_code: text('outcome_code'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  raw: jsonb('raw').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attestations = pgTable(
  'attestations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order_id: uuid('order_id').references(() => orders.id),
    hypothesis_id: uuid('hypothesis_id'),
    batch_code: text('batch_code'),
    step: text('step').notNull(),
    photo_shas: text('photo_shas').array().notNull(),
    photo_labels: text('photo_labels').array().notNull(),
    model: text('model').notNull(),
    result: jsonb('result').notNull(),
    status: text('status').notNull(),
    confidence: real('confidence').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (_t) => [
    check('attestations_step_check', sql.raw("step in ('pack','inspection','buyer_photo')")),
    check(
      'attestations_status_check',
      sql.raw("status in ('match','mismatch','could_not_verify')"),
    ),
  ],
);

export const evidence_packs = pgTable(
  'evidence_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dispute_id: text('dispute_id')
      .notNull()
      .references(() => disputes.id),
    status: text('status').notNull().default('draft'),
    recommendation: text('recommendation').notNull(),
    action_params: jsonb('action_params'),
    evidences: jsonb('evidences').notNull(),
    files: jsonb('files').notNull(),
    narrative: text('narrative').notNull(),
    hypothesis_id: uuid('hypothesis_id'),
    confidence: real('confidence').notNull(),
    approved_by: text('approved_by'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    paypal_response: jsonb('paypal_response'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
  },
  (_t) => [
    check(
      'evidence_packs_status_check',
      sql.raw("status in ('draft','approved','submitted','failed','superseded')"),
    ),
    check(
      'evidence_packs_recommendation_check',
      sql.raw(
        "recommendation in ('provide_evidence','make_offer','accept_claim','inspect_first','merchant_decides')",
      ),
    ),
  ],
);

export const buyer_signals = pgTable(
  'buyer_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    buyer_id: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id),
    order_id: uuid('order_id').references(() => orders.id),
    band: text('band').notNull(),
    points: integer('points').notNull(),
    reasons: jsonb('reasons').notNull(),
    features: jsonb('features').notNull(),
    recommendation: text('recommendation').notNull(),
    computed_at: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (_t) => [check('buyer_signals_band_check', sql.raw("band in ('green','yellow','red','grey')"))],
);

export const signal_contests = pgTable(
  'signal_contests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyer_id: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id),
    signal_id: uuid('signal_id')
      .notNull()
      .references(() => buyer_signals.id),
    text: text('text').notNull(),
    status: text('status').notNull().default('open'),
    merchant_note: text('merchant_note'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (_t) => [
    check('signal_contests_status_check', sql.raw("status in ('open','upheld','corrected')")),
  ],
);

export const buyer_network_simulated = pgTable('buyer_network_simulated', {
  buyer_id: uuid('buyer_id')
    .primaryKey()
    .references(() => buyers.id),
  disputes_filed_12m: integer('disputes_filed_12m').notNull(),
  disputes_lost_by_buyer_12m: integer('disputes_lost_by_buyer_12m').notNull(),
  merchants_transacted_12m: integer('merchants_transacted_12m').notNull(),
  note: text('note').notNull().default('SIMULATED - only PayPal could hold this data'),
});

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    order_id: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    buyer_id: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id),
    rating: integer('rating').notNull(),
    text: text('text').notNull(),
    merchant_reply: text('merchant_reply'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (_t) => [check('reviews_rating_check', sql.raw('rating between 1 and 5'))],
);

export const store_reports = pgTable('store_reports', {
  merchant_id: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id),
  report: jsonb('report').notNull(),
  computed_at: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complaint_clusters = pgTable('complaint_clusters', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchant_id: uuid('merchant_id')
    .notNull()
    .references(() => merchants.id),
  product_id: uuid('product_id').references(() => products.id),
  category: text('category').notNull(),
  label: text('label').notNull(),
  centroid: real('centroid').array().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    order_id: uuid('order_id').references(() => orders.id),
    order_item_id: uuid('order_item_id').references(() => order_items.id),
    product_id: uuid('product_id').references(() => products.id),
    buyer_id: uuid('buyer_id').references(() => buyers.id),
    source: text('source').notNull(),
    source_ref: text('source_ref').notNull(),
    text: text('text').notNull(),
    image_shas: text('image_shas').array().notNull().default(sql.raw("'{}'")),
    extracted: jsonb('extracted'),
    embedding: real('embedding').array(),
    cluster_id: uuid('cluster_id').references(() => complaint_clusters.id),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('complaints_source_check', sql.raw("source in ('buyer_report','dispute','review')")),
    unique('complaints_source_source_ref_key').on(t.source, t.source_ref),
  ],
);

export const hypotheses = pgTable(
  'hypotheses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    cluster_id: uuid('cluster_id')
      .notNull()
      .references(() => complaint_clusters.id),
    dimension: text('dimension').notNull(),
    value: text('value').notNull(),
    status: text('status').notNull().default('open'),
    strength: text('strength').notNull(),
    stats: jsonb('stats').notNull(),
    alternatives: jsonb('alternatives').notNull(),
    affected: jsonb('affected').notNull(),
    safety_flag: boolean('safety_flag').notNull().default(false),
    explanation: text('explanation').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'hypotheses_dimension_check',
      sql.raw(
        "dimension in ('batch_code','carrier','listing_version','packer','ship_week','ship_to_country')",
      ),
    ),
    check(
      'hypotheses_status_check',
      sql.raw("status in ('open','confirmed','dismissed','resolved','superseded')"),
    ),
    check('hypotheses_strength_check', sql.raw("strength in ('strong','possible')")),
    unique('hypotheses_cluster_id_dimension_value_key').on(t.cluster_id, t.dimension, t.value),
  ],
);

export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hypothesis_id: uuid('hypothesis_id')
      .notNull()
      .references(() => hypotheses.id),
    type: text('type').notNull(),
    status: text('status').notNull().default('proposed'),
    payload: jsonb('payload').notNull(),
    approved_by: text('approved_by'),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (_t) => [
    check(
      'actions_type_check',
      sql.raw(
        "type in ('hold_orders','add_inspection_rule','send_buyer_messages','propose_offers','proactive_refund','release_orders')",
      ),
    ),
    check('actions_status_check', sql.raw("status in ('proposed','approved','done','failed')")),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant_id: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    order_id: uuid('order_id').references(() => orders.id),
    buyer_id: uuid('buyer_id').references(() => buyers.id),
    action_id: uuid('action_id').references(() => actions.id),
    dispute_id: text('dispute_id').references(() => disputes.id),
    channel: text('channel').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    status: text('status').notNull().default('draft'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (_t) => [
    check(
      'messages_channel_check',
      sql.raw("channel in ('in_app','email_outbox','paypal_dispute')"),
    ),
    check('messages_status_check', sql.raw("status in ('draft','approved','sent','failed')")),
  ],
);
