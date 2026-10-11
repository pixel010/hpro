#!/usr/bin/env bash
# Erzeugt die Belege für Paket S6 (Tabellen und Formeln: Spezifikation, OpenFormula-Teilumfang)
# unter docs/belege/S6/.
#
#  1. Mechanische Prüfung von Teil 3 (scripts/check-formeln.mjs), Text und JSON
#  2. Selbsttest des Prüfers: absichtlich kaputte Varianten müssen erkannt werden
#  3. Referenzwerte (Abschnitt 16): Berechnung in Node (scripts/formeln-referenzwerte.mjs) und
#     unabhängig in Python; beide müssen mit der Tabelle im Dokument übereinstimmen
#  4. Gleichstand der maschinenlesbaren Funktionsliste (03-funktionen.json) mit dem Dokument,
#     Gegenzählung mit Python; Abgleich der Abschnittsnummern mit der OpenFormula-Norm
#  5. Quellenabruf: OpenFormula-Norm (SHA-256) und die externen Quellen aus Abschnitt 19 (HTTP-Status)
#  6. npm ci && npm test (schließt alle Spezifikationsprüfungen und Selbsttests ein)
#
# Voraussetzung: Node >= 22, Python 3, curl (nur für Schritt 5).
set -u
cd "$(dirname "$0")/.."

OUT=docs/belege/S6
TMP=prototyp/out/s6
SPEC=docs/spezifikation/03-tabellen-und-formeln.md
NORM_URL=https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html
mkdir -p "$OUT" "$TMP"

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }

{
  echo "# S6 Werkzeuge"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ), Commit-Basis: $(git rev-parse --short HEAD)"
  echo
  run node --version
  run python3 --version
  run wc -l "$SPEC" docs/spezifikation/03-funktionen.json scripts/check-formeln.mjs scripts/check-formeln-selftest.mjs scripts/formeln-referenzwerte.mjs
  echo "Tabellenkalkulationen für eine Gegenprobe (erwartet: nicht vorhanden; Gegenprobe ist Paket P19):"
  for p in soffice libreoffice localc gnumeric ssconvert; do printf '  %-12s %s\n' "$p" "$(command -v "$p" || echo 'nicht gefunden')"; done
  echo
} > "$OUT/00-werkzeuge.txt" 2>&1

{
  echo "# S6 Mechanische Prüfung von Teil 3 (Abnahmekriterien 1–5)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-formeln.mjs "$SPEC"
} > "$OUT/01-check-formeln.txt" 2>&1

node scripts/check-formeln.mjs "$SPEC" --json > "$OUT/02-check-formeln.json" 2>&1

{
  echo "# S6 Selbsttest des Prüfers: kaputte Varianten von Teil 3 müssen erkannt werden"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-formeln-selftest.mjs "$SPEC"
} > "$OUT/03-selftest.txt" 2>&1

{
  echo "# S6 Referenzwerte (Teil 3 Abschnitt 16): Node und unabhängig Python"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Regeln: binary64, kanonische Zahlform (kürzeste Round-Trip-Form), Rundung auf der Dezimalform,"
  echo "# Epoche 1899-12-30. Python nutzt datetime, decimal und repr() als zweite Implementierung."
  echo
  run node scripts/formeln-referenzwerte.mjs
  echo "## Python (unabhängige Berechnung) und Vergleich mit der Tabelle im Dokument"
  echo
  python3 - "$SPEC" <<'EOF'
import re, sys, datetime as dt
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP, ROUND_DOWN
E = dt.date(1899, 12, 30)
def canon(x):
    if isinstance(x, bool): return 'TRUE' if x else 'FALSE'
    if isinstance(x, int): return str(x)
    if x == 0: return '0'
    if x == int(x) and abs(x) < 1e21: return str(int(x))
    s = repr(x)  # shortest round-trip in Python 3
    if 'e' in s:
        m, e = s.split('e'); e = int(e)
        if m.endswith('.0'): m = m[:-2]
        return f"{m}e{'+' if e > 0 else '-'}{abs(e)}"
    return s
def serial(y, m, d):
    # roll-over like DATE: month > 12 and day > days-of-month carry (HPF-DAT-006)
    y2 = y + (m - 1) // 12; m2 = (m - 1) % 12 + 1
    return (dt.date(y2, m2, 1) - E).days + (d - 1)
def rnd(x, digits, mode):
    q = Decimal(1).scaleb(-digits)
    return float(Decimal(repr(x)).quantize(q, rounding=mode))
def edate(s, months):
    d = E + dt.timedelta(days=s)
    t = d.year * 12 + (d.month - 1) + months; y, m = divmod(t, 12); m += 1
    last = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
    return (dt.date(y, m, min(d.day, last)) - E).days
def pmt(r, n, pv, fv=0, t=0):
    f = (1 + r) ** n
    return -(pv * f + fv) * r / ((1 + r * t) * (f - 1))
ten = 0.0
for _ in range(10): ten += 0.1
s = (dt.date(2026, 10, 11) - E).days
py = {
 'R1': canon(s), 'R2': canon((dt.date(1900,3,1)-E).days), 'R3': canon((dt.date(1900,1,1)-E).days),
 'R4': canon((dt.date(9999,12,31)-E).days), 'R5': canon((dt.date(2000,2,29)-E).days),
 'R6': canon(0.1+0.2), 'R7': canon((0.1+0.2) == 0.3), 'R8': canon(1-0.9-0.1),
 'R9': canon(rnd(2.675, 2, ROUND_HALF_UP)), 'R10': canon(rnd(1.005, 2, ROUND_HALF_UP)),
 'R11': canon(rnd(-2.5, 0, ROUND_HALF_UP)), 'R12': canon(rnd(1234.5678, -2, ROUND_HALF_UP)),
 'R13': canon(1e21), 'R14': canon(0.1*3), 'R15': canon((8*3600+30*60)/86400),
 'R16': canon(-7 - 3 * ((-7) // 3)), 'R17': canon(int(-2.5 // 1)), 'R18': canon(rnd(-2.5, 0, ROUND_DOWN)),
 'R19': canon(serial(2026, 13, 1)), 'R20': canon(serial(2026, 2, 30)), 'R21': canon(edate((dt.date(2026,1,31)-E).days, 1)),
 'R22': canon((dt.date(2026,10,11).isoweekday() % 7) + 1), 'R23': canon(dt.date(2026,10,11).isocalendar()[1]),
 'R24': canon(ten), 'R25': canon(float(2**53) + 1), 'R26': canon(1e-7), 'R27': canon(-0.0),
 'R28': canon(rnd(2.675, 2, ROUND_DOWN)), 'R29': canon(pmt(0.05/12, 360, 200000)),
 'R30': canon((dt.date(2026,12,31)-dt.date(2026,1,1)).days),
}
doc = {}
text = open(sys.argv[1], encoding='utf-8').read()
block = text.split('<!-- REFERENZWERTE ANFANG -->')[1].split('<!-- REFERENZWERTE ENDE -->')[0]
for m in re.finditer(r'^\| (R\d+) \| .*? \| `([^`]+)` \|', block, re.M):
    doc[m.group(1)] = m.group(2)
ok = 0
for k in sorted(py, key=lambda x: int(x[1:])):
    status = 'ok' if py[k] == doc.get(k) else 'ABWEICHUNG'
    ok += status == 'ok'
    print(f"{status:10} {k:4} python={py[k]:<24} dokument={doc.get(k)}")
print(f"{ok} von {len(py)} Referenzwerten stimmen zwischen Python und Dokument überein (Node-Vergleich: check-formeln.mjs, reference-value-mismatch)")
EOF
} > "$OUT/04-referenzwerte.txt" 2>&1

{
  echo "# S6 Gleichstand der maschinenlesbaren Funktionsliste (03-funktionen.json) und Abgleich mit der Norm"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run node scripts/check-formeln.mjs --export "$TMP/funktionen-neu.json"
  run cmp docs/spezifikation/03-funktionen.json "$TMP/funktionen-neu.json"
  run sha256sum docs/spezifikation/03-funktionen.json "$TMP/funktionen-neu.json"
  echo "## Gegenzählung mit Python"
  python3 - <<'EOF'
import json, collections
c = json.load(open('docs/spezifikation/03-funktionen.json'))
f = c['functions']
names = [x['name'] for x in f]
print(f"Funktionen: {len(f)}; eindeutig: {len(names) == len(set(names))}; alphabetisch: {names == sorted(names)}")
missing = [x['name'] for x in f if not all(x.get(k) for k in ('signature', 'result', 'errors', 'openformula'))]
print(f"Funktionen ohne Signatur, Ergebnis, Fehlerverhalten oder Quelle: {missing}")
groups = collections.Counter('.'.join(x['openformula'].split('.')[:2]) for x in f)
print("je Normabschnitt: " + ' '.join(f"{k}={v}" for k, v in sorted(groups.items(), key=lambda kv: int(kv[0].split('.')[1]))))
ex = [x['name'] for x in c['excluded']]
print(f"Ausgeschlossen: {len(ex)}; Überschneidung mit unterstützt: {sorted(set(ex) & set(names))}")
print(f"Teil-0-Verbote in der Ausschlussliste: {[n for n in ('NOW','TODAY','RAND','RANDBETWEEN','WEBSERVICE','DDE','HYPERLINK') if n in ex]}")
print(f"Fehlerwerte: {[e['name'] for e in c['errors']]}")
EOF
  echo
  echo "## Abgleich der Abschnittsnummern mit den Überschriften der OpenFormula-Norm (prototyp/out/s6/headings.txt)"
  if [ -f "$TMP/headings.txt" ]; then
    python3 - "$TMP/headings.txt" <<'EOF'
import json, re, sys
heads = {}
for h in open(sys.argv[1], encoding='utf-8').read().splitlines():
    m = re.match(r'^(6\.\d+\.\d+) (\S+)$', h)
    if m: heads[m.group(2)] = m.group(1)
c = json.load(open('docs/spezifikation/03-funktionen.json'))
bad = [(x['name'], x['openformula'], heads.get(x['name'])) for x in c['functions'] if heads.get(x['name']) != x['openformula']]
print(f"{len(c['functions']) - len(bad)} von {len(c['functions'])} Abschnittsnummern stimmen mit der Norm überein; Abweichungen: {bad}")
EOF
  else
    echo "headings.txt fehlt (Norm nicht geladen): Abgleich nicht ausgeführt"
  fi
} > "$OUT/05-funktionsliste.txt" 2>&1

{
  echo "# S6 Quellen: OpenFormula-Norm (Abruf, SHA-256, Überschriften) und HTTP-Status der externen Quellen aus Abschnitt 19"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  if [ ! -f "$TMP/part4-formula.html" ]; then run curl -sSL -o "$TMP/part4-formula.html" "$NORM_URL"; fi
  run sha256sum "$TMP/part4-formula.html"
  run wc -c "$TMP/part4-formula.html"
  python3 - "$TMP" <<'EOF'
import re, html, sys
tmp = sys.argv[1]
t = open(f'{tmp}/part4-formula.html', encoding='utf-8', errors='replace').read()
heads = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', h))).strip() for _, h in re.findall(r'<h([1-6])[^>]*>(.*?)</h\1>', t, flags=re.S)]
open(f'{tmp}/headings.txt', 'w', encoding='utf-8').write('\n'.join(heads))
print(f"Überschriften extrahiert: {len(heads)}; Titel: {heads[0] if heads else '?'}")
for want in ('2.3.2 OpenDocument Formula Small Group Evaluator', '3.4 Host-Defined Behaviors', '3.7 Basic Limits', '4.6 Error', '5.8 References', '5.12 Constant Errors', '6.17.5 ROUND', '6.16.61 SUM'):
    print(f"  {'ok' if want in heads else 'FEHLT':5} {want}")
EOF
  echo
  echo "## HTTP-Status der externen Quellen (curl -I, 20 s)"
  grep -oE 'https?://[^ )]+' "$SPEC" | sed 's/[.,;:]*$//' | sort -u | while read -r url; do
    code=$(curl -sS -o /dev/null -I -L --max-time 20 -w '%{http_code}' "$url" 2>/dev/null || echo "FEHLER")
    printf '%s  %s\n' "$code" "$url"
  done
} > "$OUT/06-quellen.txt" 2>&1

{
  echo "# S6 Testlauf (npm test schließt alle Spezifikationsprüfungen und Selbsttests ein)"
  echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  run npm ci --no-audit --no-fund
  run npm test
} > "$OUT/07-npm-test.txt" 2>&1

grep -E "^(OK|FAILED)|^requirements" "$OUT/01-check-formeln.txt"
grep -E "^selftest" "$OUT/03-selftest.txt"
grep -E "Referenzwerten" "$OUT/04-referenzwerte.txt"
grep -E "Exit-Code|^Funktionen|Abschnittsnummern|Ausgeschlossen" "$OUT/05-funktionsliste.txt"
grep -E "^[0-9]{3}  |FEHLER  |Überschriften" "$OUT/06-quellen.txt"
grep -E "^ℹ (tests|pass|fail)|^(OK|FAILED|selftest)|\[Exit-Code" "$OUT/07-npm-test.txt"
