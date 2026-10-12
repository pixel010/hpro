// hp-chart 0.1.0 – bar chart from the table inside the element (registry part 2, package P15).
//
// Markup: <hp-chart source="<table id>" state="data/<name>.json"> with a static equivalent in
// the light DOM: a figure with the chart as image and the table (HP-SBX-004). Without this
// script both stay visible and show the stored values.
//
// With the script the element shows an interactive chart in its shadow root: choice of the
// column (buttons, one per numeric column) and of the order (as in the table or descending);
// the table stays readable below the chart (slot), the static image is hidden. The chosen view
// is kept in the document through the data channel (part 1, section 8), never elsewhere
// (HP-SBX-007). Bars grow in once when motion is allowed; with reduced motion
// (`ready.reducedMotion` or the media query) nothing moves (HP-SBX-014). The component touches
// nothing outside its element (HP-SBX-017), all controls are buttons (keyboard).
//
// Classic script, no module (epubcheck counts module scripts not as scripts). Messages go to
// `parent.postMessage` (part 1, 8.1; spelling without `window.`, see HPC-0004).
(function () {
  'use strict';

  var pending = {};
  var seq = 0;
  var SVG = 'http://www.w3.org/2000/svg';

  function send(message, callback) {
    message.id = 'hp-chart-' + ++seq;
    if (callback) pending[message.id] = callback;
    parent.postMessage(message, '*');
  }

  function cellText(cell) {
    return (cell.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Numeric value of a cell: data-hp-value if present, else the German number in the text.
  function cellValue(cell) {
    var stored = cell.getAttribute('data-hp-value');
    if (stored !== null && stored !== '' && !isNaN(Number(stored))) return Number(stored);
    var n = Number(cellText(cell).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  var STYLE =
    ':host { display: block; margin: 1em 0; }' +
    '.bar { display: flex; flex-wrap: wrap; gap: 0.4em; align-items: center; margin-bottom: 0.6em; font: inherit; }' +
    '.bar span { margin-right: 0.3em; }' +
    'button { font: inherit; padding: 0.25em 0.7em; border: 1px solid currentColor; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }' +
    'button[aria-pressed="true"] { background: #1f4e5f; color: #ffffff; border-color: #1f4e5f; }' +
    'button:focus-visible { outline: 3px solid #1f6feb; outline-offset: 2px; }' +
    'svg { display: block; width: 100%; height: auto; max-width: 44em; }' +
    '.label { font-size: 13px; fill: currentColor; }' +
    '.value { font-size: 13px; fill: currentColor; font-variant-numeric: tabular-nums; }' +
    'rect.balken { fill: #2f7d8c; }' +
    '.hint { font-size: 0.85em; margin: 0.3em 0; }' +
    '::slotted(figure) { display: none; }';

  class HpChart extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      var table = this.querySelector('table');
      var id = this.getAttribute('source');
      if (id) table = this.querySelector('table#' + CSS.escape(id)) || table;
      if (!table) return; // nothing to draw: the static equivalent stays as it is
      this.table = table;
      this.path = this.getAttribute('state');
      this.readOnly = true;
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.readRows();
      this.view = { ansicht: this.columns[this.columns.length - 1].key, sortierung: 'plan' };
      var root = this.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = STYLE;
      this.controls = document.createElement('div');
      this.controls.className = 'bar';
      this.controls.setAttribute('role', 'group');
      this.controls.setAttribute('aria-label', 'Diagramm einstellen');
      this.chart = document.createElementNS(SVG, 'svg');
      this.chart.setAttribute('role', 'img');
      this.hint = document.createElement('p');
      this.hint.className = 'hint';
      this.hint.setAttribute('role', 'status');
      root.append(style, this.controls, this.chart, this.hint, document.createElement('slot'));
      this.buildControls();
      this.draw(false);
      this.setAttribute('status', 'gezeichnet');
    }

    // Header row gives the columns; numeric columns become selectable series.
    readRows() {
      var head = this.table.tHead ? this.table.tHead.rows[0] : this.table.rows[0];
      var names = [];
      for (var i = 0; i < head.cells.length; i++) names.push(cellText(head.cells[i]));
      var body = this.table.tBodies[0];
      this.rows = [];
      for (var r = 0; r < body.rows.length; r++) {
        var cells = body.rows[r].cells;
        var row = { label: cellText(cells[0]), values: [], texts: [], order: r };
        for (var c = 1; c < cells.length; c++) {
          row.values.push(cellValue(cells[c]));
          row.texts.push(cellText(cells[c]));
        }
        this.rows.push(row);
      }
      this.columns = [];
      for (var k = 1; k < names.length; k++) {
        var numeric = this.rows.every(function (x) { return x.values[k - 1] !== null; });
        if (numeric) this.columns.push({ key: names[k].toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, ''), name: names[k], index: k - 1 });
      }
    }

    buildControls() {
      var self = this;
      this.controls.replaceChildren();
      var label = document.createElement('span');
      label.textContent = 'Zeigen:';
      this.controls.append(label);
      this.columns.forEach(function (col) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = col.name;
        b.setAttribute('aria-pressed', String(self.view.ansicht === col.key));
        b.addEventListener('click', function () { self.choose({ ansicht: col.key }); });
        self.controls.append(b);
      });
      var sort = document.createElement('button');
      sort.type = 'button';
      sort.textContent = 'Absteigend sortieren';
      sort.setAttribute('aria-pressed', String(this.view.sortierung === 'absteigend'));
      sort.addEventListener('click', function () { self.choose({ sortierung: self.view.sortierung === 'absteigend' ? 'plan' : 'absteigend' }); });
      this.controls.append(sort);
    }

    choose(change) {
      this.view = { ansicht: change.ansicht || this.view.ansicht, sortierung: change.sortierung || this.view.sortierung };
      this.buildControls();
      this.draw(true);
      this.store();
    }

    column() {
      for (var i = 0; i < this.columns.length; i++) if (this.columns[i].key === this.view.ansicht) return this.columns[i];
      return this.columns[this.columns.length - 1];
    }

    draw(animate) {
      var col = this.column();
      var rows = this.rows.slice();
      if (this.view.sortierung === 'absteigend') rows.sort(function (a, b) { return b.values[col.index] - a.values[col.index]; });
      var max = Math.max.apply(null, rows.map(function (r) { return r.values[col.index]; })) || 1;
      var rowH = 30;
      var labelW = 170;
      var barW = 330;
      var height = rows.length * rowH + 10;
      var svg = this.chart;
      svg.replaceChildren();
      svg.setAttribute('viewBox', '0 0 640 ' + height);
      svg.setAttribute('aria-label', 'Balkendiagramm ' + col.name + ': ' + rows.map(function (r) { return r.label + ' ' + r.texts[col.index]; }).join(', '));
      var bars = [];
      rows.forEach(function (r, i) {
        var y = 5 + i * rowH;
        var label = document.createElementNS(SVG, 'text');
        label.setAttribute('class', 'label');
        label.setAttribute('x', '0');
        label.setAttribute('y', String(y + 18));
        label.textContent = r.label;
        var rect = document.createElementNS(SVG, 'rect');
        rect.setAttribute('class', 'balken');
        rect.setAttribute('x', String(labelW));
        rect.setAttribute('y', String(y + 4));
        rect.setAttribute('height', '20');
        rect.setAttribute('width', String(Math.max(1, Math.round((r.values[col.index] / max) * barW))));
        var value = document.createElementNS(SVG, 'text');
        value.setAttribute('class', 'value');
        value.setAttribute('x', String(labelW + barW + 10));
        value.setAttribute('y', String(y + 18));
        value.textContent = r.texts[col.index];
        svg.append(label, rect, value);
        bars.push(rect);
      });
      this.setAttribute('motion', this.reduced ? 'reduziert' : 'erlaubt');
      // One short growth animation, never with reduced motion; it ends by itself (no fill).
      if (animate !== false && !this.reduced && typeof bars[0].animate === 'function') {
        bars.forEach(function (rect) {
          rect.style.transformBox = 'fill-box';
          rect.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, easing: 'ease-out' });
        });
      }
    }

    // Reading system → component: `ready` (part 1, 8.2). Read before writing (8.4).
    start(ready) {
      var self = this;
      if (!this.table) return;
      this.reduced = !!ready.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.readOnly = !!ready.readOnly || !this.path || ready.data.indexOf(this.path) < 0;
      this.hint.textContent = this.readOnly ? 'Die gewählte Ansicht wird in dieser Fassung nicht gespeichert.' : '';
      if (!this.path || ready.data.indexOf(this.path) < 0) {
        this.draw(true);
        return;
      }
      send({ hp: 'state.get', path: this.path }, function (result) {
        if (result.ok && result.value && typeof result.value.ansicht === 'string') {
          self.view = { ansicht: result.value.ansicht, sortierung: result.value.sortierung === 'absteigend' ? 'absteigend' : 'plan' };
          self.buildControls();
        }
        self.draw(true);
        self.setAttribute('status', 'bereit');
      });
    }

    store() {
      var self = this;
      if (this.readOnly || !this.path) return;
      send({ hp: 'state.set', path: this.path, value: { ansicht: this.view.ansicht, sortierung: this.view.sortierung } }, function (result) {
        if (!result.ok) {
          self.hint.textContent = 'Ansicht nicht gespeichert: ' + (result.error ? result.error.message : 'unbekannter Fehler');
          if (result.error && result.error.code === 'read-only') self.readOnly = true;
        } else {
          self.hint.textContent = 'Ansicht im Dokument vermerkt (wird mit dem Dokument gespeichert).';
        }
      });
    }
  }

  customElements.define('hp-chart', HpChart);

  window.addEventListener('message', function (event) {
    var m = event.data;
    if (!m || typeof m.hp !== 'string') return;
    var all = document.querySelectorAll('hp-chart');
    if (m.hp === 'ready') {
      for (var i = 0; i < all.length; i++) all[i].start(m);
    } else if (m.hp === 'state.result' && pending[m.id]) {
      var cb = pending[m.id];
      delete pending[m.id];
      cb(m);
    }
  });
})();
