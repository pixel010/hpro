#!/usr/bin/env bash
# Erzeugt die Belege für Paket P7 (Kommentare, Review und Vergleich zweier Fassungen) unter
# docs/belege/P7/.
#
#  00 Werkzeuge und Versionen
#  01 Abnahme 1 und 2: Kern-Tests kern/test/annotate.test.ts (Anlegen, Beantworten, Erledigen,
#     Export/Import, Erhalt im Container)
#  02 Abnahme 1 über die Kommandozeile: Prüfrunde am Beispiel (Kommentar, Hervorhebung, Freihand,
#     Antworten, Erledigen, Wiederöffnen, Bearbeiten, Löschen), Export JSON-LD/CSV/XHTML, Import,
#     Vergleich zweier Fassungen, Ablehnungen
#  03 Unabhängige Gegenprobe gegen das W3C Web Annotation Data Model (web-platform-tests
#     annotation-model/, python-jsonschema, pyld), dazu eine Negativprobe
#  04 epubcheck 5.4.0 über alle Container
#  05 hpro-check (Konformitätsprüfer) über alle Container
#  06 Signiertes Dokument: Anmerkung nach der Signatur, eigene Prüfung und EU DSS 6.5, Manipulation
#  07 Reader: vitest, Playwright app/e2e/anmerkungen.spec.ts und der Beleglauf
#     app/e2e/p7-belege.spec.ts (Bildschirmfotos, Anzeige, Speichern aus dem Reader, Messungen)
#  08 Abnahme 2 unabhängig geprüft: was der Reader anzeigt und speichert, gegen die rohen
#     JSON-LD-Dateien des Containers (Python, kein Code aus kern/)
#  09 Messungen im Kern (Zeiten, Größen) und aus dem Reader
#  10 Prüfung wie der Läufer: npm ci, npm test
#
# Voraussetzung: Node >= 22, JDK 21 und epubcheck 5.4.0 unter prototyp/tools/, das DSS-Werkzeug
# unter prototyp/dss/target/, prototyp/out/policy-hpro.xml, die W3C-Testdefinitionen unter
# prototyp/tools/wpt-annotation-model/, prototyp/.venv mit jsonschema und pyld. Private
# Testschlüssel bleiben unter prototyp/out/p7/ (nicht im Repo).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P7
C=$OUT/container
K=prototyp/out/p7
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=$OUT/policy-hpro.xml
PY=prototyp/.venv/bin/python
WPT=prototyp/tools/wpt-annotation-model
I=content/index.xhtml
mkdir -p "$C" "$K"
rm -f "$C"/*.hpro "$C"/*.jsonld "$C"/*.csv "$C"/*.xhtml "$C"/*.pem "$C"/*.txt "$K"/*.hpro

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
entry() { python3 -c "import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())" "$1" "$2"; }
# Runs an annotate command like run() and remembers the first id it printed in $ID.
runid() { local o; o=$("$@" 2>&1); local rc=$?; echo "\$ $*"; echo "$o"; echo "[Exit-Code $rc]"; echo; ID=$(echo "$o" | grep -o 'urn:uuid:[0-9a-f-]*' | head -1); }
stray() {
  local found
  found=$(ps -eo pid=,comm=,args= | awk '$2 !~ /^(bash|sh|dash|zsh|ps|awk)$/ && /vite preview|\/opt\/data\/html-pro\/(app\/)?node_modules\//')
  echo "${found:-(keine)}"
}

[ -f prototyp/out/policy-hpro.xml ] || { echo "fehlt: prototyp/out/policy-hpro.xml (prototyp/run_experiment.sh ausführen)"; exit 2; }
cp prototyp/out/policy-hpro.xml "$POLICY"
npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2

hpro keygen "$K/sig-key.pem" "$C/sig-cert.pem" --alg ec --cn "Gemeinde Beispielort (Testsignatur)" --not-before 2026-10-01T00:00:00Z > "$K/keygen-sig.txt"

{
  echo "# P7 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|enumerations)-[0-9]'
  echo
  run "$PY" -c "from importlib.metadata import version as v; print('python-jsonschema', v('jsonschema')); print('pyld', v('PyLD'))"
  echo "W3C-Testdefinitionen (web-platform-tests annotation-model/, lokale Kopie):"
  cat "$WPT/HERKUNFT.txt" 2>/dev/null || ls "$WPT"
  echo
  echo "Schlüssel (TEST, selbstsigniert; privater Schlüssel unter $K, nicht im Repo):"
  cat "$K/keygen-sig.txt"
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P7 Abnahme 1 und 2: Kern-Tests (kern/test/annotate.test.ts)"
  echo
  run node --test kern/build/test/annotate.test.js
} > "$OUT/01-kern-tests.txt" 2>&1

{
  echo "# P7 Abnahme 1 über die Kommandozeile: eine Prüfrunde am Beispiel"
  echo
  echo "## Beispiel als Container (Quelle docs/spezifikation/beispiele/p7-review/)"
  run node scripts/p7-beispiel.mjs "$C/review-0-leer.hpro"
  echo "## Anlegen: Kommentar zu einer Textstelle (Zitat), Hervorhebungen, Freihand, Kommentar zu einem Element"
  runid hpro annotate add "$C/review-0-leer.hpro" "$K/r1.hpro" --target "$I#anf-laerm" --quote "nach 13:00 Uhr" --text "Freitags endet der Unterricht um 12:00 Uhr – bitte ergänzen." --author "Eva Berger (Bauamt)" --time 2026-10-12T08:10:00Z
  LAERM=$ID
  runid hpro annotate add "$K/r1.hpro" "$K/r2.hpro" --target "$I#umfang-lueftung" --quote "Luftmenge 3000 m³/h" --highlight gelb --text "Reicht das für zwei Klassen gleichzeitig (60 Kinder)?" --author "Schulleitung VS Beispielort" --time 2026-10-12T08:20:00Z
  LUFT=$ID
  runid hpro annotate add "$K/r2.hpro" "$K/r3.hpro" --target "$I#umfang-zugang" --quote "höchstens 6 Prozent" --highlight gruen --author "Eva Berger (Bauamt)" --time 2026-10-12T08:25:00Z
  RAMPE=$ID
  runid hpro annotate add "$K/r3.hpro" "$K/r4.hpro" --target "$I#termin-tabelle" --ink "M80 800 C300 860 700 860 930 790;M900 760 L940 800 L890 830" --color rot --text "Bauzeit mit Schulbeginn abgleichen." --author "Schulleitung VS Beispielort" --time 2026-10-12T08:30:00Z
  INK=$ID
  runid hpro annotate add "$K/r4.hpro" "$K/r5.hpro" --target "content/anhang.xhtml#bestand-text" --text $'Fotos der Begehung bitte als Anhang ergänzen.\nZeichen wie <b> & "Anführungszeichen" bleiben Text.' --author "Max Huber (Planung)" --time 2026-10-12T08:40:00Z
  BESTAND=$ID
  echo "## Beantworten: Antwort und Antwort auf die Antwort"
  runid hpro annotate reply "$K/r5.hpro" "$K/r6.hpro" --to "$LAERM" --text "Ergänzt: freitags ab 12:00 Uhr." --author "Max Huber (Planung)" --time 2026-10-12T09:00:00Z
  R1=$ID
  run hpro annotate reply "$K/r6.hpro" "$K/r7.hpro" --to "$R1" --text "Danke, ich prüfe den neuen Satz." --author "Eva Berger (Bauamt)" --time 2026-10-12T09:05:00Z
  run hpro annotate reply "$K/r7.hpro" "$K/r8.hpro" --to "$LUFT" --text "Auslegung erfolgt für 60 Personen, Nachweis folgt mit der Ausschreibung." --author "Max Huber (Planung)" --time 2026-10-12T09:15:00Z
  echo "## Erledigen und wieder öffnen (der Status ist eine Antwort mit hp:status; geschriebene Dateien bleiben unverändert)"
  run hpro annotate resolve "$K/r8.hpro" "$K/r9.hpro" --to "$LAERM" --text "Passt so, danke." --author "Eva Berger (Bauamt)" --time 2026-10-12T09:20:00Z
  run hpro annotate resolve "$K/r9.hpro" "$K/r10.hpro" --to "$RAMPE" --author "Max Huber (Planung)" --time 2026-10-12T09:25:00Z
  run hpro annotate reopen "$K/r10.hpro" "$K/r11.hpro" --to "$RAMPE" --text "Doch noch offen: Nachweis der Steigung fehlt." --author "Eva Berger (Bauamt)" --time 2026-10-12T09:30:00Z
  run hpro annotate resolve "$K/r11.hpro" "$C/review.hpro" --to "$INK" --text "Bauzeit endet vor Schulbeginn am 6. September." --author "Max Huber (Planung)" --time 2026-10-12T09:35:00Z
  echo "## Ergebnis: Threads mit Status, Antworten, Verankerung und Schutz"
  run hpro annotate list "$C/review.hpro"
  run hpro annotate list "$C/review.hpro" --status open
  run hpro annotate check "$C/review.hpro"
  run hpro inspect "$C/review.hpro"
  echo "## Anmerkungen ändern den Text nicht: Inhaltsdokumente byte-gleich mit dem leeren Entwurf"
  for f in content/index.xhtml content/anhang.xhtml; do
    entry "$C/review-0-leer.hpro" "$f" > "$K/vorher.xhtml"; entry "$C/review.hpro" "$f" > "$K/nachher.xhtml"
    run cmp "$K/vorher.xhtml" "$K/nachher.xhtml"
  done
  echo "## Eine Anmerkungsdatei wie gespeichert (Kommentar zum Zitat)"
  entry "$C/review.hpro" "annotations/${LAERM#urn:uuid:}.jsonld"
  echo
  echo "## Eine Antwort, die erledigt setzt"
  python3 - "$C/review.hpro" <<'EOF'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for n in sorted(z.namelist()):
    if n.startswith('annotations/'):
        a = json.loads(z.read(n))
        if a.get('hp:status') == 'resolved' and a['body']['value'] == 'Passt so, danke.':
            print(z.read(n).decode())
EOF
  echo "## Verlauf (manifest.json#history): jeder Schritt ist ein Eintrag"
  entry "$C/review.hpro" manifest.json | python3 -c "import json,sys; [print(h['version'], h['dateModified'], h['note']) for h in json.load(sys.stdin)['history']]"
  echo
  echo "## Bearbeiten und Löschen (an einer Kopie)"
  run hpro annotate edit "$C/review.hpro" "$K/bearbeitet.hpro" --id "$BESTAND" --text "Fotos der Begehung vom 3. Oktober bitte als Anhang ergänzen." --time 2026-10-12T10:00:00Z
  run hpro annotate delete "$K/bearbeitet.hpro" "$K/geloescht.hpro" --id "$LAERM" --time 2026-10-12T10:05:00Z
  run hpro annotate list "$K/geloescht.hpro"
  echo "## Ablehnungen (Exit 1, keine Datei)"
  run hpro annotate add "$C/review.hpro" "$K/nein1.hpro" --target "$I#anf-laerm" --quote "nach 14:00 Uhr" --text "x" --author A --time 2026-10-12T10:00:00Z
  run hpro annotate add "$C/review.hpro" "$K/nein2.hpro" --target "$I#gibt-es-nicht" --text "x" --author A --time 2026-10-12T10:00:00Z
  run hpro annotate reply "$C/review.hpro" "$K/nein3.hpro" --to urn:uuid:00000000-0000-4000-8000-000000000000 --text "x" --author A --time 2026-10-12T10:00:00Z
  run ls "$K/nein1.hpro" "$K/nein2.hpro" "$K/nein3.hpro"

  echo "## Export: JSON-LD (AnnotationCollection), CSV, Bericht (XHTML)"
  run hpro annotate export "$C/review.hpro" "$C/review-anmerkungen.jsonld" --time 2026-10-12T10:00:00Z
  run hpro annotate export "$C/review.hpro" "$C/review-anmerkungen.csv"
  run hpro annotate export "$C/review.hpro" "$C/review-bericht.xhtml" --time 2026-10-12T10:00:00Z
  run cat "$C/review-anmerkungen.csv"
  echo "## Bericht: wohlgeformt (python xml.dom.minidom), Überschriften und Status"
  python3 - "$C/review-bericht.xhtml" <<'EOF'
import sys, xml.dom.minidom as m
d = m.parse(sys.argv[1])
print('wohlgeformt, Wurzel', d.documentElement.tagName)
for t in ('h1', 'h2'):
    for e in d.getElementsByTagName(t):
        print(t, ''.join(n.data for n in e.childNodes if n.nodeType == n.TEXT_NODE))
print('Markup aus Anmerkungen als Text:', '&lt;b&gt;' in open(sys.argv[1], encoding='utf-8').read())
EOF
  echo
  echo "## Export ohne Verlust: jedes Element der Sammlung = Datei im Container (JSON gleich, ohne @context)"
  python3 - "$C/review.hpro" "$C/review-anmerkungen.jsonld" <<'EOF'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
files = {}
for n in z.namelist():
    if n.startswith('annotations/'):
        a = json.loads(z.read(n)); ctx = a.pop('@context'); files[a['id']] = a
col = json.load(open(sys.argv[2], encoding='utf-8'))
items = col['first']['items']
print('Sammlung', col['type'], 'total', col['total'], '| Dateien im Container', len(files), '| Elemente', len(items))
same = sum(1 for i in items if files.get(i['id']) == i)
print('gleich:', same, 'von', len(files), '| fehlend:', sorted(set(files) - {i['id'] for i in items}))
sys.exit(0 if same == len(files) == len(items) else 1)
EOF
  echo "[Exit-Code $?]"
  echo
  echo "## Import in den leeren Entwurf (eine zweite Kopie ohne Anmerkungen)"
  run hpro annotate import "$C/review-0-leer.hpro" "$C/review-anmerkungen.jsonld" "$C/review-importiert.hpro" --time 2026-10-12T10:10:00Z
  run hpro annotate list "$C/review-importiert.hpro"
  echo "## Jede Anmerkungsdatei nach dem Import byte-gleich mit dem Original"
  python3 - "$C/review.hpro" "$C/review-importiert.hpro" <<'EOF'
import sys, zipfile
a, b = (zipfile.ZipFile(p) for p in sys.argv[1:3])
na = sorted(n for n in a.namelist() if n.startswith('annotations/'))
nb = sorted(n for n in b.namelist() if n.startswith('annotations/'))
eq = [n for n in na if n in nb and a.read(n) == b.read(n)]
print(len(na), 'Dateien im Original,', len(nb), 'nach Import,', len(eq), 'byte-gleich')
sys.exit(0 if len(eq) == len(na) == len(nb) else 1)
EOF
  echo "[Exit-Code $?]"
  echo
  echo "## Zweiter Import derselben Sammlung: nichts doppelt"
  run hpro annotate import "$C/review-importiert.hpro" "$C/review-anmerkungen.jsonld" "$K/doppelt.hpro" --time 2026-10-12T10:15:00Z
  echo "## Import aus einer zweiten Kopie mit abweichender Fassung derselben Anmerkung: als Konflikt gemeldet, die eigene bleibt"
  run hpro annotate import "$C/review.hpro" "$K/bearbeitet.hpro" "$K/konflikt.hpro" --time 2026-10-12T10:20:00Z
  echo "## Vergleich zweier Fassungen: Satz zur Lärmregel geändert, Rampenzeile gelöscht"
  python3 - > "$K/ops.json" <<'EOF'
import json
print(json.dumps([
  {"op": "set-text", "target": "content/index.xhtml#anf-laerm", "text": "Lärmintensive Arbeiten sind werktags vor 7:30 Uhr und nach 13:00 Uhr zulässig, freitags ab 12:00 Uhr."},
  {"op": "delete", "target": "content/index.xhtml#umfang-zugang"}
], ensure_ascii=False))
EOF
  cat "$K/ops.json"; echo
  run hpro edit apply "$C/review.hpro" "$C/review-geaendert.hpro" "$K/ops.json" --time 2026-10-12T11:00:00Z --note "Lärmregel ergänzt, Rampe entfällt"
  run hpro annotate compare "$C/review.hpro" "$C/review-geaendert.hpro"
  run hpro annotate list "$C/review-geaendert.hpro"
  echo "## Vergleich zweier Versionen derselben Datei aus dem Verlauf"
  echo "# Das Verlaufsjournal beginnt mit der ersten Textbearbeitung (P5, HPC-0008); Anmerkungsschritte davor"
  echo "# stehen im Verlauf, sind aber nicht wiederherstellbar – der Vergleich sagt das, statt zu raten."
  run hpro history "$C/review-geaendert.hpro"
  run hpro annotate compare "$C/review-geaendert.hpro" --from 12 --to 13
  run hpro annotate compare "$C/review-geaendert.hpro" --from 1 --to 4
} > "$OUT/02-abnahme-kommandozeile.txt" 2>&1

# The reader run (07) writes review-reader.hpro and the panel content; 03–05 and 08 check them.
{
  echo "# P7 Reader: Unit-Tests, Browser-Tests und Beleglauf"
  echo
  echo "## vitest app/test/annotations.test.ts"
  (cd app && run npx vitest run test/annotations.test.ts)
  echo "## Playwright (Chromium) app/e2e/anmerkungen.spec.ts – Teil von npm test"
  (cd app && npx vite build > /dev/null 2>&1; run env PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers" npx playwright test --project=chromium e2e/anmerkungen.spec.ts)
  echo "## Beleglauf app/e2e/p7-belege.spec.ts (Datei aus der Kommandozeile im Reader, Bildschirmfotos, Speichern, Messungen)"
  (cd app && run npm run -s belege:p7)
} > "$OUT/07-reader.txt" 2>&1

{
  echo "# P7 Abnahme 2 unabhängig geprüft (Python, kein Code aus kern/)"
  echo "# a) Was der Reader anzeigt (reader-anzeige.json, aus dem DOM der Leiste gelesen) gegen die rohen"
  echo "#    JSON-LD-Dateien von review.hpro: jeder Thread, Autor, Zeit, Zitat, Text, Farbe, Status, jede Antwort."
  echo "# b) Was der Reader speichert (review-reader.hpro): jede vorhandene Anmerkungsdatei byte-gleich,"
  echo "#    Hash-Manifest und package.opf führen die neuen Dateien."
  echo
  run "$PY" - "$C/review.hpro" "$C/reader-anzeige.json" "$C/review-reader.hpro" <<'EOF'
import base64, hashlib, json, sys, zipfile
src, shown_path, saved = sys.argv[1:4]
z = zipfile.ZipFile(src)
anns = {}
for n in z.namelist():
    if n.startswith('annotations/'):
        a = json.loads(z.read(n)); anns[a['id']] = a
def text(a): return a.get('body', {}).get('value', '')
def quote(a):
    t = a['target']
    if isinstance(t, dict):
        for s in (t.get('selector') if isinstance(t.get('selector'), list) else [t.get('selector')]):
            if s and s.get('type') == 'TextQuoteSelector': return s['exact']
    return None
def color(a):
    t = a['target']; c = t.get('styleClass') if isinstance(t, dict) else None
    return c[3:] if c else None
roots = [a for a in anns.values() if a['motivation'] != 'replying']
def root_of(a):
    while a['motivation'] == 'replying': a = anns[a['target']]
    return a['id']
def instant(s):
    from datetime import datetime
    return datetime.fromisoformat(s.replace('Z', '+00:00'))
shown = json.load(open(shown_path, encoding='utf-8'))
print('Anmerkungsdateien im Container:', len(anns), '| Threads in den Dateien:', len(roots), '| Threads in der Leiste:', len(shown['threads']))
errors = []
for t in shown['threads']:
    r = anns.get(t['id'])
    if r is None: errors.append(f"{t['id']}: in der Leiste, nicht in der Datei"); continue
    for k, want in (('author', r['creator']['name']), ('created', r['created']), ('text', text(r)), ('quote', quote(r)), ('color', color(r))):
        if (t.get(k) or None) != (want or None): errors.append(f"{t['id']} {k}: Leiste {t.get(k)!r}, Datei {want!r}")
    replies = sorted([a for a in anns.values() if a['motivation'] == 'replying' and root_of(a) == r['id']], key=lambda a: (instant(a['created']), a['id']))
    with_status = [a for a in [r] + replies if 'hp:status' in a]
    status = max(with_status, key=lambda a: (instant(a['created']), a['id']))['hp:status'] if with_status else 'open'
    if t['status'] != status: errors.append(f"{t['id']} Status: Leiste {t['status']}, Datei {status}")
    got = [(x['author'], x['created'], x['text']) for x in t['replies']]
    want = [(a['creator']['name'], a['created'], text(a)) for a in replies]
    if got != want: errors.append(f"{t['id']} Antworten: Leiste {got}, Datei {want}")
    print(f"  {t['status']:9} {t['kind']:12} {r['creator']['name']:28} {len(t['replies'])} Antworten  {(quote(r) or text(r) or '')[:40]!r}")
missing = {a['id'] for a in roots} - {t['id'] for t in shown['threads']}
if missing: errors.append(f'nicht angezeigt: {sorted(missing)}')
print('Markierungen im Dokument:', shown['marks'], '| Zeichnungen (Pfade):', shown['inkPaths'], '| Thread-Knöpfe im Text:', shown['buttons'])
want_marks = sum(1 for a in roots if quote(a))
if shown['marks'] != want_marks: errors.append(f"Markierungen {shown['marks']}, Zitate in den Dateien {want_marks}")
s = zipfile.ZipFile(saved)
old = [n for n in z.namelist() if n.startswith('annotations/')]
new = [n for n in s.namelist() if n.startswith('annotations/') and n not in old]
same = [n for n in old if n in s.namelist() and s.read(n) == z.read(n)]
print('Vom Reader gespeichert:', len(old), 'vorhandene Dateien, davon byte-gleich', len(same), '| neu:', len(new))
if len(same) != len(old): errors.append('vorhandene Anmerkungsdatei verändert oder verloren')
man = json.loads(s.read('manifest.json')); opf = s.read('package.opf').decode()
listed = {r['url']: r['integrity'] for r in man['resources']}
for n in old + new:
    want = 'sha256-' + base64.b64encode(hashlib.sha256(s.read(n)).digest()).decode()
    if listed.get(n) != want: errors.append(f'{n}: integrity im Manifest fehlt oder falsch')
    if f'href="{n}"' not in opf: errors.append(f'{n}: nicht in package.opf')
print('Manifest und package.opf: alle', len(old) + len(new), 'Anmerkungsdateien verzeichnet, SHA-256 stimmt' if not any('integrity' in e or 'package.opf' in e for e in errors) else '')
for e in errors: print('FEHLER', e)
print('Ergebnis:', 'ohne Abweichung' if not errors else f'{len(errors)} Abweichungen')
sys.exit(1 if errors else 0)
EOF
  echo "## Die im Reader gespeicherte Datei, gelesen von der Kommandozeile"
  run hpro annotate list "$C/review-reader.hpro"
  run hpro annotate check "$C/review-reader.hpro"
  run hpro inspect "$C/review-reader.hpro"
} > "$OUT/08-abnahme2-reader.txt" 2>&1

{
  echo "# P7 Signiertes Dokument: Anmerkungen nach der Signatur (HP-ANNO-007, Zusage 5)"
  echo
  run hpro sign "$C/review.hpro" "$C/review-signiert.hpro" --key "$K/sig-key.pem" --cert "$C/sig-cert.pem" --time 2026-10-12T12:00:00Z
  run hpro validate "$C/review-signiert.hpro" --trust "$C/sig-cert.pem" --time 2026-10-12T13:00:00Z
  echo "## Nach der Signatur: Antwort und neuer Kommentar; manifest.json und package.opf bleiben unverändert"
  run hpro annotate reply "$C/review-signiert.hpro" "$K/s1.hpro" --to "$LUFT" --text "Nachweis liegt jetzt bei." --author "Max Huber (Planung)" --time 2026-10-12T13:00:00Z
  run hpro annotate add "$K/s1.hpro" "$C/review-signiert-angemerkt.hpro" --target "$I#anf-abnahme" --quote "gemeinsam" --text "Termin für die Abnahme bitte bis Ende August festlegen." --author "Schulleitung VS Beispielort" --time 2026-10-12T13:05:00Z
  for f in manifest.json package.opf META-INF/signatures.xml; do
    entry "$C/review-signiert.hpro" "$f" > "$K/a"; entry "$C/review-signiert-angemerkt.hpro" "$f" > "$K/b"
    run cmp "$K/a" "$K/b"
  done
  run hpro annotate list "$C/review-signiert-angemerkt.hpro"
  echo "## Eigene Prüfung: Signatur gültig, die zwei neuen Dateien als nicht signiert benannt"
  run hpro validate "$C/review-signiert-angemerkt.hpro" --trust "$C/sig-cert.pem" --time 2026-10-12T14:00:00Z
  echo "## EU DSS 6.5 (Richtlinie hpro, Vertrauensanker sig-cert.pem)"
  run dss validate "$C/review-signiert-angemerkt.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Signierte Anmerkungen sind geschützt: Bearbeiten und Löschen abgelehnt (Exit 1)"
  run hpro annotate edit "$C/review-signiert-angemerkt.hpro" "$K/nein4.hpro" --id "$LAERM" --text "geändert" --time 2026-10-12T14:00:00Z
  run hpro annotate delete "$C/review-signiert-angemerkt.hpro" "$K/nein5.hpro" --id "$RAMPE" --time 2026-10-12T14:00:00Z
  echo "## Manipulation einer signierten Anmerkung im ZIP (Text geändert): eigene Prüfung und DSS schlagen an"
  python3 - "$C/review-signiert-angemerkt.hpro" "$K/manipuliert.hpro" "annotations/${LAERM#urn:uuid:}.jsonld" <<'EOF'
import sys, zipfile
src, dst, target = sys.argv[1:4]
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, 'w')
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == target:
        assert '12:00 Uhr'.encode() in d
        d = d.replace('12:00 Uhr'.encode(), '14:00 Uhr'.encode())
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
print('geändert:', target)
EOF
  run hpro validate "$K/manipuliert.hpro" --trust "$C/sig-cert.pem" --time 2026-10-12T14:00:00Z
  run dss validate "$K/manipuliert.hpro" "$C/sig-cert.pem" "$POLICY"
  run hpro annotate list "$K/manipuliert.hpro"
} > "$OUT/06-signiert-dss.txt" 2>&1

{
  echo "# P7 Gegenprobe gegen das W3C Web Annotation Data Model (kein Code aus kern/)"
  echo
  run "$PY" scripts/p7-w3c-gegenprobe.py "$WPT/annotation-model" "$WPT/contexts/anno.jsonld" "$C/review.hpro" "$C/review-reader.hpro" "$C/review-signiert-angemerkt.hpro" "$C/review-anmerkungen.jsonld"
  echo "## Negativprobe: absichtlich fehlerhafte Anmerkungen (body und bodyValue, Datum, fehlendes Ziel) – muss scheitern"
  run "$PY" scripts/p7-w3c-gegenprobe.py "$WPT/annotation-model" "$WPT/contexts/anno.jsonld" "$OUT/gegenprobe/negativ.jsonld"
} > "$OUT/03-w3c-gegenprobe.txt" 2>&1

{
  echo "# P7 epubcheck 5.4.0 über alle Container"
  echo
  for f in "$C"/*.hpro; do
    cp "$f" "$K/check.epub"
    echo "## $(basename "$f")"
    run "$JAVA" -jar "$EPUBCHECK" "$K/check.epub"
  done
} > "$OUT/04-epubcheck.txt" 2>&1

{
  echo "# P7 hpro-check (Konformitätsprüfer) über alle Container"
  echo
  for f in "$C"/*.hpro; do
    echo "## $(basename "$f")"
    run node kern/build/bin/hpro-check.js "$f"
  done
} > "$OUT/05-hpro-check.txt" 2>&1

{
  echo "# P7 Messungen"
  echo
  echo "## Kern: Zeiten je Vorgang bei 10, 100 und 1000 Anmerkungen (Node $(node --version), Median aus 10 Läufen nach 2 Aufwärmläufen)"
  node --input-type=module - "$C/review-0-leer.hpro" <<'EOF'
import { readFileSync } from 'node:fs';
import { annotate, readContainer } from './kern/dist/index.js';
const empty = readFileSync(process.argv[2]);
const I = 'content/index.xhtml';
const ids = ['gegenstand-text', 'gegenstand-ziel', 'anf-laerm', 'anf-staub', 'anf-abnahme', 'umfang-boden', 'umfang-lueftung'];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(fn) {
  for (let i = 0; i < 2; i++) await fn();
  const t = [];
  for (let i = 0; i < 10; i++) { const t0 = performance.now(); await fn(); t.push(performance.now() - t0); }
  return `${median(t).toFixed(1).padStart(7)} ms`;
}
console.log('Anmerkungen | Container  | lesen + verankern | speichern (1 neue) | Export JSON-LD | Export CSV | Vergleich');
for (const n of [10, 100, 1000]) {
  const index = new annotate.DocumentIndex((await readContainer(empty)).files);
  const add = [];
  for (let i = 0; i < n; i++) {
    const el = ids[i % ids.length];
    const words = index.text(I, el).text.split(' ');
    const w = words[(i * 7) % words.length];
    const quote = annotate.quoteOfText(index, `${I}#${el}`, w, 1);
    add.push(i % 3 === 2 && add.length
      ? annotate.createReply({ to: add[add.length - 1].id, text: `Antwort ${i}`, author: 'Messung', created: '2026-10-12T08:00:00Z', id: annotate.randomId(), status: i % 6 === 5 ? 'resolved' : undefined })
      : annotate.createAnnotation({ kind: i % 2 ? 'highlight' : 'comment', address: `${I}#${el}`, quote, color: i % 2 ? 'gelb' : undefined, text: `Anmerkung ${i}`, author: 'Messung', created: '2026-10-12T08:00:00Z', id: annotate.randomId() }));
  }
  const bytes = (await annotate.saveAnnotations(empty, { add }, { modified: '2026-10-12T09:00:00Z' })).bytes;
  const one = () => [annotate.createAnnotation({ kind: 'comment', address: `${I}#anf-staub`, text: 'neu', author: 'Messung', created: '2026-10-12T10:00:00Z', id: annotate.randomId() })];
  const changed = (await annotate.saveAnnotations(bytes, { add: one() }, { modified: '2026-10-12T10:00:00Z' })).bytes;
  const read = await time(() => annotate.readAnnotations(bytes));
  const save = await time(async () => annotate.saveAnnotations(bytes, { add: one() }, { modified: '2026-10-12T10:00:00Z' }));
  const set = await annotate.readAnnotations(bytes);
  const jsonld = await time(async () => annotate.serializeCollection(annotate.toCollection(set, { id: 'urn:x', title: 'Messung' }, '2026-10-12T10:00:00Z')));
  const csv = await time(async () => annotate.toCsv(set));
  const cmp = await time(() => annotate.reviewReport(bytes, changed));
  console.log(`${String(n).padStart(11)} | ${String(bytes.length).padStart(8)} B | ${read.padStart(17)} | ${save.padStart(18)} | ${jsonld.padStart(14)} | ${csv.padStart(10)} | ${cmp}`);
}
EOF
  echo
  echo "## Größen"
  for f in "$C"/*.hpro "$C"/*.jsonld "$C"/*.csv "$C"/*.xhtml; do printf '%-40s %8d Bytes\n' "$(basename "$f")" "$(stat -c %s "$f")"; done
  python3 - "$C/review.hpro" <<'EOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
s = [i for i in z.infolist() if i.filename.startswith('annotations/')]
print('Anmerkungsdateien in review.hpro: %d, zusammen %d Bytes (komprimiert %d), Mittel %d Bytes je Datei' % (len(s), sum(i.file_size for i in s), sum(i.compress_size for i in s), sum(i.file_size for i in s) // len(s)))
EOF
  echo
  echo "## Reader (docs/belege/P7/messungen-reader.json)"
  python3 - "$OUT/messungen-reader.json" <<'EOF'
import json, sys
m = json.load(open(sys.argv[1]))
for k, v in m['oeffnen'].items():
    print('Öffnen bis Leiste vollständig (%s): Median %d ms, Max %d ms über %d Läufe' % (k, v['medianMs'], v['maxMs'], v['laeufe']))
for k, v in m['waagrechtesScrollen'].items():
    print('Breite %-7s %4d px: Rahmen scrollWidth %d / clientWidth %d, Hülle %d / %d' % (k, v['breite'], v['rahmen']['scrollWidth'], v['rahmen']['clientWidth'], v['huelle']['scrollWidth'], v['huelle']['clientWidth']))
print('Netzwerkanfragen außerhalb des Readers während des Beleglaufs: %d' % len(m['netzwerkAnfragenAusserhalbDesReaders']))
EOF
} > "$OUT/09-messungen.txt" 2>&1

# Keine Server liegen lassen (vite preview aus Playwright, siehe Läufer-Prüfung mit npm ci).
for p in $(pgrep -f 'vite preview' || true); do [ "$(cat /proc/$p/comm 2>/dev/null)" = node ] && kill "$p"; done

if [ "${P7_OHNE_NPM:-}" != 1 ]; then
{
  echo "# P7 Prüfung wie der Läufer (runner/auto_lauf.py: npm ci, dann npm test --if-present)"
  echo "# davor und danach: Prozesse, die node_modules offen halten könnten"
  echo
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, vorher"; stray; echo
  run npm ci --no-audit --no-fund
  run npm test --if-present
  echo "\$ ps -eo pid,comm,args   # Nicht-Shell-Prozesse mit 'vite preview' oder node_modules/, nachher"; stray; echo
} > "$OUT/10-npm-test.txt" 2>&1
fi

echo "Belege P7 geschrieben nach $OUT"
grep -H "Exit-Code" "$OUT"/[01]*.txt | sort | uniq -c
