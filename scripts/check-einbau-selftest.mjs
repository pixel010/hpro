#!/usr/bin/env node
/**
 * Self-test of scripts/check-einbau.mjs: the real part 6 passes, and each deliberate defect is
 * found with its error code. Exit 0 when every case behaves as expected.
 */
import { readFileSync } from 'node:fs';
import { checkEinbau, DEFAULT_DOC, loadContext } from './check-einbau.mjs';

const ctx = await loadContext();
const doc = readFileSync(DEFAULT_DOC, 'utf8');
const cases = [
  { name: 'Teil 6 wie im Repository', text: doc, expect: [] },
  { name: 'Export createContainer nicht mehr genannt', text: doc.replaceAll('`createContainer', '`erzeugeContainer'), expect: ['api-missing'] },
  { name: 'erfundene stabile Funktion im Namensraum calc', text: doc.replace('| `calc` (Teil 3) | `importSpreadsheet`', '| `calc` (Teil 3) | `importSpreadsheet`, `gibtEsNicht`'), expect: ['stable-unknown'] },
  { name: 'Rückgabecode 4 in der Tabelle als 5', text: doc.replace('| 4 | Hilfsmittel fehlt', '| 5 | Hilfsmittel fehlt'), expect: ['exit-codes'] },
  { name: 'Befehl, den es nicht gibt', text: doc.replace('| `hpro version`, `hpro help` |', '| `hpro version`, `hpro help`, `hpro zaubern` |').replace('| `hpro validate <datei>` |', '| `hpro zaubern <datei>` |'), expect: ['command-missing'] },
  { name: 'falsche Version', text: doc.replace('| `KERN_VERSION` | `0.1.0` |', '| `KERN_VERSION` | `9.9.9` |'), expect: ['version-mismatch'] },
  { name: 'Ausgabe verändert', text: doc.replace('Stufe Basis: unbestimmt\nBerichtsschema: gültig\n[Exit-Code 3]', 'Stufe Basis: bestanden\nBerichtsschema: gültig\n[Exit-Code 0]'), expect: ['output-not-verbatim'] },
  { name: 'Dateiauszug verändert', text: doc.replace("const source = author.readMarkdown(markdown);", "const source = author.readMarkdown(text);"), expect: ['excerpt-mismatch'] },
  { name: 'unbekannte Anforderung', text: doc.replace('(HP-MIN-003)', '(HP-MIN-099)'), expect: ['unknown-requirement'] },
  { name: 'Pfad fehlt', text: doc.replace('[`einbau/python/hpro_bericht.py`]', '[`einbau/python/gibt-es-nicht.py`]'), expect: ['missing-path'] },
];
let failed = 0;
for (const c of cases) {
  const r = checkEinbau('06-einbau.md', c.text, ctx);
  const codes = [...new Set(r.findings.map((f) => f.code))].sort();
  const ok = c.expect.length === 0 ? codes.length === 0 : c.expect.every((e) => codes.includes(e)) && codes.every((x) => c.expect.includes(x));
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: ${codes.length ? codes.join(', ') : 'keine Fehler'}${ok ? '' : ` (erwartet: ${c.expect.join(', ') || 'keine'}; ${r.findings.map((f) => f.detail).join(' | ').slice(0, 300)})`}`);
}
console.log(failed === 0 ? `OK: ${cases.length} Fälle` : `FAILED: ${failed} von ${cases.length} Fällen`);
process.exit(failed === 0 ? 0 : 1);
