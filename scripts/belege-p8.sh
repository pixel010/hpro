#!/usr/bin/env bash
# Erzeugt die Belege für Paket P8 (Barrierefreiheits-Prüflauf) unter docs/belege/P8/.
#
#  00 Werkzeuge und Versionen
#  01 Kern-Tests kern/test/a11y.test.ts (Abnahme 1 und 2, epubcheck, Teile, Sperren)
#  02 Abnahme 1 und 2 über die Kommandozeile: Testdokument bauen, erster Lauf (19 Befunde in
#     7 Kategorien), Korrektur mit Vorschlägen und einem eingegebenen Wert, zweiter Lauf
#     (0 Befunde); Korrektur ohne Eingabe (nichts erfunden), Einzelkorrektur, Verlauf, Vergleich
#  03 epubcheck 5.4.0: Testdokument vorher und nachher
#  04 hpro-check (Konformitätsprüfer): Testdokument vorher und nachher
#  05 Reader: Playwright app/e2e/pruefen.spec.ts (Abnahme 1–3 im Browser) und der Beleglauf
#     app/e2e/p8-belege.spec.ts (Bildschirmfotos, axe-core über Oberfläche und Dokument,
#     Kontrast-Gegenprobe mit den Farben, die Chromium berechnet)
#  06 Prüflauf über alle Beispiele des Readers (Fehlalarme? echte Befunde?)
#  07 Messungen (Laufzeit des Prüflaufs und der Korrektur bei wachsender Dokumentgröße)
#  08 Prüfung wie der Läufer: npm ci, npm test
#
# Voraussetzung: Node >= 22, JDK 21 und epubcheck 5.4.0 unter prototyp/tools/.
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P8
C=$OUT/container
K=prototyp/out/p8
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
I=content/index.xhtml
PLAN="alt-dateiname@$I#plan/img[1]"
PLAN_ALT="Lageplan des Hallenbads mit dem neuen barrierefreien Zugang an der Ostseite"
mkdir -p "$C" "$K"
rm -f "$C"/*.hpro "$C"/*.json "$K"/*

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
entry() { python3 -c "import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())" "$1" "$2"; }
stray() {
  local found
  found=$(ps -eo pid=,comm=,args= | awk '$2 !~ /^(bash|sh|dash|zsh|ps|awk)$/ && /vite preview|\/opt\/data\/html-pro\/(app\/)?node_modules\//')
  echo "${found:-(keine)}"
}

npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2

{
  echo "# P8 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "axe-core und Playwright (app/node_modules):"
  node -e "for (const p of ['axe-core','@axe-core/playwright','@playwright/test']) console.log(p, require('./node_modules/'+p+'/package.json').version)"
  echo
  echo "Rechner (Messungen in 07 und messungen-reader.json):"
  grep -m1 'model name' /proc/cpuinfo
  echo "scaling_max_freq: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null) kHz, no_turbo: $(cat /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null)"
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P8 Kern-Tests (kern/test/a11y.test.ts)"
  echo
  run node --test kern/build/test/a11y.test.js
} > "$OUT/01-kern-tests.txt" 2>&1

{
  echo "# P8 Abnahme 1 und 2 über die Kommandozeile"
  echo
  echo "## Testdokument als Container (Quelle docs/spezifikation/beispiele/p8-barrierefreiheit/, absichtlich fehlerhaft)"
  run node scripts/p8-beispiel.mjs "$C/pruefen.hpro"
  echo "## Abnahme 1: erster Lauf – Befunde in mindestens fünf Kategorien (Exit 1 = Befunde)"
  run hpro a11y check "$C/pruefen.hpro"
  hpro a11y check "$C/pruefen.hpro" --json > "$C/pruefen-bericht.json"
  echo "## Abnahme 2: alle Vorschläge anwenden; der eine Alternativtext ohne Vorschlag wird eingegeben (--value)"
  run hpro a11y fix "$C/pruefen.hpro" "$C/pruefen-korrigiert.hpro" --at 2026-10-13T09:00:00Z --value "$PLAN=$PLAN_ALT"
  echo "## Abnahme 2: zweiter Lauf über die gespeicherte Datei (Exit 0 = keine Befunde)"
  run hpro a11y check "$C/pruefen-korrigiert.hpro"
  hpro a11y check "$C/pruefen-korrigiert.hpro" --json > "$C/pruefen-korrigiert-bericht.json"
  echo "## Ohne Eingabe: 18 Vorschläge angewendet, der Alternativtext ohne Vorschlag wird nicht erfunden (Exit 1)"
  run hpro a11y fix "$C/pruefen.hpro" "$K/ohne-eingabe.hpro" --at 2026-10-13T09:00:00Z
  run hpro a11y check "$K/ohne-eingabe.hpro"
  echo "## Einzelne Befunde nach Kennung (--only), Wert aus der Eingabe"
  run hpro a11y fix "$C/pruefen.hpro" "$K/einzeln.hpro" --at 2026-10-13T09:00:00Z --only "sprache-ungueltig@$I" --only "alt-fehlt@$I#abb-becken/img[1]" --value "alt-fehlt@$I#abb-becken/img[1]=Leeres Sportbecken mit alter blauer Folie" --json
  echo "## Die Korrekturen stehen als Text und Struktur in der Datei: Vergleich vorher/nachher (hpro diff)"
  run hpro diff "$C/pruefen.hpro" "$C/pruefen-korrigiert.hpro"
  echo "## Stylesheet vorher/nachher (diff -u; nur die adressierten Deklarationen)"
  entry "$C/pruefen.hpro" content/styles/document.css > "$K/vorher.css"
  entry "$C/pruefen-korrigiert.hpro" content/styles/document.css > "$K/nachher.css"
  run diff -u "$K/vorher.css" "$K/nachher.css"
  echo "## Inhaltsdokument vorher/nachher (diff -u)"
  entry "$C/pruefen.hpro" "$I" > "$K/vorher.xhtml"
  entry "$C/pruefen-korrigiert.hpro" "$I" > "$K/nachher.xhtml"
  run diff -u "$K/vorher.xhtml" "$K/nachher.xhtml"
  entry "$C/pruefen.hpro" content/anhang.xhtml > "$K/vorher-anhang.xhtml"
  entry "$C/pruefen-korrigiert.hpro" content/anhang.xhtml > "$K/nachher-anhang.xhtml"
  run diff -u "$K/vorher-anhang.xhtml" "$K/nachher-anhang.xhtml"
  echo "## Verlauf: Fassung 1 mit Notiz, das fehlerhafte Original byte-genau wiederherstellbar"
  run hpro history "$C/pruefen-korrigiert.hpro"
  run hpro history checkout "$C/pruefen-korrigiert.hpro" 0 "$K/fassung-0.hpro"
  run hpro diff "$C/pruefen-korrigiert.hpro" --from 0 --to 1
  run hpro inspect "$C/pruefen-korrigiert.hpro"
  echo "## Ablehnungen der neuen Operationen (hpro edit apply, Exit 1, keine Datei)"
  printf '%s\n' '[{"op":"set-attribute","target":"content/index.xhtml#plan","name":"onclick","value":"x()"}]' > "$K/op1.json"
  printf '%s\n' '[{"op":"set-css","path":"content/styles/document.css","selector":".hinweis","property":"background","value":"url(x.png)"}]' > "$K/op2.json"
  printf '%s\n' '[{"op":"set-heading-levels","levels":[{"target":"content/index.xhtml#ueberblick-h","level":4}]}]' > "$K/op3.json"
  for n in 1 2 3; do cat "$K/op$n.json"; run hpro edit apply "$C/pruefen.hpro" "$K/nein$n.hpro" "$K/op$n.json" --time 2026-10-13T09:00:00Z; done
  run ls "$K/nein1.hpro" "$K/nein2.hpro" "$K/nein3.hpro"
} > "$OUT/02-abnahme-kommandozeile.txt" 2>&1

{
  echo "# P8 epubcheck 5.4.0: Testdokument vorher und nachher"
  echo "# Erwartung: vorher meldet epubcheck die ungültige Sprachangabe (xml:lang=\"de_AT\"), nachher 0/0."
  echo
  for f in pruefen pruefen-korrigiert; do
    cp "$C/$f.hpro" "$K/$f.epub"
    echo "## $f.hpro"
    run "$JAVA" -jar "$EPUBCHECK" "$K/$f.epub"
  done
} > "$OUT/03-epubcheck.txt" 2>&1

{
  echo "# P8 hpro-check (Konformitätsprüfer, S3): Testdokument vorher und nachher"
  echo
  for f in pruefen pruefen-korrigiert; do
    echo "## $f.hpro"
    run node kern/build/bin/hpro-check.js "$C/$f.hpro"
  done
} > "$OUT/04-hpro-check.txt" 2>&1

{
  echo "# P8 Reader: Browser-Tests und Beleglauf"
  echo
  echo "## Playwright (Chromium) app/e2e/pruefen.spec.ts – Teil von npm test"
  (cd app && npx vite build > /dev/null 2>&1; run env PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npx playwright test --project=chromium e2e/pruefen.spec.ts)
  echo "## Beleglauf app/e2e/p8-belege.spec.ts (Bildschirmfotos, axe-core Oberfläche und Dokument, Kontrast-Gegenprobe)"
  (cd app && run npm run -s belege:p8)
  echo "## Liegengebliebene Prozesse nach dem Lauf"
  stray
} > "$OUT/05-reader.txt" 2>&1

{
  echo "# P8 Prüflauf über alle Beispiele des Readers (app/dist/*.hpro)"
  echo "# Zweck: Fehlalarme erkennen. Befunde in einem Beispiel sind gegen den Browser gegengeprüft"
  echo "# (gegenprobe/kontrast-chromium.json, Abschnitt druck.hpro)."
  echo
  for f in app/dist/*.hpro; do
    echo "## $(basename "$f")"
    hpro a11y check "$f" --json | python3 -c "
import json, sys
r = json.load(sys.stdin)
print('Dokumente:', len(r['documents']), '| Stylesheets:', len(r['stylesheets']), '| Befunde:', len(r['findings']), {k: v for k, v in r['counts'].items() if v})
for f in r['findings']: print('  ', f['severity'], f['id']); print('     ', f['message']); print('      Vorschlag:', f['fix']['label'] if f.get('fix') else f.get('blocked'))
for n in r['notChecked'][6:]: print('   nicht geprüft:', n['what'], '–', n['why'])
"
    echo
  done
} > "$OUT/06-alle-beispiele.txt" 2>&1

{
  echo "# P8 Messungen (Kern, Node $(node --version); Median aus 5 Läufen nach 1 Aufwärmlauf)"
  echo "# Dokument: der Hauptteil des Testdokuments n-mal wiederholt (Kennungen eindeutig gemacht);"
  echo "# Prüflauf = auditContainer, Korrektur = fixContainer aller Vorschläge samt Speichern."
  echo
  node --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { a11y, createContainer } from './kern/dist/index.js';
import { EXAMPLES_DIR, mediaTypeOf, walk } from './scripts/s7-lib.mjs';
const dir = join(EXAMPLES_DIR, 'p8-barrierefreiheit');
const doc = JSON.parse(readFileSync(join(dir, 'dokument.json'), 'utf8'));
const files = walk(dir).filter((p) => p !== 'dokument.json');
const index = readFileSync(join(dir, 'content/index.xhtml'), 'utf8');
const main = /<main id="inhalt">([\s\S]*)<\/main>/.exec(index)[1];
const sections = main.slice(main.indexOf('<section'));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log('Wiederholungen | Elemente | Container  | Befunde | Prüflauf     | alle Korrekturen + Speichern | Befunde danach');
for (const n of [1, 10, 50]) {
  let body = main.slice(0, main.indexOf('<section'));
  for (let k = 0; k < n; k++) body += k === 0 ? sections : sections.replace(/id="([^"]+)"/g, `id="$1-${k}"`).replace(/href="#([^"]+)"/g, `href="#$1-${k}"`);
  const xhtml = index.replace(main, body);
  const toc = { ...doc.toc, entries: [] };
  for (let k = 0; k < n; k++) for (const e of doc.toc.entries) toc.entries.push(e.href.startsWith('content/index.xhtml#') && k > 0 ? { title: `${e.title} ${k}`, href: `${e.href}-${k}` } : k === 0 ? e : null);
  toc.entries = toc.entries.filter(Boolean);
  const resources = files.map((path) => ({ path, mediaType: mediaTypeOf(path), data: path === 'content/index.xhtml' ? xhtml : readFileSync(join(dir, path)) }));
  const bytes = (await createContainer({ ...doc, toc, resources })).bytes;
  const elements = (xhtml.match(/<[a-z][^>]*>/g) ?? []).length;
  const t = [];
  let r;
  for (let i = 0; i < 6; i++) { const t0 = performance.now(); r = await a11y.auditContainer(bytes); if (i) t.push(performance.now() - t0); }
  const values = new Map(r.findings.filter((f) => f.rule === 'alt-dateiname').map((f) => [f.id, 'Lageplan des Hallenbads']));
  const tf = [];
  let out;
  for (let i = 0; i < (n > 10 ? 2 : 4); i++) { const t0 = performance.now(); out = await a11y.fixContainer(bytes, { select: 'all', values, at: '2026-10-13T09:00:00Z' }); if (i) tf.push(performance.now() - t0); }
  console.log(`${String(n).padStart(14)} | ${String(elements).padStart(8)} | ${String(bytes.length).padStart(8)} B | ${String(r.findings.length).padStart(7)} | ${median(t).toFixed(0).padStart(8)} ms | ${median(tf).toFixed(0).padStart(24)} ms (${out.applied.length} angewendet) | ${out.after.findings.length}`);
}
EOF
  echo
  echo "## Reader (app/e2e/p8-belege.spec.ts, Chromium): messungen-reader.json"
  cat "$OUT/messungen-reader.json"
} > "$OUT/07-messungen.txt" 2>&1

if [ "${P8_SKIP_RUNNER:-}" != "1" ]; then
  {
    echo "# P8 Prüfung wie der Läufer (runner/auto_lauf.py): npm ci, npm test"
    echo
    echo "## Liegengebliebene Prozesse vorher"
    stray
    echo
    run npm ci --no-audit --no-fund
    run npm test --if-present
    echo "## Liegengebliebene Prozesse nachher"
    stray
  } > "$OUT/08-npm-test.txt" 2>&1
fi

grep -H "Exit-Code" "$OUT"/0*.txt | sort | uniq -c | sort -rn | head -40
