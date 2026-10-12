// x-baubuero-aufmass 1.0.0 – example component for the html-Pro implementer's guide (S7).
//
// What it does: makes the "Menge" cells of its table editable, recalculates the row amounts and
// the sum, and keeps the values in data/aufmass.json through the document data channel
// (part 1, section 8). It touches nothing outside its own element (HP-SBX-017), stores nothing
// outside the document (HP-SBX-007) and never contacts the network (HP-SBX-006).
//
// Classic script, not `type="module"`: epubcheck 5.4.0 does not count module scripts as scripts
// (docs/belege/S3/README.md). The light DOM is the static equivalent (HP-SBX-004): without this
// script the table shows the last stored values.
(function () {
  'use strict';

  var pending = {};
  var seq = 0;

  // Part 1, 8.1: messages go to the reading system through postMessage; with an opaque origin the
  // only possible targetOrigin is "*". (Written as `parent.postMessage`, see the handbook, 6.5.)
  function send(message, callback) {
    message.id = 'aufmass-' + (++seq);
    if (callback) pending[message.id] = callback;
    parent.postMessage(message, '*');
  }

  function formatMoney(value) {
    return value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  }
  function formatNumber(value) {
    return String(value).replace('.', ',');
  }

  class XBaubueroAufmass extends HTMLElement {
    connectedCallback() {
      if (this.dataset.hpReady) return;
      this.dataset.hpReady = '1';
      this.path = this.getAttribute('data-x-baubuero-data');
      this.readOnly = true;
      var rows = this.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) this.wireRow(rows[i]);
    }

    // Reading system → component: `ready` (8.2). Read before writing (8.4).
    start(ready) {
      var self = this;
      this.readOnly = !!ready.readOnly || ready.data.indexOf(this.path) < 0;
      if (!this.readOnly) {
        send({ hp: 'state.get', path: this.path }, function (result) {
          if (result.ok && result.value) self.apply(result.value);
        });
        send({ hp: 'state.subscribe', path: this.path }, function () {});
      }
      this.setEditable(!this.readOnly);
    }

    setEditable(on) {
      var cells = this.querySelectorAll('td[data-hp-input="true"]');
      for (var i = 0; i < cells.length; i++) {
        cells[i].contentEditable = on ? 'true' : 'false';
        cells[i].tabIndex = 0; // HP-SBX-017: every control reachable by keyboard
      }
    }

    wireRow(row) {
      var self = this;
      var input = row.querySelector('td[data-hp-input="true"]');
      if (!input) return;
      input.addEventListener('blur', function () {
        var value = parseFloat(input.textContent.replace(/\s/g, '').replace(',', '.'));
        if (isNaN(value) || value < 0) {
          input.textContent = formatNumber(input.dataset.hpValue);
          return;
        }
        input.dataset.hpValue = String(value);
        input.textContent = formatNumber(value);
        self.recalculate();
        self.store();
      });
    }

    // Values from data/aufmass.json (origin: load, editor or another instance).
    apply(data) {
      if (!data || !Array.isArray(data.positionen)) return;
      var rows = this.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length && i < data.positionen.length; i++) {
        var input = rows[i].querySelector('td[data-hp-input="true"]');
        if (!input) continue;
        input.dataset.hpValue = String(data.positionen[i].menge);
        input.textContent = formatNumber(data.positionen[i].menge);
      }
      this.recalculate();
    }

    // Formula and value stay together (HP-SBX-016): the component only refreshes data-hp-value
    // and the displayed text; data-hp-formula is left untouched.
    recalculate() {
      var sum = 0;
      var rows = this.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td[data-hp-type]');
        var menge = parseFloat(cells[0].dataset.hpValue);
        var preis = parseFloat(cells[1].dataset.hpValue);
        var betrag = Math.round(menge * preis * 100) / 100;
        cells[2].dataset.hpValue = String(betrag);
        cells[2].textContent = formatMoney(betrag);
        sum += betrag;
      }
      var total = this.querySelector('tfoot td[data-hp-formula]');
      if (total) {
        total.dataset.hpValue = String(sum);
        total.textContent = formatMoney(sum);
      }
    }

    store() {
      if (this.readOnly) return;
      var positionen = [];
      var rows = this.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td');
        positionen.push({ pos: parseInt(cells[0].textContent, 10), flaeche: cells[1].textContent, menge: parseFloat(cells[2].dataset.hpValue) });
      }
      var self = this;
      send({ hp: 'state.set', path: this.path, value: { positionen: positionen } }, function (result) {
        if (!result.ok && result.error && result.error.code === 'read-only') {
          self.readOnly = true;
          self.setEditable(false);
        }
      });
    }
  }

  customElements.define('x-baubuero-aufmass', XBaubueroAufmass);

  window.addEventListener('message', function (event) {
    var m = event.data;
    if (!m || typeof m.hp !== 'string') return;
    var all = document.querySelectorAll('x-baubuero-aufmass');
    if (m.hp === 'ready') {
      for (var i = 0; i < all.length; i++) all[i].start(m);
    } else if (m.hp === 'state.result' && pending[m.id]) {
      var cb = pending[m.id];
      delete pending[m.id];
      cb(m);
    } else if (m.hp === 'state.changed') {
      for (var j = 0; j < all.length; j++) if (all[j].path === m.path) all[j].apply(m.value);
    }
  });
})();
