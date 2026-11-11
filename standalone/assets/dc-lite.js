/* dc-lite: a small runtime for the design export's template syntax, used by the console.
 *
 * The export rendered its templates through a bundled React runtime that had to be unpacked from
 * base64 on every load. This reads the same template (kept verbatim in a <template> element) and
 * supports what it uses: {{ path }} interpolation in text and attributes, <sc-for list as>,
 * <sc-if value>, sc-camel-on-click and style-hover. Interpolated text is wrapped in
 * <span class="sc-interp"> and hover styles become !important :hover classes, both as the export
 * did, so the rendered DOM matches it. Updates patch the live DOM in place, so the design's CSS
 * transitions still run when state changes.
 */
(function () {
  'use strict';

  var INTERP = /\{\{\s*([^}]+?)\s*\}\}/g;
  var nextId = 0;

  function parts(str) {
    var out = [], last = 0, m;
    INTERP.lastIndex = 0;
    while ((m = INTERP.exec(str))) {
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push({ e: m[1] });
      last = INTERP.lastIndex;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  }

  function single(v) { var m = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/.exec(v || ''); return m ? m[1] : null; }

  function evaluate(e, scope) {
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(e)) return +e;
    var path = e.split('.'), v = scope;
    for (var i = 0; i < path.length; i++) { if (v == null) return undefined; v = v[path[i]]; }
    return v;
  }

  function text(v) { return v == null || v === false ? '' : String(v); }

  function join(ps, scope) {
    var s = '';
    for (var i = 0; i < ps.length; i++) s += typeof ps[i] === 'string' ? ps[i] : text(evaluate(ps[i].e, scope));
    return s;
  }

  // hover styles: one !important rule per distinct declaration block, as the export's runtime did
  function hoverSheet(doc) {
    var el = null, cache = {}, n = 0;
    return function (css) {
      if (cache[css]) return cache[css];
      if (!el) { el = doc.createElement('style'); doc.head.appendChild(el); }
      var cls = 'scp' + (n++).toString(36);
      var decl = css.split(';').map(function (d) { return d.trim(); }).filter(Boolean)
        .map(function (d) { return /!\s*important$/i.test(d) ? d : d + ' !important'; }).join(';');
      el.sheet.insertRule('.' + cls + ':hover{' + decl + '}', el.sheet.cssRules.length);
      cache[css] = cls;
      return cls;
    };
  }

  function compile(nodes, hover) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], c = null;
      if (node.nodeType === 3) {
        var ps = parts(node.nodeValue);
        c = { t: 'text', id: nextId++, ps: ps, plain: ps.every(function (p) { return typeof p === 'string'; }) ? node.nodeValue : null };
      } else if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase(), kids = compile(node.childNodes, hover);
        if (tag === 'sc-for') c = { t: 'for', id: nextId++, list: single(node.getAttribute('list')), as: node.getAttribute('as'), kids: kids };
        else if (tag === 'sc-if') c = { t: 'if', id: nextId++, value: single(node.getAttribute('value')), kids: kids };
        else {
          var attrs = [], on = null, cls = null;
          for (var a = 0; a < node.attributes.length; a++) {
            var at = node.attributes[a];
            if (at.name.indexOf('hint-') === 0) continue;
            if (at.name === 'sc-camel-on-click') { on = single(at.value); continue; }
            if (at.name === 'style-hover') { cls = hover(at.value); continue; }
            attrs.push({ n: at.name, ps: parts(at.value) });
          }
          if (cls) {
            var existing = attrs.filter(function (x) { return x.n === 'class'; })[0];
            if (existing) existing.ps.push(' ' + cls); else attrs.push({ n: 'class', ps: [cls] });
          }
          c = { t: 'el', id: nextId++, tag: tag, attrs: attrs, on: on, kids: kids };
        }
      }
      if (c) out.push(c);
    }
    return out;
  }

  // compiled template + values -> lightweight virtual nodes ({ x } for text, { tag, attrs, on, kids })
  function build(tree, scope, out) {
    for (var i = 0; i < tree.length; i++) {
      var n = tree[i];
      if (n.t === 'text') {
        if (n.plain !== null) { out.push({ id: n.id, x: n.plain }); continue; }
        for (var p = 0; p < n.ps.length; p++) {
          var part = n.ps[p];
          if (typeof part === 'string') out.push({ id: n.id + ':' + p, x: part });
          else out.push({ id: n.id + ':' + p, tag: 'span', attrs: { 'class': 'sc-interp' }, on: null, kids: [{ id: n.id + ':' + p + 't', x: text(evaluate(part.e, scope)) }] });
        }
      } else if (n.t === 'for') {
        var list = evaluate(n.list, scope) || [];
        for (var k = 0; k < list.length; k++) { var sc = Object.create(scope); sc[n.as] = list[k]; build(n.kids, sc, out); }
      } else if (n.t === 'if') {
        if (evaluate(n.value, scope)) build(n.kids, scope, out);
      } else {
        var attrs = {};
        for (var a = 0; a < n.attrs.length; a++) attrs[n.attrs[a].n] = join(n.attrs[a].ps, scope);
        var v = { id: n.id, tag: n.tag, attrs: attrs, on: n.on ? evaluate(n.on, scope) : null, kids: [] };
        build(n.kids, scope, v.kids);
        out.push(v);
      }
    }
    return out;
  }

  function create(v, doc) {
    if (v.x !== undefined) return doc.createTextNode(v.x);
    var el = doc.createElement(v.tag);
    for (var k in v.attrs) el.setAttribute(k, v.attrs[k]);
    if (v.on) el.onclick = v.on;
    for (var i = 0; i < v.kids.length; i++) el.appendChild(create(v.kids[i], doc));
    return el;
  }

  // nodes from the same template position are updated in place; anything else is replaced
  function patch(parent, prev, next, doc) {
    var nodes = parent.childNodes;
    for (var i = 0; i < next.length; i++) {
      var a = prev[i], b = next[i], dom = nodes[i];
      if (!a || !dom) { parent.appendChild(create(b, doc)); continue; }
      if (a.id !== b.id || a.tag !== b.tag) { parent.replaceChild(create(b, doc), dom); continue; }
      if (b.x !== undefined) { if (a.x !== b.x) dom.nodeValue = b.x; continue; }
      for (var k in b.attrs) if (a.attrs[k] !== b.attrs[k]) dom.setAttribute(k, b.attrs[k]);
      for (var r in a.attrs) if (!(r in b.attrs)) dom.removeAttribute(r);
      if (dom.onclick !== b.on) dom.onclick = b.on || null;
      patch(dom, a.kids, b.kids, doc);
    }
    while (nodes.length > next.length) parent.removeChild(parent.lastChild);
  }

  // base class with the React-style API the design's component code was written against
  function DCLogic() { this.state = {}; this.props = {}; }
  DCLogic.prototype.setState = function (p) {
    var next = typeof p === 'function' ? p(this.state) : p;
    if (next) this.state = Object.assign({}, this.state, next);
    if (this.__schedule) this.__schedule();
  };

  function mount(host, template, Component) {
    var doc = host.ownerDocument;
    var tree = compile(template.content.childNodes, hoverSheet(doc));
    var c = new Component(), prev = [], queued = false;
    function render() {
      queued = false;
      var next = build(tree, c.renderVals(), []);
      patch(host, prev, next, doc);
      prev = next;
      if (c.componentDidUpdate) c.componentDidUpdate();
    }
    c.__schedule = function () { if (!queued) { queued = true; Promise.resolve().then(render); } };
    render();
    if (c.componentDidMount) c.componentDidMount();
    return c;
  }

  window.DCLogic = DCLogic;
  window.DCLite = { mount: mount };
})();
