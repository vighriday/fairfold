/** Data/navigation substitutions only; source CSS, components and animation assets stay intact. */
export function bindTemplate(source: string): string {
  const crlf = source.includes('\r\n');
  let html = source.replaceAll('\r\n', '\n');
  const replace = (from: string, to: string) => {
    if (!html.includes(from)) throw new Error(`Design binding missing: ${from.slice(0, 80)}`);
    html = html.replace(from, to);
  };
  replace('<html lang="en">', '<html lang="en" data-demo="false">');
  html = html.replaceAll('"assets/', '"/assets/');
  replace('href="Fairfold.html"', 'href="/"');
  replace('src="/assets/console.js"', 'type="module" src="/assets/site.js"');
  replace('neelblockprints.example · Jaipur, IN', '{{ storeLabel }}');
  replace('Batch B17: 6 seam complaints on 40 delivered hoodies', '{{ causeHeadline }}');
  replace(
    '1 on 200 from every other batch. 18 unshipped orders could be affected.',
    '{{ causeSummary }}',
  );
  replace('FF-6E12: no courier scan for 4 days', '{{ gapHeadline }}');
  replace('A status update to the buyer is drafted and waits for approval.', '{{ gapNote }}');
  replace(
    'Showing 9 of 342 seeded orders. Only orders created through checkout are real sandbox orders.',
    '{{ ordersNote }}',
  );
  replace('Pack FF-3D90', 'Pack {{ o.id }}');
  replace('for Alex R.', 'for {{ o.buyer }}');
  replace('Block-print cotton hoodie</div>', '{{ p.itemName }}</div>');
  replace('>HD-IND-01</span>', '>{{ p.sku }}</span>');
  replace('>navy</span>', '>{{ p.colour }}</span>');
  replace('>M</span>', '>{{ p.size }}</span>');
  replace(
    '>1</span><span style="color:#625e70">Listing',
    '>{{ p.quantity }}</span><span style="color:#625e70">Listing',
  );
  replace('>v1</span>', '>{{ p.listing }}</span>');
  replace('Buyer signal · yellow', 'Buyer signal · {{ o.band }}');
  replace('Capture extra packing evidence and ship tracked.', '{{ o.rec }}');
  replace(
    'Batch B17: photograph the left sleeve seam before sealing. Label the photo <span style="font-family:\'Geist Mono\',monospace;font-size:13px">seam_closeup</span>.',
    '{{ p.ruleInstruction }}',
  );
  replace(
    '>DHL</span><span style="color:#625e70">Tracking',
    '>{{ p.carrier }}</span><span style="color:#625e70">Tracking',
  );
  replace('>7340 1182 61</span>', '>{{ p.tracking }}</span>');
  replace(
    '>verified</span></div>\n        <div style="margin-top:10px;font:400 11.5px',
    '>{{ p.ledgerStatus }}</span></div>\n        <div style="margin-top:10px;font:400 11.5px',
  );
  replace(
    'Webhooks verified · reconciliation poll every minute',
    'Dispute records · sandbox acceptance tracked separately',
  );
  replace('>strong</span></div>', '>{{ sc.strength }}</span></div>');
  replace('Batch B17, <em', '{{ sc.dimension }}, <em');
  replace('>left sleeve seam</em>', '>{{ sc.label }}</em>');
  replace(
    'Six seam complaints on 40 delivered B17 hoodies, against one on 200 from every other batch. Couriers, packers and listing version are spread evenly, so the batch is the likeliest common factor. Code ran the statistics; the model only read the complaints.',
    '{{ sc.explanation }}',
  );
  replace('240 delivered hoodie orders, by batch', '{{ sc.chartLabel }}');
  // Preserve the supplied dot-chart component. Its dots and labels now follow the returned tests.
  const chartStart = html.indexOf(
    '      <div style="margin-top:22px;display:flex;flex-wrap:wrap;gap:22px 28px',
  );
  const chartEnd = html.indexOf('      <div style="margin-top:26px;display:grid;', chartStart);
  if (chartStart < 0 || chartEnd < 0) throw new Error('Design chart boundary missing');
  html =
    html.slice(0, chartStart) +
    `      <div style="margin-top:22px;display:flex;flex-wrap:wrap;gap:22px 28px;align-items:flex-end">
        <sc-for list="{{ sc.chart }}" as="b"><div>
          <div style="position:relative;width:168px;height:60px;background-image:radial-gradient(circle,rgba(243,241,246,.3) 2.6px,transparent 3.2px);background-size:12px 12px">
            <sc-for list="{{ b.dots }}" as="dot"><span style="position:absolute;left:{{ dot.x }}px;top:{{ dot.y }}px;width:10px;height:10px;border-radius:50%;background:oklch(0.7 0.2 25)"></span></sc-for>
          </div><div style="margin-top:8px;font:500 11px/1 'Geist Mono',monospace;color:rgba(243,241,246,.65)">{{ b.label }}</div>
        </div></sc-for>
      </div>
` +
    html.slice(chartEnd);
  replace('≈31×', '{{ sc.ratio }}');
  replace('>0.0014</div>', '>{{ sc.q }}</div>');
  replace('BH q across 12 values tested', '{{ sc.testsLabel }}');
  replace('>15%</div>', '>{{ sc.share }}</div>');
  replace('complaint share, Wilson 95% 7–29%', '{{ sc.wilsonLabel }}');
  replace(
    'The ringed dot is Maya’s live dispute, the sixth complaint. Confounders: 4 different couriers, both packers, listing v1 throughout, no other value with q ≤ 0.2.',
    '{{ sc.confounders }}',
  );
  replace('<span>B17</span><span>ALL OTHERS', '<span>{{ sc.value }}</span><span>ALL OTHERS');
  replace('<span>40</span><span>200</span>', '<span>{{ sc.n }}</span><span>{{ sc.nRest }}</span>');
  replace(
    '<span>546</span><span>2,800</span>',
    '<span>{{ sc.exposure }}</span><span>{{ sc.exposureRest }}</span>',
  );
  replace(
    '<span style="font-weight:600">6</span><span>1</span>',
    '<span style="font-weight:600">{{ sc.k }}</span><span>{{ sc.kRest }}</span>',
  );
  replace(
    '<span>15% (7–29)</span><span>0.5% (0.1–2.8)</span>',
    '<span>{{ sc.shareInterval }}</span><span>{{ sc.restInterval }}</span>',
  );
  replace('<span>0.00011</span>', '<span>{{ sc.p }}</span>');
  replace(
    '>18</div><div style="font-size:12.5px',
    '>{{ sc.unshipped }}</div><div style="font-size:12.5px',
  );
  replace(
    '>4</div><div style="font-size:12.5px',
    '>{{ sc.inTransit }}</div><div style="font-size:12.5px',
  );
  replace(
    '>34</div><div style="font-size:12.5px',
    '>{{ sc.delivered }}</div><div style="font-size:12.5px',
  );
  replace(
    '>1</div><div style="font-size:12.5px',
    '>{{ sc.openDisputes }}</div><div style="font-size:12.5px',
  );
  replace('>Verified Fulfilment</span>', '>{{ reportBand }}</span>');
  replace(
    '60 verified-payment reviews · 4.4 average · themes link to their reviews',
    '{{ reviewsLabel }}',
  );
  const themesStart = html.indexOf(
    '      <div style="margin-top:6px">',
    html.indexOf('{{ reviewsLabel }}'),
  );
  const themesEnd = html.indexOf('    <div style="flex:1 1 320px;', themesStart);
  if (themesStart < 0 || themesEnd < 0) throw new Error('Design review boundary missing');
  html =
    html.slice(0, themesStart) +
    `      <div style="margin-top:6px">
        <sc-for list="{{ reviews }}" as="r"><div style="padding:12px 0;border-top:1px solid rgba(21,19,29,.08);font-size:14.5px">
          <div style="display:flex;justify-content:space-between;gap:12px"><span>{{ r.text }}</span><span style="color:oklch(0.47 0.22 295);font-weight:600">{{ r.rating }}</span></div>
          <sc-if value="{{ r.reply }}"><div style="margin-top:10px;border-radius:14px;background:#15131d;color:#f3f1f6;padding:12px 14px;font-size:13.5px;line-height:1.5"><span style="font:500 10px/1 'Geist Mono',monospace;letter-spacing:.1em;color:rgba(243,241,246,.65)">MERCHANT REPLY · ALWAYS SHOWN</span><br>{{ r.reply }}</div></sc-if>
        </div></sc-for>
      </div>
    </div>
` +
    html.slice(themesEnd);
  replace('>verified</span></div>', '>{{ reportBand }}</span></div>');
  // Comparison reports are read from the public reports, never from the design's example metrics.
  replace('>verified</span></div>', '>{{ indigoBand }}</span></div>');
  replace('>caution</span></div>', '>{{ quickBand }}</span></div>');
  replace('4 “never arrived” complaints older than 72 hours with no reply.', '{{ quickNote }}');
  replace('AI shopping agent · MCP', 'AI shopping agent · MCP · example workflow');
  replace('search_catalog → 2 stores', 'search_catalog → compare returned stores');
  replace('PayPal sandbox calls', 'Fairfold activity');
  replace(
    '<div style="margin-top:10px;max-height:min(46vh,320px);',
    '<div role="status" style="margin-top:10px;overflow-wrap:anywhere">{{ status }}</div><button sc-camel-on-click="{{ retry }}" style="appearance:none;cursor:pointer;padding:8px 14px;border-radius:999px;border:1px solid rgba(243,241,246,.3);background:transparent;color:#f3f1f6;font:inherit">Refresh records</button><div style="margin-top:10px;max-height:min(46vh,320px);',
  );
  replace('<div id="dc-root">', '<div id="dc-root" aria-live="polite">');
  return crlf ? html.replaceAll('\n', '\r\n') : html;
}
