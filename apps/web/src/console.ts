/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type {
  Alert,
  OrderRow,
  OrderDetail,
  DisputeRow,
  HypothesisSummary,
  HypothesisDetail,
  StoreReport,
  Review,
} from '@fairfold/contracts';
import { DemoSubjects } from '@fairfold/contracts/common';
import { ApiClient, ApiError, type Activity } from './api.js';
import { createActions } from './actions.js';
import { parseRoute, routePath, type Route } from './router.js';
import {
  money,
  percent,
  shortId,
  type PackState,
  type Proof,
  type DisputeRecord,
} from './models.js';

interface Logic {
  state: Record<string, unknown>;
  setState(update: Record<string, unknown>): void;
}
declare global {
  interface Window {
    DCLogic: new () => Logic;
    DCLite: {
      mount: (host: Element, template: HTMLTemplateElement, component: new () => Logic) => Console;
    };
  }
}
const INK = '#15131d',
  PAPER = '#f3f1f6',
  VIOLET = 'oklch(0.53 0.23 295)';
const colours: Record<string, string> = {
  grey: 'oklch(0.72 0.012 290)',
  green: 'oklch(0.64 0.15 155)',
  yellow: 'oklch(0.8 0.15 85)',
  red: 'oklch(0.62 0.2 25)',
};
const merchant = DemoSubjects.merchant;
const storeIds = {
  indigo: '00000000-0000-4000-8000-000000000102',
  quick: '00000000-0000-4000-8000-000000000103',
};
class Console extends window.DCLogic {
  route: Route = parseRoute(location.pathname) ?? { view: 'orders' };
  orders: OrderRow[] = [];
  disputes: DisputeRow[] = [];
  hypotheses: HypothesisSummary[] = [];
  alerts: Alert[] = [];
  order?: OrderDetail;
  pack?: PackState;
  proof?: Proof;
  dispute?: DisputeRecord;
  hypothesis?: HypothesisDetail;
  report?: StoreReport;
  comparisons: Partial<Record<'indigo' | 'quick', StoreReport>> = {};
  reviews: Review[] = [];
  filter = 'all';
  batch = '';
  busy = false;
  loading = true;
  error = '';
  logs: Activity[] = [];
  dock = true;
  pinned = false;
  hover = false;
  timer?: ReturnType<typeof setTimeout>;
  generation = 0;
  poll?: ReturnType<typeof setTimeout>;
  pollRemaining = 0;
  actions = createActions(this);
  selectedOffer = '';
  shownView = '';
  api = new ApiClient(document.documentElement.dataset.demo === 'true', (entry) => {
    this.logs = [entry, ...this.logs].slice(0, 7);
    if (entry.m === 'POST') this.dock = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.foldDock(), 5000);
    this.redraw();
  });
  foldDock() {
    if (this.hover || this.pinned || this.error) return;
    this.dock = false;
    this.redraw();
  }
  redraw() {
    this.setState({});
  }
  fail(error: unknown) {
    this.error =
      error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : 'Could not load this view. Refresh to try again.';
    this.dock = true;
    this.redraw();
  }
  componentDidMount() {
    addEventListener('popstate', () => {
      document.querySelectorAll('dialog').forEach((dialog) => dialog.close());
      this.route = parseRoute(location.pathname) ?? { view: 'orders' };
      void this.loadView();
    });
    void this.refresh();
    const dock = document.querySelector('[data-ff="dock"]');
    dock?.addEventListener('pointerenter', () => {
      this.hover = true;
    });
    dock?.addEventListener('pointerleave', () => {
      this.hover = false;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.foldDock(), 1500);
    });
    if (dock && typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => {
        document.documentElement.style.setProperty(
          '--ff-dock',
          Math.ceil(dock.getBoundingClientRect().height) + 'px',
        );
      }).observe(dock);
    addEventListener('online', () => {
      if (!this.busy) void this.refresh();
    });
  }
  componentDidUpdate() {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    for (const [index, button] of [...nav.children].entries()) {
      button.setAttribute(
        'aria-current',
        ['orders', 'pack', 'disputes', 'shared-causes', 'store-report'][index] === this.route.view
          ? 'page'
          : 'false',
      );
    }
    if (this.shownView !== this.route.view) {
      this.shownView = this.route.view;
      const active = nav.querySelector('[aria-current="page"]');
      if (active && nav.scrollWidth > nav.clientWidth) {
        const a = active.getBoundingClientRect(),
          n = nav.getBoundingClientRect();
        nav.scrollTo({
          left: Math.max(0, a.left - n.left + nav.scrollLeft - (nav.clientWidth - a.width) / 2),
          behavior: 'smooth',
        });
      }
    }
    document
      .querySelectorAll<HTMLElement>(
        'main div[style*="grid-template-columns:78px"][style*="cursor:pointer"]',
      )
      .forEach((row) => {
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            row.click();
          }
        };
      });
  }
  navigate(route: Route) {
    if (this.busy) return;
    this.route = route;
    history.pushState(null, '', routePath(route));
    void this.loadView();
  }
  async refresh() {
    this.loading = true;
    this.error = '';
    this.redraw();
    const jobs = [
      this.api.list<OrderRow>('/api/merchant/orders').then((data) => {
        this.orders = data;
      }),
      this.api.list<DisputeRow>('/api/merchant/disputes').then((data) => {
        this.disputes = data;
      }),
      this.api.list<HypothesisSummary>('/api/shared-causes').then((data) => {
        this.hypotheses = data;
      }),
      this.api.list<Alert>('/api/merchant/alerts').then((data) => {
        this.alerts = data;
      }),
      this.api
        .request<StoreReport>(`/api/stores/${merchant}/report`, undefined, true)
        .then((data) => {
          this.report = data;
        }),
    ];
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') this.fail(failed.reason);
    await this.loadView(false);
  }
  async loadView(clearError = true) {
    const generation = ++this.generation;
    clearTimeout(this.poll);
    this.loading = true;
    if (clearError) this.error = '';
    this.order = undefined;
    this.pack = undefined;
    this.proof = undefined;
    this.dispute = undefined;
    this.hypothesis = undefined;
    this.selectedOffer = '';
    this.redraw();
    const route = this.route;
    try {
      if (route.view === 'orders' || route.view === 'pack') {
        const id =
          route.id ??
          this.orders.find((o) => route.view !== 'pack' || ['captured', 'held'].includes(o.status))
            ?.id;
        if (id) {
          const order = await this.api.request<OrderDetail>(
            `/api/orders/${encodeURIComponent(id)}`,
          );
          if (generation !== this.generation) return;
          this.order = order;
          if (route.view === 'pack') {
            const [pack, proof] = await Promise.all([
              this.api.request<PackState>(`/api/orders/${id}/pack`),
              this.api.request<Proof>(`/api/orders/${id}/ledger`),
            ]);
            if (generation !== this.generation) return;
            this.pack = pack;
            this.proof = proof;
            this.batch = order.items[0]?.batchCode ?? pack.batches[0]?.batchCode ?? '';
          }
        }
      } else if (route.view === 'disputes') {
        const id = route.id ?? this.disputes[0]?.id;
        if (id) {
          const detail = await this.api.request<DisputeRecord>(
            `/api/disputes/${encodeURIComponent(id)}`,
          );
          if (generation !== this.generation) return;
          this.dispute = detail;
          this.selectedOffer =
            detail.dispute.allowedResponseOptions?.makeOffer?.offerTypes[0] ?? '';
        }
      } else if (route.view === 'shared-causes') {
        const id =
          route.id ??
          this.hypotheses.find((h) => h.status === 'open')?.id ??
          this.hypotheses[0]?.id;
        if (id) {
          const detail = await this.api.request<HypothesisDetail>(`/api/shared-causes/${id}`);
          if (generation !== this.generation) return;
          this.hypothesis = detail;
        }
      } else {
        const results = await Promise.allSettled([
          this.api
            .request<Review[]>(`/api/stores/${merchant}/reviews?limit=100`, undefined, true)
            .then((data) => {
              this.reviews = data;
            }),
          ...Object.entries(storeIds).map(async ([key, id]) => {
            this.comparisons[key as 'indigo' | 'quick'] = await this.api.request<StoreReport>(
              `/api/stores/${id}/report`,
              undefined,
              true,
            );
          }),
        ]);
        const failed = results.find((r) => r.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.redraw();
        if (this.pollRemaining > 0) {
          this.pollRemaining--;
          this.poll = setTimeout(() => {
            if (!this.busy) void this.loadView();
          }, 12_000);
        }
      }
    }
  }
  async mutate(path: string, body: object | FormData) {
    if (this.busy || this.loading) return;
    this.busy = true;
    this.error = '';
    this.redraw();
    try {
      await this.api.request(path, body);
      await this.refresh();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      this.redraw();
    }
  }
  renderVals() {
    const o = this.order,
      s = o?.buyerSignal,
      p = this.pack,
      h = this.hypothesis;
    const selected = this.order?.id;
    const currentCause =
      h ?? this.hypotheses.find((v) => v.status === 'open') ?? this.hypotheses[0];
    const gap = this.alerts.find((a) => !a.acknowledgedAt);
    const statuses: Record<string, string> = {
      captured: 'To pack',
      shipped: 'In transit',
      delivered: 'Delivered',
    };
    const st = (order: OrderRow) =>
      order.hold ? 'Held' : (statuses[order.status] ?? order.status);
    const filters = [
      ['all', 'All'],
      ['pack', 'To pack'],
      ['held', 'Held'],
      ['transit', 'In transit'],
      ['delivered', 'Delivered'],
      ['disputed', 'Disputed'],
    ];
    const rows = this.orders
      .filter(
        (order) =>
          this.filter === 'all' ||
          {
            pack: order.status === 'captured' && !order.hold,
            held: !!order.hold,
            transit: order.status === 'shipped',
            delivered: order.status === 'delivered',
            disputed: order.disputeOpen,
          }[this.filter],
      )
      .map((order) => ({
        id: shortId(order.id),
        buyer: order.buyerDisplayName ?? 'Unknown buyer',
        item: order.items.map((i) => `${i.name} × ${i.quantity}`).join(', '),
        amt: money(order.amount),
        st: st(order) + (order.disputeOpen ? ' · dispute' : ''),
        stBg: order.hold ? INK : 'oklch(0.94 0.035 295)',
        stFg: order.hold ? PAPER : INK,
        band: order.buyerSignal?.band ?? 'grey',
        bandC: colours[order.buyerSignal?.band ?? 'grey'],
        bg: order.id === selected ? 'oklch(0.95 0.028 295)' : 'transparent',
        pick: () => this.navigate({ view: 'orders', id: order.id }),
      }));
    const orderView = {
      id: shortId(o?.id),
      st: o?.status ?? (this.loading ? 'Loading…' : 'No order selected'),
      amt: money(o?.amount),
      buyer: o?.buyer?.displayName ?? '—',
      item: o?.items.map((i) => `${i.name} × ${i.quantity}`).join(', ') ?? '—',
      band: s?.band ?? 'grey',
      pos: { grey: '12.5%', green: '37.5%', yellow: '62.5%', red: '87.5%' }[s?.band ?? 'grey'],
      acct: o?.buyer?.payerAccountStatus ?? 'unknown',
      reasons: s?.reasons.map((r) => ({ code: r.code, text: r.label })) ?? [],
      rec: s?.recommendation ?? 'Select an order to read its signal.',
      prot: o?.sellerProtection.status
        ? [o.sellerProtection.status, ...o.sellerProtection.disputeCategories].join(' · ')
        : 'Unknown',
      ledger: o
        ? `${o.ledger.length} entries · ${o.ledger.verified ? 'chain verified' : 'verification failed'}`
        : 'Not loaded',
      cta: o?.disputes[0] ? 'Open in Dispute Room →' : 'Open Pack Station →',
      go: () => {
        if (o)
          this.navigate(
            o.disputes[0] ? { view: 'disputes', id: o.disputes[0].id } : { view: 'pack', id: o.id },
          );
      },
    };
    const labels = [
      ...new Set([
        'item',
        'size_label',
        'batch_label',
        'sealed_parcel',
        ...(p?.inspectionRule ? [p.inspectionRule.requiredPhotoLabel] : []),
      ]),
    ];
    const packView = {
      signalBg: {
        grey: 'oklch(0.93 0.02 290)',
        green: 'oklch(0.9 0.08 155)',
        yellow: 'oklch(0.95 0.06 85)',
        red: 'oklch(0.95 0.035 25)',
      }[s?.band ?? 'grey'],
      signalColour: colours[s?.band ?? 'grey'],
      itemName: o?.items.map((i) => i.name).join(', ') ?? 'Select an order',
      sku: o?.items.map((i) => i.sku).join(', ') ?? '—',
      colour: 'See ordered item',
      size: 'See ordered item',
      quantity: o?.items.reduce((n, i) => n + i.quantity, 0) ?? '—',
      listing: 'Recorded with order',
      ruleOn: !!p?.inspectionRule || !!o?.hold,
      ruleTag: o?.hold ? 'Order held · approval required' : 'Inspection rule active',
      ruleInstruction: p?.inspectionRule?.instruction ?? o?.hold?.reason ?? '',
      count: `${labels.filter((l) => p?.photos.some((photo) => photo.label === l)).length} / ${labels.length}`,
      tiles: labels.map((label) => {
        const photo = p?.photos.filter((v) => v.label === label).at(-1);
        return {
          label,
          sub: photo ? `${photo.sha256.slice(0, 12)} · ${photo.createdAt}` : 'Tap to capture',
          bg: photo ? 'oklch(0.95 0.028 295)' : 'transparent',
          bd: photo ? '1px solid rgba(21,19,29,.12)' : '1.5px dashed rgba(21,19,29,.3)',
          shoot: () => this.actions.shootPack(label),
        };
      }),
      attPill: p?.attestation
        ? `${p.attestation.status} · ${p.attestation.confidence.toFixed(2)}`
        : 'waiting',
      attBg: 'oklch(0.95 0.028 295)',
      attFg: INK,
      attNote: p?.attestation
        ? 'Server attestation for the current photos. Missing verification remains a blocker; review an explicit override only when permitted.'
        : 'Capture the required photos. A configured vision provider and worker must attest them before sealing.',
      attLines: p?.attestation
        ? [
            { k: 'Status', v: p.attestation.status },
            { k: 'Time', v: p.attestation.createdAt },
          ]
        : [],
      batches:
        p?.batches.map((b) => ({
          label: `${b.batchCode} · ${b.qtyRemaining}`,
          pick: () => {
            this.batch = b.batchCode;
            this.redraw();
          },
          bg: this.batch === b.batchCode ? INK : 'transparent',
          fg: this.batch === b.batchCode ? PAPER : INK,
        })) ?? [],
      carrier: o?.shipment?.carrier ?? 'Set when sealing',
      tracking: o?.shipment?.trackingNumber ?? 'Set when sealing',
      blockers: p?.blockers.map((code) => ({
        code,
        text: 'Resolve this server check before sealing.',
      })) ?? [{ code: 'NOT_LOADED', text: 'Select a captured order.' }],
      seal: () => this.actions.seal(),
      sealLabel: o?.shipment
        ? `Shipment ${o.shipment.status}`
        : this.busy
          ? 'Saving…'
          : p?.attestation && p.attestation.status !== 'match'
            ? 'Review attestation / override'
            : 'Review and seal order',
      sealBg: p?.canSeal ? VIOLET : 'rgba(21,19,29,.08)',
      sealFg: p?.canSeal ? '#fff' : '#625e70',
      ledger:
        this.proof?.entries.map((e) => ({
          seq: e.seq,
          type: e.type,
          hash: e.entry_hash?.slice(0, 12) ?? '—',
        })) ?? [],
      ledgerStatus: this.proof ? (this.proof.verified ? 'verified' : 'FAILED') : 'not loaded',
    };
    const detail = this.dispute?.dispute,
      pack = this.dispute?.packs[0],
      draft = pack;
    const dd = {
      reason: detail?.reason ?? 'No dispute selected',
      stage: detail ? `${detail.lifeCycleStage ?? '—'} · ${detail.status}` : '—',
      quote:
        detail?.messages.find((m) => m.postedBy === 'BUYER')?.content ??
        'No retained buyer message.',
      timeline: this.dispute?.timeline.map((e) => `${e.type} · ${e.server_time}`) ?? [],
      packStatus: pack?.status ?? 'not drafted',
      rec: pack?.recommendation ?? 'not drafted',
      headline: draft?.narrative ?? 'Build an evidence pack from the current order records.',
      items: draft?.files.map((f) => `${f.filename} · ${f.sha256}`) ?? [],
      isOffer: pack?.recommendation === 'make_offer',
      offers: (detail?.allowedResponseOptions?.makeOffer?.offerTypes ?? []).map((label) => ({
        label,
        pick: () => {
          this.selectedOffer = label;
          this.redraw();
        },
        bg: this.selectedOffer === label ? INK : 'transparent',
        fg: this.selectedOffer === label ? PAPER : INK,
      })),
      call: pack
        ? `Pack ${pack.id} · ${pack.status}. Review exact contents before approval.`
        : 'A draft does not authorize a PayPal action.',
      btn: this.busy
        ? 'Saving…'
        : pack?.status === 'draft'
          ? 'Review evidence pack →'
          : pack
            ? `Pack ${pack.status} · view status`
            : 'Build evidence pack',
      btnBg: VIOLET,
      act: () => this.actions.dispute(),
      note: 'Every action requires your approval. PayPal decides disputes. Sandbox acceptance remains pending.',
    };
    const primary = h?.stats.primary;
    const hypothesisView = {
      status: h?.status ?? (this.loading ? 'Loading…' : 'No hypothesis'),
      strength: h?.strength ?? '—',
      dimension: h ? (primary?.dimension ?? 'Hypothesis') : 'No shared cause',
      value: primary?.value ?? '—',
      label: h?.cluster.label ?? 'available',
      explanation:
        h?.explanation ??
        'A provider-backed complaint scan is required. No example hypothesis is shown as a real result.',
      pillBg: 'oklch(0.93 0.07 85)',
      pillFg: INK,
      chartLabel: primary
        ? `${primary.n + primary.nRest} delivered orders · dots illustrate complaint counts (max 70)`
        : 'No observed chart data',
      chart: primary
        ? [
            primary,
            ...h!.alternatives.filter(
              (t) => t.dimension === primary.dimension && t.value !== primary.value,
            ),
          ]
            .slice(0, 4)
            .map((b) => ({
              label: `${b.value} · ${b.n}`,
              dots: Array.from({ length: Math.min(70, b.k) }, (_, i) => ({
                x: (i % 14) * 12 + 1,
                y: Math.floor(i / 14) * 12 + 1,
              })),
            }))
        : [],
      ratio: primary ? primary.rateRatio.toFixed(1) + '×' : '—',
      q: primary?.q.toPrecision(3) ?? '—',
      p: primary?.p.toPrecision(3) ?? '—',
      share: primary && primary.n ? percent(primary.k / primary.n) : '—',
      testsLabel: h ? `BH q across ${h.stats.testsRun} values tested` : 'No tests available',
      wilsonLabel: primary
        ? `Wilson 95% ${primary.wilson95.map((v) => percent(v)).join('–')}`
        : 'No interval available',
      confounders: h
        ? h.stats.confounders.spread
            .map(
              (v) => `${v.dimension}: ${v.distinctValues} values, top share ${percent(v.topShare)}`,
            )
            .join(' · ') +
          ` · Listing change: ${h.stats.confounders.coincidesWithListingChange ? 'yes' : 'no'}`
        : 'Code computes statistics; models describe the complaints.',
      n: primary?.n ?? '—',
      nRest: primary?.nRest ?? '—',
      k: primary?.k ?? '—',
      kRest: primary?.kRest ?? '—',
      exposure: primary?.exposureDays ?? '—',
      exposureRest: primary?.exposureDaysRest ?? '—',
      shareInterval: primary
        ? `${percent(primary.n ? primary.k / primary.n : 0)} (${primary.wilson95.map((n) => percent(n)).join('–')})`
        : '—',
      restInterval: primary
        ? `${percent(primary.nRest ? primary.kRest / primary.nRest : 0)} (${primary.wilson95Rest.map((n) => percent(n)).join('–')})`
        : '—',
      unshipped: h?.affected.unshipped.length ?? 0,
      inTransit: h?.affected.inTransit.length ?? 0,
      delivered: h?.affected.deliveredNoComplaint.length ?? 0,
      openDisputes: h?.affected.openDisputes.length ?? 0,
      actions:
        h?.actions.map((a) => ({
          type: a.type,
          text: a.type.replaceAll('_', ' '),
          sub: `Status: ${a.status}. Review the proposed payload before approval.`,
          btn: a.status === 'proposed' ? 'Review and approve' : a.status,
          bg: INK,
          fg: PAPER,
          go: () => this.actions.approve(a),
        })) ?? [],
      inspCount: `${h ? (this.actions.submittedInspections[h.id]?.length ?? 0) : 0} photos submitted this session`,
      units: [0, 1, 2].map((i) => ({
        label: `unit ${i + 1}`,
        sub:
          h && this.actions.submittedInspections[h.id]?.[i]
            ? 'Submitted � server verification pending'
            : 'Tap to capture',
        fg: '#625e70',
        bg: 'transparent',
        bd: '1.5px dashed rgba(21,19,29,.3)',
        shoot: () => this.actions.inspect(),
      })),
      inspNote:
        'Capture distinct stock units. Confirmation checks actual server attestations; local clicks never count as inspections.',
      confLabel: h?.status === 'confirmed' ? 'Confirmed' : 'Confirm shared cause',
      confBg: VIOLET,
      confFg: '#fff',
      confirm: () => this.actions.decide('confirm'),
      dismiss: () => this.actions.decide('dismiss'),
    };
    const f = this.report?.fulfilment;
    return {
      isOrders: this.route.view === 'orders',
      isPack: this.route.view === 'pack',
      isDisputes: this.route.view === 'disputes',
      isSc: this.route.view === 'shared-causes',
      isReport: this.route.view === 'store-report',
      tabs: [
        ['orders', 'Orders', this.orders.length],
        ['pack', 'Pack Station', ''],
        ['disputes', 'Dispute Room', this.disputes.length],
        ['shared-causes', 'Shared Cause', this.hypotheses.length],
        ['store-report', 'Store Report', ''],
      ].map(([view, label, n]) => ({
        label,
        n: n || '',
        go: () => this.navigate({ view: view as Route['view'] }),
        bg: this.route.view === view ? INK : 'transparent',
        fg: this.route.view === view ? PAPER : INK,
      })),
      filters: filters.map(([key, label]) => ({
        label,
        go: () => {
          this.filter = key!;
          this.redraw();
        },
        bg: this.filter === key ? INK : 'transparent',
        fg: this.filter === key ? PAPER : INK,
      })),
      rows,
      o: orderView,
      p: packView,
      dd,
      sc: hypothesisView,
      disputes: this.disputes.map((d) => ({
        id: d.id,
        status: d.status,
        title: d.reason.replaceAll('_', ' '),
        sub: `${shortId(d.orderId ?? undefined)} · due ${d.dueAt ?? 'unknown'}`,
        pick: () => this.navigate({ view: 'disputes', id: d.id }),
        bg: detail?.id === d.id ? INK : '#fbfafd',
        fg: detail?.id === d.id ? PAPER : INK,
      })),
      storeLabel: `Neel Block Prints · ${this.report?.facts.domain ?? 'domain not loaded'} · seeded demo data; real checkout records are separate`,
      causeHeadline: currentCause?.headline ?? 'No shared cause available',
      causeSummary: currentCause
        ? 'Review the observed statistics and proposed actions.'
        : 'Configure the model provider and run a complaint scan to populate this view.',
      scTag: currentCause ? `${currentCause.strength} · ${currentCause.status}` : 'none',
      goSc: () =>
        this.navigate({ view: 'shared-causes', ...(currentCause ? { id: currentCause.id } : {}) }),
      gapHeadline: gap?.message ?? 'No unacknowledged alerts',
      gapNote: gap
        ? 'Acknowledging this alert does not send a message or resolve the delivery issue.'
        : 'The watchdog checks the recorded shipment scans.',
      gapTag: gap ? 'open' : 'clear',
      gapBtn: gap ? 'Acknowledge' : 'Refresh',
      ackGap: () =>
        gap ? void this.mutate(`/api/merchant/alerts/${gap.id}/ack`, {}) : void this.refresh(),
      ordersNote: this.loading
        ? 'Loading orders…'
        : `${rows.length} of ${this.orders.length} loaded orders. Seeded PayPal identifiers are synthetic; only checkout produces actual sandbox payments.`,
      metrics: [
        { v: f?.ordersSealed90d ?? '—', k: 'orders sealed in 90 days' },
        {
          v:
            f?.medianHoursCaptureToSeal == null
              ? '—'
              : `${f.medianHoursCaptureToSeal.toFixed(1)} h`,
          k: 'median capture to seal',
        },
        { v: percent(f?.pctTrackingWithin72h), k: 'tracking pushed within 72 h' },
        { v: percent(f?.pctWithPackingEvidence), k: 'orders with packing evidence' },
        { v: percent(f?.disputeRate90d), k: 'dispute rate, 90 days' },
        { v: f?.proactiveFixes90d ?? '—', k: 'proactive fixes, 90 days' },
      ],
      reportBand: this.report?.band ?? 'Not loaded',
      indigoBand: this.comparisons.indigo?.band ?? 'Not loaded',
      quickBand: this.comparisons.quick?.band ?? 'Not loaded',
      quickNote: this.comparisons.quick
        ? `${this.comparisons.quick.fulfilment.unansweredNotReceived} unanswered not-received complaints.`
        : 'Comparison report not loaded.',
      reviewsLabel: this.report
        ? `${this.report.reviews.count} verified-payment reviews · ${this.report.reviews.average?.toFixed(1) ?? '—'} average · actual retained reviews below`
        : 'Reviews not loaded',
      reviews: this.reviews.map((r) => ({
        text: r.text,
        rating: `${r.rating}/5`,
        reply: r.merchantReply,
      })),
      log: this.logs,
      logEmpty:
        this.error ||
        (this.loading
          ? 'Loading Fairfold records…'
          : 'Ready. Activity shows actual Fairfold API responses.'),
      dockOpen: this.dock,
      dockTag: this.error
        ? 'Needs attention · show'
        : this.dock
          ? 'hide'
          : `${this.logs.length} requests · show`,
      toggleDock: () => {
        this.dock = !this.dock;
        this.pinned = this.dock;
        this.redraw();
      },
      error: this.error,
      status:
        this.error || (this.busy ? 'Saving…' : this.loading ? 'Loading…' : 'Connected to Fairfold'),
      retry: () => void this.refresh(),
    };
  }
}
const host = document.querySelector('#dc-root .sc-host');
const template = document.getElementById('ff-console');
if (host && template instanceof HTMLTemplateElement) window.DCLite.mount(host, template, Console);
