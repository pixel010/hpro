#!/usr/bin/env bash
# Erzeugt die Belege für Paket P5 (Editor: strukturierte Bearbeitung, echtes Redigieren,
# Versionierung) unter docs/belege/P5/.
#
#  00 Werkzeuge und Versionen
#  01 Kern-Tests kern/test/edit.test.ts (wörtlich)
#  02 Abnahme 1: Bearbeiten über die Kommandozeile, Rohausgabe des Containers (Python zipfile)
#  03 Abnahme 3: Vergleich zweier Fassungen (zwei Dateien und aus dem Verlauf einer Datei)
#  04 Abnahme 2: Redaktion über alle Fassungen, Volltextsuche (Kern und unabhängig), Protokoll,
#     Konformitätsprüfer mit --redacted
#  05 Verlauf: Fassungen, byte-genaue Wiederherstellung, Manipulation des Journals
#  06 Eingefrorene Fassung: signieren, Hauptfassung bearbeiten, EU DSS 6.5 und Kern prüfen
#  07 epubcheck 5.4.0 über alle erzeugten Container
#  08 hpro-check (Konformitätsprüfer) über alle erzeugten Container
#  09 Reader: Playwright e2e/bearbeiten.spec.ts, Unit-Tests app/test/editor.test.ts, Bildschirmfotos
#  10 Messungen: Größe des Journals, Zeiten für Speichern, Wiederherstellen, Vergleichen, Redigieren
#
# Voraussetzung: Node >= 22, JDK 21 und epubcheck 5.4.0 unter prototyp/tools/, das DSS-Werkzeug
# unter prototyp/dss/target/ (docs/05), prototyp/out/policy-hpro.xml. Private Testschlüssel bleiben
# unter prototyp/out/p5/ (nicht im Repo).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/P5
C=$OUT/container
K=prototyp/out/p5
OPS=$OUT/ops
JAVA=prototyp/tools/jdk-21.0.12.1+1/bin/java
EPUBCHECK=prototyp/tools/epubcheck-5.4.0/epubcheck.jar
POLICY=$OUT/policy-hpro.xml
R=nachweis-2026-10-12
mkdir -p "$C" "$K"
rm -f "$C"/*.hpro "$C"/*.pem "$C"/*.xhtml "$C"/*.json

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
hpro() { node kern/build/bin/hpro.js "$@"; }
dss() { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "prototyp/dss/target/classes:prototyp/dss/target/lib/*" example.hpro.HproDss "$@"; }
entry() { python3 -c "import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())" "$1" "$2"; }

[ -f prototyp/out/policy-hpro.xml ] || { echo "fehlt: prototyp/out/policy-hpro.xml (prototyp/run_experiment.sh ausführen)"; exit 2; }
cp prototyp/out/policy-hpro.xml "$POLICY"
npm run build -w kern --silent && npm run build:test -w kern --silent || exit 2

hpro keygen "$K/sig-key.pem" "$C/sig-cert.pem" --alg ec --cn "Gemeinde Beispielort (Testsignatur)" --not-before 2026-10-01T00:00:00Z > "$K/keygen-sig.txt"

{
  echo "# P5 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run "$JAVA" -version
  run "$JAVA" -jar "$EPUBCHECK" --version
  echo "DSS-Version laut Maven-Abhängigkeiten:"
  ls prototyp/dss/target/lib | grep -E '^dss-(xades|asic-xades|validation|enumerations)-[0-9]'
  echo
  run python3 --version
  echo "Schlüssel (TEST, selbstsigniert; privater Schlüssel unter $K, nicht im Repo):"
  cat "$K/keygen-sig.txt"
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# P5 Kern-Tests (kern/test/edit.test.ts)"
  echo
  run node --test kern/build/test/edit.test.js
} > "$OUT/01-kern-tests.txt" 2>&1

{
  echo "# P5 Abnahme 1: bearbeiteter Text steht im Containerinhalt, nicht in einer Overlay-Schicht"
  echo
  echo "## Ausgangsdatei (Beispiel docs/spezifikation/beispiele/p5-bearbeiten/)"
  run node scripts/p5-beispiel.mjs "$C/00-ausgang.hpro"
  echo "## Blockstruktur mit Zeigern (Auszug: Dokument content/index.xhtml)"
  run hpro edit blocks "$C/00-ausgang.hpro" --doc content/index.xhtml
  echo "## Operationen (docs/belege/P5/ops/01-bearbeiten.json)"
  cat "$OPS/01-bearbeiten.json"
  echo
  run hpro edit apply "$C/00-ausgang.hpro" "$C/01-bearbeitet.hpro" "$OPS/01-bearbeiten.json" --time 2026-10-12T09:00:00Z
  echo "## Rohausgabe des Containers (Python zipfile, kein Code aus kern/)"
  run python3 scripts/p5-rohausgabe.py "$C/00-ausgang.hpro" "$C/01-bearbeitet.hpro" "$OPS/01-texte.txt" stand-h stand-text termin-tabelle punkte fn-2 sicherheit-auf-der-baustelle abb-geruestanker
  echo "## Navigation (Abschnitt eingefügt, Überschrift nachgeführt)"
  entry "$C/01-bearbeitet.hpro" content/nav.xhtml | grep -n '<a '
  echo
  echo "## Manifest: Hash des Inhaltsdokuments und Verlaufseintrag (HP-META-006)"
  entry "$C/01-bearbeitet.hpro" manifest.json | python3 -c "import json,sys,hashlib,base64,zipfile; m=json.load(sys.stdin); z=zipfile.ZipFile(sys.argv[1]); [print(r['url'], r['integrity'], 'stimmt' if r['integrity']=='sha256-'+base64.b64encode(hashlib.sha256(z.read(r['url'])).digest()).decode() else 'ABWEICHUNG') for r in m['resources'] if r['url'] in ('content/index.xhtml','content/nav.xhtml','content/media/geruestanker.png','data/history.json')]; [print(h) for h in m['history']]" "$C/01-bearbeitet.hpro"
  echo
  echo "## Abgelehnt: Änderungen, die Struktur oder Sperren verletzen würden (Exit 1, nichts geschrieben)"
  printf '[{"op":"delete","target":"content/index.xhtml#termine"}]\n' > "$K/tot.json"
  run hpro edit apply "$C/01-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" "$K/tot.json" --time 2026-10-12T09:30:00Z
  printf '[{"op":"set-heading-level","target":"content/index.xhtml#termine-h","level":4}]\n' > "$K/sprung.json"
  run hpro edit apply "$C/01-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" "$K/sprung.json" --time 2026-10-12T09:30:00Z
  printf '[{"op":"set-text","target":"content/index.xhtml#einleitung","inline":"Text <img src=\\"x\\" onerror=\\"alert(1)\\"/>"}]\n' > "$K/inline.json"
  run hpro edit apply "$C/01-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" "$K/inline.json" --time 2026-10-12T09:30:00Z
  printf '[{"op":"insert","ref":"content/index.xhtml#stand","position":"after","block":{"type":"section","heading":"Neu","id":"teilnehmende"}}]\n' > "$K/id.json"
  run hpro edit apply "$C/01-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" "$K/id.json" --time 2026-10-12T09:30:00Z
  run ls "$K/nicht-geschrieben.hpro"
} > "$OUT/02-abnahme1-bearbeiten-rohausgabe.txt" 2>&1

{
  echo "# P5 Abnahme 3: Vergleich zweier Fassungen (Überschrift, Absatz, entferntes Bild)"
  echo
  echo "## Operationen (docs/belege/P5/ops/02-vergleich.json)"
  cat "$OPS/02-vergleich.json"
  echo
  run hpro edit apply "$C/01-bearbeitet.hpro" "$C/02-vergleich.hpro" "$OPS/02-vergleich.json" --time 2026-10-12T10:00:00Z
  echo "## Vergleich zweier Dateien"
  run hpro diff "$C/01-bearbeitet.hpro" "$C/02-vergleich.hpro" --html "$C/vergleich-1-2.xhtml" --json "$C/vergleich-1-2.json"
  echo "## Derselbe Vergleich aus dem Verlauf einer einzigen Datei (Fassung 1 → 2)"
  run hpro diff "$C/02-vergleich.hpro" --from 1 --to 2
  echo "## Alle Änderungen seit der Ausgangsfassung (Fassung 0 → 2)"
  run hpro diff "$C/02-vergleich.hpro" --from 0 --to 2
  echo "## Maschinenlesbar (Auszug aus container/vergleich-1-2.json)"
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('Anzahl:', d['counts']); [print(c['kind'], c.get('from'), '→', c.get('to'), '|', c.get('before'), '→', c.get('after'), '|', [w['op']+w['text'] for w in c.get('words', []) if w['op']!='=']) for c in d['changes']]" "$C/vergleich-1-2.json"
  echo
  echo "## Bericht als XHTML (container/vergleich-1-2.xhtml), wohlgeformt?"
  python3 -c "import sys,xml.dom.minidom as m; d=m.parse(sys.argv[1]); print('ja,', len(d.getElementsByTagName('section')), 'Abschnitte,', len(d.getElementsByTagName('del')), 'del,', len(d.getElementsByTagName('ins')), 'ins')" "$C/vergleich-1-2.xhtml"
} > "$OUT/03-abnahme3-vergleich.txt" 2>&1

{
  echo "# P5 Abnahme 2: Redaktion entfernt den Text aus Container, Verlauf und Textsuche; Protokoll"
  echo
  echo "## Personendaten in einer weiteren Fassung (Anhang, mit Mobilnummer)"
  cat "$OPS/03-kontakt.json"
  echo
  run hpro edit apply "$C/02-vergleich.hpro" "$C/03-mit-kontakt.hpro" "$OPS/03-kontakt.json" --time 2026-10-12T11:00:00Z
  echo "## Vorher: Kern-Volltextsuche (alle Einträge in allen Lesarten, ZIP roh)"
  run hpro lock search "$C/03-mit-kontakt.hpro" --terms-file "$OPS/begriffe-redaktion.txt"
  echo "## Vorher: jede Fassung des Verlaufs einzeln wiederhergestellt und durchsucht"
  for v in 0 1 2 3; do
    hpro history checkout "$C/03-mit-kontakt.hpro" "$v" "$K/vorher-$v.hpro" > /dev/null
    echo "\$ python3 scripts/p17-zipscan.py <Fassung $v> begriffe-redaktion.txt"
    python3 scripts/p17-zipscan.py "$K/vorher-$v.hpro" "$OPS/begriffe-redaktion.txt" 2>&1 | tail -2; echo "[Exit-Code ${PIPESTATUS[0]}]"
  done
  echo
  echo "## Redaktion: Adresse content/anhang.xhtml#kontakte-text und Begriffe, mit Grund und Handelndem"
  run hpro lock redact "$C/03-mit-kontakt.hpro" "$C/04-redigiert.hpro" --time 2026-10-12T12:00:00Z --target 'content/anhang.xhtml#kontakte-text' --terms-file "$OPS/begriffe-redaktion.txt" --reason 'Personenbezogene Daten (DSGVO Art. 5 Abs. 1 lit. c)' --actor 'Gemeinde Beispielort, Hochbau'
  echo "## Nachher: Kern-Volltextsuche (Exit 0 = kein Treffer)"
  run hpro lock search "$C/04-redigiert.hpro" --terms-file "$OPS/begriffe-redaktion.txt"
  echo "## Nachher: unabhängige Volltextsuche (Python zipfile, html.unescape, JSON, ZIP roh UTF-8/UTF-16)"
  run python3 scripts/p17-zipscan.py "$C/04-redigiert.hpro" "$OPS/begriffe-redaktion.txt"
  echo "## Nachher: jede frühere Fassung aus dem Verlauf wiederhergestellt und durchsucht"
  run hpro history "$C/04-redigiert.hpro"
  for v in 0 1 2 3; do
    hpro history checkout "$C/04-redigiert.hpro" "$v" "$C/04-redigiert-fassung-$v.hpro" > /dev/null
    run python3 scripts/p17-zipscan.py "$C/04-redigiert-fassung-$v.hpro" "$OPS/begriffe-redaktion.txt"
  done
  echo "## Adresse in jeder Fassung geleert (Platzhalter statt Text)"
  for v in 0 3; do
    echo "Fassung $v:"; entry "$C/04-redigiert-fassung-$v.hpro" content/anhang.xhtml | grep -n 'kontakte-text'
  done
  echo "Aktuell:"; entry "$C/04-redigiert.hpro" content/anhang.xhtml | grep -n 'kontakte-text'
  entry "$C/04-redigiert.hpro" content/index.xhtml | grep -n 'data-hp-redacted'
  echo
  echo "## Textsuche des Readers (app/src/search.ts) über die Inhaltsdokumente"
  echo "(Unit-Test app/test/editor.test.ts und Browser-Test e2e/bearbeiten.spec.ts, wörtlich in 09-reader.txt)"
  echo
  echo "## Prüfprotokoll data/redaction-log.json"
  entry "$C/04-redigiert.hpro" data/redaction-log.json
  echo
  echo "## Verlauf im Manifest (nennt Adressen, keinen Inhalt)"
  entry "$C/04-redigiert.hpro" manifest.json | python3 -c "import json,sys; [print(h) for h in json.load(sys.stdin)['history']]"
  echo
  echo "## Vergleich der Redaktionsstufe (Fassung 3 → 4) zeigt die Redaktion, nicht den Inhalt"
  run hpro diff "$C/04-redigiert.hpro" --from 3 --to 4
  echo "## Konformitätsprüfer mit den redigierten Begriffen (HPR-LOCK-002 … 005)"
  run node kern/build/bin/hpro-check.js "$C/04-redigiert.hpro" --no-epubcheck --redacted 'Max Mustermann' --redacted '+43 512 123456' --json "$K/check-redigiert.json"
  python3 -c "import json,sys; r=json.load(open(sys.argv[1])); f=[x for x in r['results'] if x['rule'].startswith('HPR-LOCK')]; print('HPR-LOCK-Befunde:', [(x['rule'], x['message']) for x in f]); print('nicht geprüft (LOCK):', [x for x in r.get('notChecked', []) if x['rule'].startswith('HPR-LOCK')])" "$K/check-redigiert.json"
} > "$OUT/04-abnahme2-redaktion.txt" 2>&1

{
  echo "# P5 Verlauf: Fassungen einer Datei, byte-genaue Wiederherstellung, Manipulation erkannt"
  echo
  run hpro history "$C/03-mit-kontakt.hpro"
  echo "## Wiederhergestellte Fassungen gegen die damals gespeicherten Dateien (jeder Eintrag, Python zipfile)"
  for pair in "0:00-ausgang" "1:01-bearbeitet" "2:02-vergleich"; do
    v=${pair%%:*}; f=${pair#*:}
    hpro history checkout "$C/03-mit-kontakt.hpro" "$v" "$K/fassung-$v.hpro" > /dev/null
    python3 - "$C/$f.hpro" "$K/fassung-$v.hpro" "$v" <<'EOF'
import sys, zipfile, hashlib
a, b, v = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2]), sys.argv[3]
na, nb = sorted(a.namelist()), sorted(b.namelist())
same = [n for n in na if n in nb and a.read(n) == b.read(n)]
print(f'Fassung {v}: {len(na)} Einträge gespeichert, {len(nb)} wiederhergestellt, byte-gleich {len(same)}; abweichend: {sorted(set(na) ^ set(nb)) + [n for n in na if n in nb and a.read(n) != b.read(n)] or "keine"}')
print('  sha256 manifest.json gespeichert/wiederhergestellt:', hashlib.sha256(a.read('manifest.json')).hexdigest()[:16], hashlib.sha256(b.read('manifest.json')).hexdigest()[:16])
EOF
  done
  echo
  echo "## Journal data/history.json (Aufbau; Einträge gekürzt)"
  entry "$C/03-mit-kontakt.hpro" data/history.json | python3 -c "import json,sys; j=json.load(sys.stdin); print('format:', j['format']); [print('Eintrag', e['version'], '→ stellt Fassung', e['version']-1, 'her:', len(e['manifest']), 'Manifest-Hunks;', ', '.join(f\"{f['path']} ({[k for k in f if k!='path'][0]})\" for f in e['files'])) for e in j['entries']]"
  echo
  echo "## Manipulation: ein Zeichen in einem Patch des Journals geändert (Python zipfile, Hash im Manifest nachgetragen)"
  python3 - "$C/03-mit-kontakt.hpro" "$C/05-journal-manipuliert.hpro" <<'EOF'
import base64, hashlib, json, sys, zipfile
src, dst = sys.argv[1:3]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, 'w')
j = json.loads(zin.read('data/history.json'))
for f in j['entries'][0]['files']:
    if 'patch' in f:
        f['patch'][0][2] += 'X'; print('geändert: Eintrag 1,', f['path'], 'Hunk 1'); break
lines = ',\n'.join(json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in j['entries'])
jb = ('{\n"format": ' + json.dumps(j['format']) + ',\n"entries": [\n' + lines + '\n]\n}\n').encode()
for i in zin.infolist():
    d = zin.read(i.filename)
    if i.filename == 'data/history.json': d = jb
    if i.filename == 'manifest.json':
        m = json.loads(d)
        for r in m['resources']:
            if r['url'] == 'data/history.json': r['integrity'] = 'sha256-' + base64.b64encode(hashlib.sha256(jb).digest()).decode()
        d = (json.dumps(m, indent=2, ensure_ascii=False) + '\n').encode()
    zout.writestr(i, d, compress_type=i.compress_type)
zout.close()
EOF
  run hpro inspect "$C/05-journal-manipuliert.hpro"
  run hpro history "$C/05-journal-manipuliert.hpro"
} > "$OUT/05-verlauf.txt" 2>&1

{
  echo "# P5 Eingefrorene Fassung: Hauptfassung bearbeiten berührt die Signatur nicht (Zusage 5, HP-PROF-009)"
  echo
  run hpro lock freeze "$C/04-redigiert.hpro" "$C/06-nachweis.hpro" --id "$R" --time 2026-10-12T13:00:00Z --key "$K/sig-key.pem" --cert "$C/sig-cert.pem"
  run hpro lock frozen-check "$C/06-nachweis.hpro" --id "$R" --trust "$C/sig-cert.pem"
  echo "## Der Verlauf läuft durch das Einfrieren weiter; das Journal liegt nicht in der eingefrorenen Fassung"
  run hpro history "$C/06-nachweis.hpro"
  python3 -c "import zipfile,sys; n=zipfile.ZipFile(sys.argv[1]).namelist(); print('Journal in renditions/:', [x for x in n if x.startswith('renditions/') and 'history' in x] or 'nein')" "$C/06-nachweis.hpro"
  echo
  echo "## Hauptfassung strukturiert bearbeiten (docs/belege/P5/ops/06-nach-nachweis.json)"
  run hpro edit apply "$C/06-nachweis.hpro" "$C/07-nachweis-bearbeitet.hpro" "$OPS/06-nach-nachweis.json" --time 2026-10-12T14:00:00Z
  run hpro lock frozen-check "$C/07-nachweis-bearbeitet.hpro" --id "$R" --trust "$C/sig-cert.pem"
  echo "## EU DSS 6.5 (Richtlinie hpro, Vertrauensanker sig-cert.pem)"
  run dss validate "$C/07-nachweis-bearbeitet.hpro" "$C/sig-cert.pem" "$POLICY"
  echo "## Bearbeiter lehnt die eingefrorene Fassung ab"
  printf '[{"op":"set-text","target":"renditions/%s/content/index.xhtml#stand-h","text":"x"}]\n' "$R" > "$K/fassung.json"
  run hpro edit apply "$C/07-nachweis-bearbeitet.hpro" "$K/nicht-geschrieben.hpro" "$K/fassung.json" --time 2026-10-12T14:05:00Z
  echo "## Vergleich der Hauptfassung vor und nach der Bearbeitung (zwei Dateien; die eingefrorene Fassung ist in beiden gleich)"
  run hpro diff "$C/06-nachweis.hpro" "$C/07-nachweis-bearbeitet.hpro"
} > "$OUT/06-eingefrorene-fassung-dss.txt" 2>&1

{
  echo "# P5 epubcheck 5.4.0 über alle erzeugten Container"
  echo
  for f in "$C"/*.hpro; do
    cp "$f" "$K/check.epub"
    echo "## $(basename "$f")"
    run "$JAVA" -jar "$EPUBCHECK" "$K/check.epub"
  done
} > "$OUT/07-epubcheck.txt" 2>&1

{
  echo "# P5 hpro-check (Katalog Teil 1 v0.1) über die erzeugten Container"
  echo
  for f in 00-ausgang 01-bearbeitet 02-vergleich 03-mit-kontakt 04-redigiert 04-redigiert-fassung-0 06-nachweis 07-nachweis-bearbeitet; do
    run node kern/build/bin/hpro-check.js "$C/$f.hpro" --no-epubcheck --no-not-checked --trust "$C/sig-cert.pem" --time 2026-10-12T15:00:00Z
  done
} > "$OUT/08-hpro-check.txt" 2>&1

{
  echo "# P5 Reader: Unit-Tests (vitest) und Browser-Tests (Playwright, Chromium) gegen den Produktionsbuild"
  echo
  (cd app && run npx vitest run test/editor.test.ts --reporter=verbose)
  (cd app && run npx vite build --logLevel warn && PLAYWRIGHT_BROWSERS_PATH=$PWD/.browsers run npx playwright test --project=chromium e2e/bearbeiten.spec.ts)
  echo "## Bildschirmfotos (docs/belege/P5/screenshots/)"
  (cd app && PLAYWRIGHT_BROWSERS_PATH=$PWD/.browsers run npx playwright test --project=belege e2e/p5-belege.spec.ts)
  ls docs/belege/P5/screenshots/
} > "$OUT/09-reader.txt" 2>&1

{
  echo "# P5 Messungen (scripts/p5-messung.mjs)"
  echo
  run node scripts/p5-messung.mjs "$C/00-ausgang.hpro"
} > "$OUT/10-messungen.txt" 2>&1

# Keine Server liegen lassen (vite preview aus Playwright, siehe Läufer-Prüfung mit npm ci).
for p in $(pgrep -f 'vite preview' || true); do [ "$(cat /proc/$p/comm 2>/dev/null)" = node ] && kill "$p"; done

echo "Belege unter $OUT:"
ls -la "$OUT" "$C"
grep -H "Exit-Code" "$OUT"/0*.txt "$OUT"/10*.txt | sort | uniq -c | sort -rn | head -60
