-- packages/db/migrations/0001_init.sql  (PostgreSQL 16)
create extension if not exists pgcrypto;

create table merchants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- 'neel-block-prints'; also the webhook path segment
  name text not null,
  domain text not null,
  country text not null,                     -- ISO-3166 alpha-2
  paypal_merchant_id text,
  paypal_client_id text,                     -- null for simulated stores
  paypal_client_secret_enc text,             -- AES-256-GCM with APP_ENCRYPTION_KEY; null for simulated stores
  paypal_webhook_id text,                    -- one webhook per merchant, URL /webhooks/paypal/:slug
  policy_urls jsonb not null default '[]',   -- [{kind:'returns'|'shipping'|'contact', url}]
  domain_registered_at timestamptz,          -- from RDAP, or seeded for fictional domains
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

create table buyers (
  id uuid primary key default gen_random_uuid(),
  paypal_payer_id text unique,
  email_hash text,                           -- sha256(lowercased email); raw email not stored
  display_name text,
  country text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  sku text not null,
  name text not null,
  description text not null,                 -- listing text, used as not-as-described evidence
  colour text, size text,                    -- what the Evidence Agent compares against
  listing_version text not null default 'v1',
  unit_value numeric(12,2) not null,
  currency text not null default 'USD',
  unique (merchant_id, sku)
);

create table inventory_batches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  product_id uuid not null references products(id),
  batch_code text not null,
  supplier text,
  received_at timestamptz not null,
  qty_received int not null,
  qty_remaining int not null,
  status text not null default 'active' check (status in ('active','on_hold','retired')),
  unique (merchant_id, batch_code)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  buyer_id uuid references buyers(id),
  paypal_order_id text unique not null,
  paypal_capture_id text unique,
  invoice_id text unique not null,           -- 'FF-<order uuid>'
  status text not null check (status in ('created','approved','captured','packing','sealed','shipped','delivered','refunded','cancelled')),
  amount_value numeric(12,2) not null,
  currency text not null,
  ship_to_country text,
  ship_to_postal text,
  ship_to_hash text,                         -- sha256 of the normalised shipping address
  payer_account_status text,                 -- 'VERIFIED' | 'UNVERIFIED'
  seller_protection_status text,             -- 'ELIGIBLE' | 'PARTIALLY_ELIGIBLE' | 'NOT_ELIGIBLE'
  seller_protection_categories jsonb,
  hold_reason text,
  held_by_hypothesis_id uuid,
  created_at timestamptz not null default now(),
  captured_at timestamptz, sealed_at timestamptz, shipped_at timestamptz, delivered_at timestamptz
);
create index on orders (merchant_id, status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  sku text not null,
  name text not null,
  quantity int not null,
  unit_value numeric(12,2) not null,
  listing_version text not null,             -- copied from products at order creation
  batch_code text,                           -- set at the Pack Station
  packed_by text,                            -- packer name or station id, from the seal request
  packed_at timestamptz
);
create index on order_items (batch_code);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references orders(id),
  carrier text not null,                     -- PayPal tracking carrier enum, or 'OTHER'
  carrier_name_other text,
  tracking_number text not null,
  paypal_tracker_id text,
  status text not null default 'label_created' check (status in ('label_created','in_transit','delivered','exception')),
  last_scan_at timestamptz,
  events jsonb not null default '[]'
);

create table evidence_blobs (
  sha256 text primary key,
  mime text not null,                        -- 'image/jpeg' | 'image/png' | 'application/pdf'
  bytes bytea,                               -- null once purged by retention
  width int, height int,
  created_at timestamptz not null default now(),
  purged_at timestamptz
);

create table ledger_entries (
  id bigserial primary key,
  order_id uuid not null references orders(id),
  seq int not null,
  type text not null check (type in ('captured','photo','attestation','inspection','override','sealed','tracking_pushed','scan','delivered','gap_alert','held','released','complaint','dispute_opened','evidence_submitted','offer_made','claim_accepted','message_sent','refund','resolved')),
  payload jsonb not null,
  blob_sha256 text references evidence_blobs(sha256),
  actor text not null,                       -- 'system' | 'merchant:<id>' | 'buyer:<id>' | 'paypal'
  server_time timestamptz(3) not null,       -- set by ledger.append, never by a default
  prev_hash text not null,
  entry_hash text not null,
  unique (order_id, seq)
);

create table inspection_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  product_id uuid references products(id),
  batch_code text not null,
  instruction text not null,
  required_photo_label text not null,        -- e.g. 'seam_closeup'
  created_by_hypothesis_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  order_id uuid references orders(id),
  type text not null check (type in ('tracking_gap','seal_overdue','dispute_due_soon','shared_cause','inspection_required','safety_complaint','evidence_submit_failed','tracking_push_failed','signal_contest')),
  ref_id text,                               -- dispute id, hypothesis id or contest id, for dedupe
  message text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table paypal_events (
  id text primary key,                       -- PayPal event id, or 'poll:<dispute_id>:<update_time>'
  event_type text not null,
  resource_type text,
  resource_id text,
  merchant_id uuid references merchants(id),
  payload jsonb not null,
  verified boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table disputes (
  id text primary key,                       -- PayPal dispute_id
  merchant_id uuid not null references merchants(id),
  order_id uuid references orders(id),
  reason text not null,                      -- PayPal reason enum
  status text not null,                      -- PayPal status enum
  life_cycle_stage text,                     -- 'INQUIRY' | 'CHARGEBACK' | 'PRE_ARBITRATION' | 'ARBITRATION'
  amount_value numeric(12,2), currency text,
  seller_response_due_date timestamptz,
  outcome_code text,                         -- dispute_outcome.outcome_code once resolved
  resolved_at timestamptz,
  raw jsonb not null,
  updated_at timestamptz not null default now()
);

create table attestations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),       -- null for batch inspections
  hypothesis_id uuid,                        -- set for inspections
  batch_code text,
  step text not null check (step in ('pack','inspection','buyer_photo')),
  photo_shas text[] not null,
  photo_labels text[] not null,
  model text not null,
  result jsonb not null,                     -- AttestationResult, section 10
  status text not null check (status in ('match','mismatch','could_not_verify')),
  confidence real not null,
  created_at timestamptz not null default now()
);

create table evidence_packs (
  id uuid primary key default gen_random_uuid(),
  dispute_id text not null references disputes(id),
  status text not null default 'draft' check (status in ('draft','approved','submitted','failed','superseded')),
  recommendation text not null check (recommendation in ('provide_evidence','make_offer','accept_claim','inspect_first','merchant_decides')),
  action_params jsonb,                       -- make_offer: {offerType, offerAmount, note}; accept_claim: {acceptClaimType, refundAmount, note}
  evidences jsonb not null,                  -- exact provide-evidence JSON, or []
  files jsonb not null,                      -- [{sha256, filename, mime}]
  narrative text not null,
  hypothesis_id uuid,
  confidence real not null,
  approved_by text, approved_at timestamptz,
  paypal_response jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table buyer_signals (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  buyer_id uuid not null references buyers(id),
  order_id uuid references orders(id),
  band text not null check (band in ('green','yellow','red','grey')),
  points int not null,
  reasons jsonb not null,
  features jsonb not null,
  recommendation text not null,
  computed_at timestamptz not null default now()
);

create table signal_contests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references buyers(id),
  signal_id uuid not null references buyer_signals(id),
  text text not null,
  status text not null default 'open' check (status in ('open','upheld','corrected')),
  merchant_note text,
  created_at timestamptz not null default now()
);

create table buyer_network_simulated (       -- LABELLED SIMULATION of a PayPal-run network tier
  buyer_id uuid primary key references buyers(id),
  disputes_filed_12m int not null,
  disputes_lost_by_buyer_12m int not null,
  merchants_transacted_12m int not null,
  note text not null default 'SIMULATED - only PayPal could hold this data'
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  order_id uuid unique not null references orders(id),
  buyer_id uuid not null references buyers(id),
  rating int not null check (rating between 1 and 5),
  text text not null,
  merchant_reply text,
  created_at timestamptz not null default now()
);

create table store_reports (
  merchant_id uuid primary key references merchants(id),
  report jsonb not null,
  computed_at timestamptz not null default now()
);

create table complaint_clusters (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  product_id uuid references products(id),   -- null for transit categories
  category text not null,
  label text not null,
  centroid real[] not null,
  updated_at timestamptz not null default now()
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  order_id uuid references orders(id),       -- null only if a dispute cannot be matched
  order_item_id uuid references order_items(id),
  product_id uuid references products(id),
  buyer_id uuid references buyers(id),
  source text not null check (source in ('buyer_report','dispute','review')),
  source_ref text not null,                  -- report id, dispute id, or review id
  text text not null,                        -- dispute messages are appended here, not new rows
  image_shas text[] not null default '{}',
  extracted jsonb,
  embedding real[],
  cluster_id uuid references complaint_clusters(id),  -- set once, never reassigned
  created_at timestamptz not null default now(),
  unique (source, source_ref)
);

create table hypotheses (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  cluster_id uuid not null references complaint_clusters(id),
  dimension text not null check (dimension in ('batch_code','carrier','listing_version','packer','ship_week','ship_to_country')),
  value text not null,
  status text not null default 'open' check (status in ('open','confirmed','dismissed','resolved','superseded')),
  strength text not null check (strength in ('strong','possible')),
  stats jsonb not null,                      -- HypothesisStats, section 9
  alternatives jsonb not null,
  affected jsonb not null,                   -- AffectedOrders, section 9
  safety_flag boolean not null default false,
  explanation text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz, resolved_at timestamptz,
  unique (cluster_id, dimension, value)
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references hypotheses(id),
  type text not null check (type in ('hold_orders','add_inspection_rule','send_buyer_messages','propose_offers','proactive_refund','release_orders')),
  status text not null default 'proposed' check (status in ('proposed','approved','done','failed')),
  payload jsonb not null,                    -- e.g. {orderIds:[]}, {messageIds:[]}, {disputeIds:[]}
  approved_by text,
  result jsonb,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id),
  order_id uuid references orders(id),
  buyer_id uuid references buyers(id),
  action_id uuid references actions(id),
  dispute_id text references disputes(id),
  channel text not null check (channel in ('in_app','email_outbox','paypal_dispute')),
  subject text, body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
