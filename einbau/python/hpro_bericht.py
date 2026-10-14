#!/usr/bin/env python3
"""
hpro from another language (S8): a Python application writes Markdown with front matter and lets
the stable command line make and check the document. Nothing but the command line contract of
docs/spezifikation/06-einbau.md, chapter 3, is used: commands, options, exit codes, JSON reports.

    python3 hpro_bericht.py <messdaten.csv> <bericht.hpro>

The command comes from HPRO_CLI (e.g. "node /path/to/hpro.js") or `hpro` on the PATH.
Exit codes: 0 written and checked without errors (check 0 or 3), 1 the checker found errors,
2 the input could not be read or hpro rejected it, 4 hpro is not installed.
"""
import csv
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile

# Exit codes of the stable command line (interface 1).
OK, NEGATIVE, USAGE, UNDETERMINED, UNAVAILABLE = 0, 1, 2, 3, 4


def hpro(*args):
    cli = shlex.split(os.environ["HPRO_CLI"]) if os.environ.get("HPRO_CLI") else [shutil.which("hpro") or "hpro"]
    try:
        return subprocess.run(cli + list(args), capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        print("hpro ist nicht installiert (npm install -g @hpro/kern) und HPRO_CLI ist nicht gesetzt", file=sys.stderr)
        sys.exit(UNAVAILABLE)


def markdown(rows):
    over = [r for r in rows if int(r["kbe_100ml"]) >= 100]
    lines = [
        "---",
        "titel: Kurzbericht Legionellenuntersuchung",
        "autoren: [Hygienelabor Beispiel]",
        "datum: " + min(r["entnahme"] for r in rows)[:10],
        "sprache: de-AT",
        "---",
        "",
        "# Ergebnis",
        "",
        "%d Proben, davon %d mit Maßnahmenbedarf (ab 100 KBE/100 ml)." % (len(rows), len(over)),
        "",
        "# Messwerte",
        "",
        "| Probe | Entnahmestelle | Temperatur (°C) | KBE/100 ml |",
        "|---|---|---:|---:|",
    ]
    for r in rows:
        lines.append("| %s | %s | %s | %s |" % (r["probe"], r["entnahmestelle"], r["temperatur_c"].replace(".", ","), r["kbe_100ml"]))
    lines += ["", "Table: Messwerte je Entnahmestelle {#messwerte}", "", "# Maßnahmen", ""]
    lines += ["- %s (%s): thermische Desinfektion, Nachprobe" % (r["entnahmestelle"], r["probe"]) for r in over] or ["Keine."]
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return USAGE
    source, target = sys.argv[1], os.path.abspath(sys.argv[2])
    with open(source, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    with tempfile.TemporaryDirectory(prefix="hpro-py-") as tmp:
        md = os.path.join(tmp, "kurzbericht.md")
        with open(md, "w", encoding="utf-8") as f:
            f.write(markdown(rows))
        made = hpro("create", md, target, "--json", os.path.join(tmp, "bericht.json"))
        print("hpro create -> %d" % made.returncode)
        if made.returncode != OK:
            print(made.stderr or made.stdout, file=sys.stderr)
            return {NEGATIVE: USAGE, UNAVAILABLE: UNAVAILABLE}.get(made.returncode, USAGE)
        with open(os.path.join(tmp, "bericht.json"), encoding="utf-8") as f:
            created = json.load(f)
    print("  %s: %d Bytes, sha256 %s; Meldungen %s" % (created["ausgabe"]["datei"], created["ausgabe"]["bytes"], created["ausgabe"]["sha256"][:16], created["zusammenfassung"]))
    checked = hpro("check", target, "--format", "json")
    report = json.loads(checked.stdout)
    meaning = {OK: "bestanden", UNDETERMINED: "keine Fehler, Regeln ohne Prüfmittel offen", NEGATIVE: "NICHT bestanden"}
    print("hpro check -> %d (%s); Befunde %s; Stufen %s" % (checked.returncode, meaning.get(checked.returncode, "Prüfer lief nicht"), report["summary"], report["levels"]["verdict"]))
    return OK if checked.returncode in (OK, UNDETERMINED) else NEGATIVE


if __name__ == "__main__":
    sys.exit(main())
