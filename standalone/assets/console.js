/* Fairfold console: the design export's component logic, unchanged, mounted with dc-lite.
 *
 * Layout fixes applied to the template in "Fairfold Console.html" (everything else is the design):
 *   - status column 110px -> 128px (x2)
 *   - orders table scroll wrapper
 *   - inspection tiles shrink
 *   - inspection tile label wraps
 *   - pack tile label wraps
 *   - main reserves dock height
 *   - dock marker
 *   - dock log scrolls
 *   - dock time column
 *   - console label hides on phones
 * Behaviour added around the design's class (ConsoleView, at the end): the sandbox-calls dock folds
 * back to its bar 5 s after a call unless hovered or opened by hand.
 */
class Component extends DCLogic {
  state = { view: 'orders', filter: 'all', oid: 'FF-3D90', sc: 'open', hold: false, rule: false, msgs: false, insp: 0, photos: {}, att: 0, batch: 'B17', sealed: false, did: 'D1', d1: 'draft', d2: 'draft', offer: 'REFUND_WITH_REPLACEMENT', ack: false, log: [], dock: false, ledger: [{ seq: '01', type: 'captured', hash: '9f3ac21e04b7…' }] };

  ORDERS = [
    { id: 'FF-8C41', buyer: 'Maya H.', item: 'Block-print cotton hoodie · B17', amt: '$38.00', st: 'delivered', band: 'grey', prot: 'ELIGIBLE', dispute: 'D1' },
    { id: 'FF-3D90', buyer: 'Alex R.', item: 'Block-print cotton hoodie', amt: '$38.00', st: 'captured', band: 'yellow', prot: 'ELIGIBLE' },
    { id: 'FF-51B7', buyer: 'Jonas W.', item: 'Block-print cotton hoodie', amt: '$38.00', st: 'captured', band: 'green', prot: 'ELIGIBLE' },
    { id: 'FF-77A2', buyer: 'Priyanka S.', item: 'Block-print cotton hoodie × 2', amt: '$76.00', st: 'captured', band: 'grey', prot: 'PARTIALLY_ELIGIBLE' },
    { id: 'FF-1C55', buyer: 'Dana L.', item: 'Block-print cotton hoodie', amt: '$38.00', st: 'captured', band: 'red', prot: 'ELIGIBLE' },
    { id: 'FF-2A9C', buyer: 'Elena K.', item: 'Block-print cotton hoodie · B17', amt: '$38.00', st: 'shipped', band: 'green', prot: 'ELIGIBLE' },
    { id: 'FF-6E12', buyer: 'Tom B.', item: 'Hand-block T-shirt', amt: '$12.00', st: 'shipped', band: 'green', prot: 'ELIGIBLE' },
    { id: 'FF-90F3', buyer: 'Sam O.', item: 'Block-print cotton hoodie · B16', amt: '$38.00', st: 'delivered', band: 'green', prot: 'ELIGIBLE' },
    { id: 'FF-4B08', buyer: 'Chris P.', item: 'Hand-block T-shirt', amt: '$12.00', st: 'delivered', band: 'green', prot: 'ELIGIBLE', dispute: 'D2' }
  ];

  SIG = {
    grey: { c: 'oklch(0.72 0.012 290)', pos: '12.5%', acct: 'VERIFIED', rec: 'Ship normally with standard packing evidence.', reasons: [{ code: 'NOT_ENOUGH_DATA', text: 'No earlier orders with this store and no network record. A new buyer is never red.' }] },
    green: { c: 'oklch(0.64 0.15 155)', pos: '37.5%', acct: 'VERIFIED', rec: 'Ship normally.', reasons: [{ code: 'OWN_HISTORY_CLEAN', text: '3 or more delivered orders with this store, no disputes' }, { code: 'PAYER_VERIFIED', text: 'PayPal account_status is VERIFIED' }] },
    yellow: { c: 'oklch(0.8 0.15 85)', pos: '62.5%', acct: 'VERIFIED', rec: 'Capture extra packing evidence and ship tracked.', reasons: [{ code: 'OWN_DISPUTES_LOST', text: 'One earlier dispute with this store was decided for the seller' }, { code: 'OWN_REFUND_RATIO', text: 'More than half of earlier orders were refunded' }, { code: 'NEW_ADDRESS', text: 'Ship-to differs from every earlier order' }] },
    red: { c: 'oklch(0.62 0.2 25)', pos: '87.5%', acct: 'UNVERIFIED', rec: 'Ship with signature confirmation and full packing evidence; confirm the address with the buyer.', reasons: [{ code: 'OWN_DISPUTES_FILED', text: '3 disputes filed with this store in 12 months' }, { code: 'VELOCITY', text: '3 orders in 24 hours to this ship-to address' }, { code: 'NETWORK_DISPUTES_LOST · SIMULATED', text: '2 or more disputes lost across merchants. Network tier is simulated in this build.' }] }
  };

  api(m, p, c) { this.setState(s => ({ dock: true, log: [{ m, p, c, t: new Date().toISOString().slice(11, 19) }, ...s.log].slice(0, 7) })); }

  async append(type, payload) {
    let hash;
    try {
      const prev = this.state.ledger[this.state.ledger.length - 1].hash;
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prev + JSON.stringify({ type, payload, t: Date.now() })));
      hash = Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12) + '…';
    } catch (e) { hash = Math.random().toString(16).slice(2, 14) + '…'; }
    this.setState(s => ({ ledger: [...s.ledger, { seq: String(s.ledger.length + 1).padStart(2, '0'), type, hash }] }));
  }

  async shoot(label) {
    if (this.state.photos[label] || this.state.sealed) return;
    const photos = { ...this.state.photos, [label]: new Date().toISOString().slice(11, 19) };
    this.setState({ photos });
    await this.append('photo', { label });
    if (photos.item && photos.size_label && photos.batch_label && this.state.att === 0) {
      this.setState({ att: 1 });
      setTimeout(async () => { this.setState({ att: 2 }); await this.append('attestation', { status: 'match' }); }, 1300);
    }
  }

  blockers() {
    const s = this.state, b = [];
    if (s.att !== 2) b.push({ code: 'ATTESTATION_PENDING', text: 'Capture item, size_label and batch_label so the Evidence Agent can check them against the order.' });
    if (s.batch !== 'B17') b.push({ code: '409 BATCH_MISMATCH', text: 'The batch tag in the photo reads B17, which differs from the code entered.' });
    if (!s.photos.sealed_parcel) b.push({ code: 'SEALED_PARCEL_MISSING', text: 'Photograph the sealed parcel with its courier label visible.' });
    if ((s.hold || s.rule) && !s.photos.seam_closeup) b.push({ code: s.hold ? '409 ORDER_HELD' : '409 INSPECTION_REQUIRED', text: 'An inspection rule covers batch B17. Add a seam_closeup photo that shows no defect.' });
    return b;
  }

  async seal() {
    if (this.state.sealed || this.blockers().length) return;
    this.setState({ sealed: true });
    await this.append('sealed', { batch: 'B17' });
    this.api('POST', '/v2/checkout/orders/5O190127TN36/track', 201);
    await this.append('tracking_pushed', { carrier: 'DHL' });
  }

  renderVals() {
    const s = this.state, set = p => () => this.setState(p), V = 'oklch(0.53 0.23 295)', INK = '#15131d', PAPER = '#f3f1f6';
    const stripes = 'repeating-linear-gradient(135deg,rgba(21,19,29,.12) 0 5px,rgba(21,19,29,.03) 5px 10px)';
    const stOf = o => o.id === 'FF-3D90' && s.sealed ? 'shipped' : o.st === 'captured' && s.hold && o.id !== 'FF-3D90' ? 'held' : o.st;
    const ST = { captured: ['To pack', 'oklch(0.94 0.035 295)', 'oklch(0.4 0.2 295)'], held: ['Held · B17', INK, PAPER], shipped: ['In transit', 'oklch(0.93 0.02 290)', INK], delivered: ['Delivered', 'oklch(0.9 0.08 155)', 'oklch(0.33 0.09 155)'] };
    const openD = (s.d1 === 'draft' ? 1 : 0) + (s.d2 === 'draft' ? 1 : 0);
    const tabs = [['orders', 'Orders', '18'], ['pack', 'Pack Station', ''], ['disputes', 'Dispute Room', String(openD || '')], ['sc', 'Shared Cause', s.sc === 'open' ? '1' : ''], ['report', 'Store Report', '']]
      .map(([k, label, n]) => ({ label, n, go: set({ view: k }), bg: s.view === k ? INK : 'transparent', fg: s.view === k ? PAPER : INK }));
    const fl = { all: () => true, pack: o => stOf(o) === 'captured', held: o => stOf(o) === 'held', transit: o => stOf(o) === 'shipped', delivered: o => stOf(o) === 'delivered', disputed: o => !!o.dispute };
    const filters = [['all', 'All'], ['pack', 'To pack'], ['held', 'Held'], ['transit', 'In transit'], ['delivered', 'Delivered'], ['disputed', 'Disputed']]
      .map(([k, label]) => ({ label, go: set({ filter: k }), bg: s.filter === k ? INK : 'transparent', fg: s.filter === k ? PAPER : INK }));
    const rows = this.ORDERS.filter(fl[s.filter]).map(o => {
      const st = ST[stOf(o)];
      return { id: o.id, buyer: o.buyer, item: o.item, amt: o.amt, st: o.dispute ? st[0] + ' · dispute' : st[0], stBg: st[1], stFg: st[2], band: o.band[0].toUpperCase() + o.band.slice(1), bandC: this.SIG[o.band].c, bg: o.id === s.oid ? 'oklch(0.95 0.028 295)' : 'transparent', pick: set({ oid: o.id }) };
    });
    const O = this.ORDERS.find(o => o.id === s.oid) || this.ORDERS[1], sg = this.SIG[O.band], ost = stOf(O);
    const o = {
      id: O.id, st: ST[ost][0], amt: O.amt, buyer: O.buyer, item: O.item, band: O.band[0].toUpperCase() + O.band.slice(1), pos: sg.pos, acct: sg.acct, reasons: sg.reasons, rec: sg.rec,
      prot: O.prot + (O.prot === 'ELIGIBLE' ? ' · INR, UNAUTHORIZED' : ''),
      ledger: ost === 'captured' || ost === 'held' ? '1 entry · verified' : '6 entries · chain verified',
      cta: O.dispute ? 'Open in Dispute Room →' : ost === 'captured' || ost === 'held' ? 'Open Pack Station →' : 'View shared cause →',
      go: O.dispute ? set({ view: 'disputes', did: O.dispute }) : ost === 'captured' || ost === 'held' ? set({ view: 'pack' }) : set({ view: 'sc' })
    };

    // pack station
    const labels = ['item', 'size_label', 'batch_label', 'sealed_parcel'].concat(s.hold || s.rule ? ['seam_closeup'] : []);
    const bl = this.blockers(), done = labels.filter(l => s.photos[l]).length;
    const p = {
      ruleOn: s.hold || s.rule, ruleTag: s.hold ? 'Order held · inspection rule active' : 'Inspection rule active', count: done + ' / ' + labels.length,
      tiles: labels.map(l => ({ label: l, sub: s.photos[l] ? 'hashed · ' + s.photos[l] + 'Z' : 'Tap to capture', bg: s.photos[l] ? stripes : 'transparent', bd: s.photos[l] ? '1px solid rgba(21,19,29,.12)' : '1.5px dashed rgba(21,19,29,.3)', shoot: () => this.shoot(l) })),
      attPill: s.att === 2 ? 'match · 0.94' : s.att === 1 ? 'checking…' : 'waiting', attBg: s.att === 2 ? 'oklch(0.9 0.08 155)' : 'rgba(21,19,29,.08)', attFg: s.att === 2 ? 'oklch(0.33 0.09 155)' : INK,
      attNote: s.att === 2 ? 'Checked against the PayPal order. Below the confidence threshold it would say “could not verify” and ask you to confirm.' : s.att === 1 ? 'Comparing the photos with the order’s line items…' : 'Capture item, size_label and batch_label. The model only describes what is visible; code decides the match.',
      attLines: s.att === 2 ? [{ k: 'Seen', v: 'navy block-print hoodie, size M, qty 1' }, { k: 'Batch tag', v: 'B17' }, { k: 'Defects', v: 'none visible' }].concat(s.photos.sealed_parcel ? [{ k: 'Courier label', v: 'tracking number matches' }] : []).concat(s.photos.seam_closeup ? [{ k: 'Inspection', v: 'left sleeve seam intact · defectVisible: false' }] : []) : [],
      batches: ['B15', 'B16', 'B17'].map(b => ({ label: b, pick: set({ batch: b }), bg: s.batch === b ? INK : 'transparent', fg: s.batch === b ? PAPER : INK })),
      blockers: s.sealed ? [] : bl, seal: () => this.seal(),
      sealLabel: s.sealed ? 'Sealed · tracking pushed to PayPal ✓' : bl.length ? 'Seal blocked · ' + bl.length + ' to resolve' : 'Seal and push tracking',
      sealBg: s.sealed ? 'oklch(0.9 0.08 155)' : bl.length ? 'rgba(21,19,29,.08)' : V, sealFg: s.sealed ? 'oklch(0.33 0.09 155)' : bl.length ? '#625e70' : '#fff',
      ledger: s.ledger
    };

    // disputes
    const rec1 = s.sc === 'open' ? 'inspect_first' : s.sc === 'confirmed' ? 'make_offer' : 'provide_evidence';
    const D = {
      D1: { id: 'PP-D-27803', status: s.d1 === 'draft' ? 'WAITING' : 'SUBMITTED', title: 'Maya H. · torn seam', sub: 'FF-8C41 · $38.00 · response due in 9 days' },
      D2: { id: 'PP-D-27641', status: s.d2 === 'draft' ? 'WAITING' : 'SUBMITTED', title: 'Chris P. · not received', sub: 'FF-4B08 · $12.00 · response due in 6 days' }
    };
    const disputes = ['D1', 'D2'].map(k => ({ ...D[k], pick: set({ did: k }), bg: s.did === k ? INK : '#fbfafd', fg: s.did === k ? PAPER : INK }));
    const sub1 = s.d1 !== 'draft', sub2 = s.d2 !== 'draft';
    const dd = s.did === 'D1' ? {
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', stage: 'INQUIRY · WAITING_FOR_SELLER_RESPONSE', quote: '“The left sleeve seam came apart the first time I wore it.”',
      timeline: ['CUSTOMER.DISPUTE.CREATED received, signature verified', 'Dispute re-fetched by id and mapped to FF-8C41 through the capture id', 'Complaint Reader: product_defect · left sleeve seam · stitching came apart', 'Joined the open B17 cluster as its sixth complaint'].concat(s.sc === 'confirmed' ? ['B17 confirmed by inspection. Pack rebuilt.'] : s.sc === 'dismissed' ? ['B17 hypothesis dismissed. Pack rebuilt.'] : []),
      packStatus: sub1 ? 'submitted' : 'draft', rec: rec1, isOffer: rec1 === 'make_offer' && !sub1,
      headline: rec1 === 'inspect_first' ? 'Inspect batch B17 before answering. The response is due in more than 48 hours.' : rec1 === 'make_offer' ? 'The batch fault is confirmed. Offer a remedy instead of contesting.' : 'Packing evidence is clean. File it and let PayPal decide.',
      items: rec1 === 'inspect_first' ? ['Linked hypothesis is open: batch B17, left sleeve seam', 'Pack attestation was a match with no visible defects', 'Nothing is filed until you choose'] : rec1 === 'make_offer' ? ['1 of 3 inspected B17 units shows the same open stitch', 'Shared cause stays internal; it is never put into filed evidence', 'Winning is unlikely, and an early offer avoids escalation'] : ['4 packing photos, each with SHA-256 and server time', 'Attestation: match, no visible defects', 'Ledger check: 6 entries, chain verified', 'Listing text v1 and return policy'],
      offers: ['REFUND_WITH_REPLACEMENT', 'REPLACEMENT_WITHOUT_REFUND', 'REFUND'].map(f => ({ label: f, pick: set({ offer: f }), bg: s.offer === f ? INK : 'transparent', fg: s.offer === f ? PAPER : INK })),
      call: rec1 === 'inspect_first' ? '409 PACK_NOT_ACTIONABLE until the inspection is done' : rec1 === 'make_offer' ? 'POST /v1/customer/disputes/PP-D-27803/make-offer  { offer_type: ' + s.offer + ' }' : 'POST /v1/customer/disputes/PP-D-27803/provide-evidence  { evidence_type: OTHER, file1: evidence.pdf }',
      btn: sub1 ? 'Submitted to PayPal ✓' : rec1 === 'inspect_first' ? 'Go to the B17 inspection →' : rec1 === 'make_offer' ? 'Approve and make offer' : 'Approve and file evidence',
      btnBg: sub1 ? 'oklch(0.5 0.12 155)' : V,
      act: sub1 ? () => {} : rec1 === 'inspect_first' ? set({ view: 'sc' }) : () => { this.setState({ d1: 'submitted' }); this.api('POST', '/v1/customer/disputes/PP-D-27803/' + (rec1 === 'make_offer' ? 'make-offer' : 'provide-evidence'), 200); },
      note: 'Nothing is filed automatically. PayPal decides every dispute.'
    } : {
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', stage: 'INQUIRY · WAITING_FOR_SELLER_RESPONSE', quote: '“Tracking says delivered but I never got the parcel.”',
      timeline: ['Picked up by the one-minute reconciliation poll', 'Mapped to FF-4B08 through the capture id', 'Tracking was pushed to PayPal at seal; a delivered scan exists'],
      packStatus: sub2 ? 'submitted' : 'draft', rec: 'provide_evidence', isOffer: false, offers: [],
      headline: 'Tracking was pushed and a delivered scan exists. File proof of fulfilment.',
      items: ['PROOF_OF_FULFILLMENT with carrier and tracking number', 'Evidence PDF: sealed-parcel photo, attestation, ledger check', 'Seller protection: ELIGIBLE for ITEM_NOT_RECEIVED'],
      call: 'POST /v1/customer/disputes/PP-D-27641/provide-evidence  { evidence_type: PROOF_OF_FULFILLMENT, tracking_info: [{ carrier_name: DHL }] }',
      btn: sub2 ? 'Submitted to PayPal ✓' : 'Approve and file evidence', btnBg: sub2 ? 'oklch(0.5 0.12 155)' : V,
      act: sub2 ? () => {} : () => { this.setState({ d2: 'submitted' }); this.api('POST', '/v1/customer/disputes/PP-D-27641/provide-evidence', 200); },
      note: 'Nothing is filed automatically. PayPal decides every dispute.'
    };

    // shared cause
    const ok = (on, label, go) => ({ btn: on ? 'Approved ✓' : label, bg: on ? 'oklch(0.9 0.08 155)' : INK, fg: on ? 'oklch(0.33 0.09 155)' : PAPER, go: on ? () => {} : go });
    const lvl = s.sc === 'confirmed' ? 'confirmed' : 'suspected';
    const actions = [
      { type: 'hold_orders', text: 'Hold 18 unshipped hoodie orders', sub: 'Held orders cannot be sealed until a seam photo passes.', ...ok(s.hold, 'Approve hold', set({ hold: true })) },
      { type: 'add_inspection_rule', text: 'Require a seam_closeup photo for batch B17', sub: 'The Pack Station demands the photo before it will seal.', ...ok(s.rule, 'Approve rule', set({ rule: true })) },
      { type: 'send_buyer_messages', text: '38 drafts at the “' + lvl + '” level', sub: lvl === 'confirmed' ? '“We found a stitching fault in one production batch…” 4 in transit, 34 delivered.' : '“We’re checking a possible issue with some recent hoodies…” 4 in transit, 34 delivered.', ...ok(s.msgs, 'Approve and send', () => { this.setState({ msgs: true }); this.api('POST', '/v1/customer/disputes/PP-D-27803/send-message', 200); }) }
    ].concat(s.sc === 'confirmed' ? [{ type: 'propose_offers', text: 'Rebuild the pack for 1 open dispute as an offer', sub: 'Maya’s dispute now recommends make_offer.', btn: 'Open Dispute Room →', bg: V, fg: '#fff', go: set({ view: 'disputes', did: 'D1' }) }] : []);
    const res = ['defectVisible: false', 'defectVisible: true', 'defectVisible: false'];
    const sc = {
      status: s.sc, pillBg: s.sc === 'confirmed' ? 'oklch(0.62 0.2 25)' : s.sc === 'dismissed' ? 'rgba(21,19,29,.1)' : 'oklch(0.93 0.07 85)', pillFg: s.sc === 'confirmed' ? '#fff' : s.sc === 'dismissed' ? INK : 'oklch(0.38 0.08 85)',
      actions, inspCount: s.insp + ' / 3 inspected',
      units: [0, 1, 2].map(i => ({ label: 'unit ' + (i + 1), sub: i < s.insp ? res[i] : 'Tap to capture', fg: i < s.insp && i === 1 ? 'oklch(0.5 0.19 25)' : '#625e70', bg: i < s.insp ? stripes : 'transparent', bd: i < s.insp ? (i === 1 ? '1.5px solid oklch(0.62 0.2 25)' : '1px solid rgba(21,19,29,.12)') : '1.5px dashed rgba(21,19,29,.3)', shoot: () => { if (s.insp === i) this.setState({ insp: i + 1 }); } })),
      inspNote: s.sc === 'confirmed' ? 'Confirmed: 1 defective of ' + s.insp + ' inspected. Offers are proposed for open disputes and messages move to the confirmed wording.' : s.sc === 'dismissed' ? 'Dismissed. A release of the held orders is proposed.' : s.insp < 2 ? 'Photograph the left sleeve seam on units from B17 stock. The Evidence Agent checks each for the cluster’s failure mode. At least one defective unit is needed to confirm.' : 'Unit 2 shows an open stitch on the left sleeve seam, matching the cluster. You can confirm.',
      confLabel: s.sc === 'confirmed' ? 'Confirmed ✓' : 'Confirm shared cause', confBg: s.sc === 'confirmed' ? 'oklch(0.9 0.08 155)' : s.insp >= 2 && s.sc === 'open' ? V : 'rgba(21,19,29,.08)', confFg: s.sc === 'confirmed' ? 'oklch(0.33 0.09 155)' : s.insp >= 2 && s.sc === 'open' ? '#fff' : '#625e70',
      confirm: () => { if (s.insp >= 2 && s.sc === 'open') this.setState({ sc: 'confirmed', msgs: false }); },
      dismiss: set({ sc: 'dismissed', hold: false, rule: false })
    };

    const metrics = [{ v: '319', k: 'orders sealed in 90 days' }, { v: '19 h', k: 'median capture to seal' }, { v: '96%', k: 'tracking pushed within 72 h' }, { v: '94%', k: 'orders with packing evidence' }, { v: '0.6%', k: 'dispute rate, 90 days' }, { v: s.sc === 'confirmed' && s.msgs ? '1' : '0', k: 'proactive fixes, 90 days' }];

    return {
      isOrders: s.view === 'orders', isPack: s.view === 'pack', isDisputes: s.view === 'disputes', isSc: s.view === 'sc', isReport: s.view === 'report',
      tabs, filters, rows, o, p, disputes, dd, sc, metrics,
      goSc: set({ view: 'sc' }), scTag: s.sc === 'open' ? 'strong · open' : s.sc,
      gapTag: s.ack ? 'acknowledged' : 'open', gapBtn: s.ack ? 'Acknowledged ✓' : 'Acknowledge', ackGap: set({ ack: true }),
      log: s.log, logEmpty: s.log.length ? '' : 'Seal an order or approve an evidence pack to see the calls here.', dockOpen: s.dock, dockTag: s.dock ? 'hide' : s.log.length + ' calls · show', toggleDock: set({ dock: !s.dock })
    };
  }
}

// The sandbox-calls dock floats over the page. As in the design it opens whenever a PayPal call is
// made; it now folds back to its bar after a few seconds so it does not sit on top of the content,
// unless the pointer is over it or it was opened by hand.
class ConsoleView extends Component {
  api(m, p, c) {
    super.api(m, p, c);
    clearTimeout(this.dockTimer);
    if (!this.dockPinned) this.dockTimer = setTimeout(() => this.foldDock(), 5000);
  }
  foldDock() {
    if (this.dockHover || this.dockPinned) { this.dockTimer = setTimeout(() => this.foldDock(), 1500); return; }
    if (this.state.dock) this.setState({ dock: false });
  }
  renderVals() {
    const v = super.renderVals(), toggle = v.toggleDock;
    v.toggleDock = () => { clearTimeout(this.dockTimer); this.dockPinned = !this.state.dock; toggle(); };
    return v;
  }
  // on narrow screens the tab strip scrolls: keep the active tab in view when the view changes
  componentDidUpdate() {
    if (this.shownView === this.state.view) return;
    this.shownView = this.state.view;
    const nav = document.querySelector('header nav');
    const active = nav && Array.from(nav.children).find(b => /background:#15131d/.test(b.getAttribute('style') || ''));
    if (!active || nav.scrollWidth <= nav.clientWidth) return;
    const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect();
    const left = a.left - n.left + nav.scrollLeft, right = left + a.width;
    if (left < nav.scrollLeft + 12 || right > nav.scrollLeft + nav.clientWidth - 12) nav.scrollTo({ left: Math.max(0, left - (nav.clientWidth - a.width) / 2), behavior: 'smooth' });
  }
}

(function () {
  'use strict';
  var host = document.querySelector('#dc-root .sc-host');
  var view = window.DCLite.mount(host, document.getElementById('ff-console'), ConsoleView);
  var dock = host.querySelector('[data-ff="dock"]');   // always rendered, so it is the same node throughout
  if (!dock) return;
  dock.addEventListener('pointerenter', function () { view.dockHover = true; });
  dock.addEventListener('pointerleave', function () { view.dockHover = false; });

  // keep the page's bottom padding in step with the dock so it never covers the last content
  // (the template reads --ff-dock)
  var root = document.documentElement, last = -1;
  function sync() {
    var h = Math.ceil(dock.getBoundingClientRect().height);
    if (h !== last) { last = h; root.style.setProperty('--ff-dock', h + 'px'); }
  }
  if (window.ResizeObserver) new ResizeObserver(sync).observe(dock);
  sync();
})();
