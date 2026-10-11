#!/usr/bin/env python3
"""Selbstständiger Arbeitslauf für html-Pro.

Nimmt das erste offene Arbeitspaket aus runner/plan.json, lässt Claude Code daran arbeiten,
prüft das Ergebnis mechanisch nach, committet und pusht, und schreibt den Stand zurück
in plan.json, docs/08-arbeitsplan.md und docs/09-arbeitsprotokoll.md.

Aufruf:
  python3 runner/auto_lauf.py                # nächstes offenes Paket abarbeiten
  python3 runner/auto_lauf.py --paket P3     # ein bestimmtes Paket
  python3 runner/auto_lauf.py --plan         # nur die Übersicht ausgeben
  python3 runner/auto_lauf.py --trocken      # nichts ausführen, nur zeigen, was käme

Regeln: kein Docker, kein sudo, keine Schreibzugriffe außerhalb /opt/data/html-pro.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

REPO = Path("/opt/data/html-pro")
PLAN = REPO / "runner" / "plan.json"
UEBERSICHT = REPO / "docs" / "08-arbeitsplan.md"
PROTOKOLL = REPO / "docs" / "09-arbeitsprotokoll.md"
BELEGE = REPO / "docs" / "belege"
LOGDIR = Path("/opt/data/html-pro-lauf")
LOCK = Path("/opt/data/html-pro-lauf.lock")
CLAUDE = str(Path.home() / ".npm-global" / "bin" / "claude")
MAX_TURNS = "150"
LAUF_TIMEOUT = 7200          # 2 Stunden je Claude-Lauf
PRUEF_TIMEOUT = 1800         # 30 Minuten für die Nachprüfung
KONTEXT_DATEIEN = [
    "docs/10-anspruch-und-funktionsprofil.md",
    "docs/00-auftrag.md",
    "docs/03-konzept.md",
    "docs/05-prototyp-ergebnisse.md",
    "docs/06-plattform-und-funktionsmatrix.md",
    "docs/07-foren-und-nutzererwartungen.md",
]


def jetzt() -> str:
    return datetime.now().strftime("%d.%m.%Y %H:%M")


def lock_besitzer() -> int | None:
    """Liest die Prozessnummer aus der Lock-Datei, wenn sie lesbar ist."""
    try:
        return int(LOCK.read_text(encoding="utf-8").strip() or 0) or None
    except (OSError, ValueError):
        return None


def laeuft_noch(pid: int) -> bool:
    """Prüft, ob der Prozess mit dieser Nummer noch existiert."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True



def plan_laden() -> dict:
    """Liest den Plan und mischt runner/plan_extra.json ein.

    Die Zusatzdatei hält Rangfolge und später ergänzte Pakete. Sie wird bei jedem Laden
    eingemischt, damit ein alter, noch laufender Prozess mit veraltetem Stand die Ergänzungen
    nicht dauerhaft überschreiben kann.
    """
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    extra_pfad = REPO / "runner" / "plan_extra.json"
    if extra_pfad.exists():
        extra = json.loads(extra_pfad.read_text(encoding="utf-8"))
        rng = extra.get("rang", {})
        for p in plan["pakete"]:
            if p["id"] in rng:
                p["rang"] = rng[p["id"]]
        vorhanden = {p["id"] for p in plan["pakete"]}
        for p in extra.get("pakete", []):
            if p["id"] not in vorhanden:
                plan["pakete"].append(dict(p))
        for k, v in (extra.get("regeln", {}) or {}).items():
            plan["regeln"][k] = v
    plan["pakete"].sort(key=lambda p: p.get("rang", 1000))
    return plan


def plan_speichern(plan: dict) -> None:
    plan["stand"] = datetime.now().strftime("%Y-%m-%d")
    PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def plan_aktualisieren(paket_id: str, felder: dict) -> dict:
    """Schreibt nur die Felder des eigenen Pakets zurück, auf Basis des frischen Stands."""
    frisch = plan_laden()
    for p in frisch["pakete"]:
        if p["id"] == paket_id:
            p.update(felder)
    plan_speichern(frisch)
    uebersicht_schreiben(frisch)
    return frisch


def uebersicht_schreiben(plan: dict) -> None:
    zeilen = [
        "# 08 – Arbeitsplan (selbstständiger Lauf)",
        "",
        f"Stand: {plan.get('stand', '')}. Diese Datei wird von `runner/auto_lauf.py` aus "
        "`runner/plan.json` erzeugt — nicht von Hand ändern.",
        "",
        "Ein Lauf nimmt das erste offene Paket, dessen Abhängigkeiten fertig sind, lässt daran "
        "arbeiten, prüft das Ergebnis nach und committet. Scheitert ein Paket zweimal, gilt es als "
        "blockiert und wird dem Auftraggeber gemeldet.",
        "",
        "| Paket | Titel | Modell | Abhängig von | Status |",
        "| --- | --- | --- | --- | --- |",
    ]
    for p in plan["pakete"]:
        abh = ", ".join(p.get("abhaengig_von") or []) or "–"
        zeilen.append(
            f"| {p['id']} | {p['titel']} | {p.get('modell', '')} | {abh} | {p['status']} |"
        )
    fertig = sum(1 for p in plan["pakete"] if p["status"] == "fertig")
    zeilen += [
        "",
        f"**{fertig} von {len(plan['pakete'])} Paketen fertig.**",
        "",
        "## Pakete im Detail",
        "",
    ]
    for p in plan["pakete"]:
        zeilen += [f"### {p['id']} – {p['titel']}", ""]
        zeilen += [f"*Status:* {p['status']}" + (f" · {p.get('hinweis','')}" if p.get("hinweis") else ""), ""]
        zeilen += [f"**Ziel.** {p['ziel']}", ""]
        zeilen += ["**Abnahme.**", ""]
        zeilen += [f"- {k}" for k in p["abnahme"]]
        zeilen += [""]
        if p.get("ergebnis"):
            zeilen += [f"**Ergebnis.** {p['ergebnis']}", ""]
        zeilen += ["---", ""]
    UEBERSICHT.write_text("\n".join(zeilen), encoding="utf-8")


def naechstes_paket(plan: dict) -> dict | None:
    fertig = {p["id"] for p in plan["pakete"] if p["status"] == "fertig"}
    for p in sorted(plan["pakete"], key=lambda x: x.get("rang", 1000)):
        if p["status"] != "offen":
            continue
        if all(a in fertig for a in (p.get("abhaengig_von") or [])):
            return p
    return None


def offene_pakete(plan: dict) -> list[str]:
    return [p["id"] for p in plan["pakete"] if p["status"] == "offen"]


def prompt_bauen(p: dict) -> str:
    regeln = plan_laden()["regeln"]
    abnahme = "\n".join(f"  {i+1}. {k}" for i, k in enumerate(p["abnahme"]))
    kontext = "\n".join(f"  - {d}" for d in KONTEXT_DATEIEN if (REPO / d).exists())
    return f"""Du arbeitest selbstständig an genau einem Arbeitspaket des Projekts html-Pro weiter.

Arbeitsverzeichnis: {REPO}
Paket: {p['id']} – {p['titel']}

AUFTRAG
Lies diese Dokumente zuerst. docs/10 ist verbindlich: es beschreibt Zweck und Zusagen des Formats —
Bildschirm zuerst, lebendige Inhalte, verschachtelte Information, leichtes Bearbeiten, Sperren und
Signieren, abgeleiteter A4-Druck. Baue nichts, das diesen Zusagen widerspricht:
{kontext}

ZIEL DES PAKETS
{p['ziel']}

ABNAHMEKRITERIEN (jedes einzelne muss erfüllt sein)
{abnahme}

ARBEITSWEISE
- Deutsch, Markdown, Code auf Englisch. Alles im Arbeitsverzeichnis, nichts außerhalb.
- Arbeite vollständig: bauen, wirklich ausführen, Ergebnisse messen. Kein Gerüst, kein Stub,
  keine Beschreibung von Arbeit, die noch zu tun wäre.
- Prüfe deine Arbeit selbst mit echten Befehlen und führe sie erneut aus, nachdem du etwas geändert hast.
- Belege: lege unter docs/belege/{p['id']}/ mindestens eine Datei mit den wörtlichen Ausgaben der
  Prüfbefehle ab (Testlauf, epubcheck, DSS, Messungen). Ohne diese Belege gilt das Paket als nicht belegt.
- Keine Docker-Operationen, kein sudo, keine Netzwerkdienste anlegen, die dauerhaft laufen.
- Werkzeuge: Java 21, epubcheck 5.4.0, DSS 6.5, Maven und calibre liegen bereits unter
  prototyp/tools/ bzw. prototyp/.venv/ (Details in docs/05). Nutze sie, lade nur was fehlt.
- Keine erfundenen Ergebnisse. Was du nicht prüfen konntest, schreibst du als "nicht geprüft" mit
  Angabe des Grundes.

ABSCHLUSS
- Änderungen committen (klare deutsche Nachricht, Paketkennung voran: "{p['id']}: ..."). NICHT pushen,
  das macht der Läufer.
- Kurzbericht als letzte Ausgabe: welche Abnahmekriterien erfüllt sind (mit Belegpfad), welche nicht,
  und was als Nächstes offen bleibt.
- Keine Git-Konfiguration ändern und keine Dateien außerhalb von {REPO} schreiben.
"""


def laufen(cmd: list[str], timeout: int, log: Path) -> tuple[int, str]:
    with log.open("a", encoding="utf-8") as fh:
        fh.write(f"\n$ {' '.join(cmd)}\n")
        fh.flush()
        try:
            r = subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, timeout=timeout, cwd=REPO)
            return r.returncode, ""
        except subprocess.TimeoutExpired:
            return 124, f"Zeitüberschreitung nach {timeout}s"


def baseline_pruefen(log: Path) -> tuple[bool, str]:
    """Prüft den Bestand des Repos (Tests), bevor ein Paket bearbeitet wird.

    Ein roter Bestand darf nicht dem nächsten Paket angelastet werden: sonst wird die halbe
    Warteschlange als blockiert markiert, obwohl nur eine Prüfung aus einem früheren Lauf rot ist.
    """
    if not (REPO / "package.json").exists():
        return True, "kein package.json – kein Bestandstest"
    rc, fehler = laufen(["npm", "test", "--if-present"], PRUEF_TIMEOUT, log)
    if rc == 0:
        return True, "Bestand grün"
    return False, f"Bestand rot: npm test exit {rc} {fehler}".strip()


def pruefungen_geschwaecht(vorher: str, nachher: str) -> list[str]:
    """Meldet, wenn nach einem Eingriff Prüfdateien verschwunden sind."""
    def dateien(text: str) -> set[str]:
        return {z.split()[-1] for z in text.splitlines() if z.strip()}

    def verdaechtig(name: str) -> bool:
        n = name.lower()
        return any(w in n for w in ("test", "spec", "check", "pruef", "beleg"))

    vor, nach = dateien(vorher), dateien(nachher)
    return sorted(f for f in vor - nach if verdaechtig(f))


def sanieren(log: Path) -> tuple[bool, list[str]]:
    """Lässt einen Lauf den roten Bestand reparieren, ohne Prüfungen abzuschwächen."""
    vorher = git("ls-files")
    prompt = (
        "Der Bestand dieses Repos ist rot: die vorhandene Prüfung schlägt fehl, obwohl sie "
        "grün sein müsste. Deine einzige Aufgabe ist, den Bestand wieder grün zu machen.\n\n"
        f"Arbeitsverzeichnis: {REPO}\n"
        "Vorgehen: Fehler mit echten Befehlen reproduzieren, Ursache finden, Sache beheben, "
        "danach den vollen Prüflauf erneut ausführen und die wörtliche Ausgabe unter "
        "docs/belege/sanierung/ ablegen.\n\n"
        "Regeln: keine Prüfung entfernen, abschwächen, überspringen oder mit 'skip' versehen. "
        "Keine Docker-Operationen, kein sudo, keine Dateien außerhalb des Arbeitsverzeichnisses. "
        "Keine erfundenen Ergebnisse. Wenn die Ursache inhaltlich ist (z. B. eine fehlende "
        "Anforderung in der Spezifikation), dann ergänze den Inhalt, statt die Prüfung zu lockern.\n\n"
        "Zum Schluss committen (Nachricht beginnt mit 'Sanierung:'), nicht pushen, und in drei "
        "Sätzen berichten, was die Ursache war und was du geändert hast."
    )
    laufen([CLAUDE, "-p", prompt, "--model", "opus",
            "--effort", "high", "--max-turns", MAX_TURNS,
            "--allowedTools", "Read,Write,Edit,Bash,WebSearch,WebFetch,Glob,Grep"],
           LAUF_TIMEOUT, log)
    ok, bericht = baseline_pruefen(log)
    geschwaecht = pruefungen_geschwaecht(vorher, git("ls-files"))
    return ok, ([f"Prüfdatei verschwunden: {g}" for g in geschwaecht] + [bericht])


def limit_erreicht(log: Path, ab: int) -> bool:
    """Erkennt, dass nicht das Paket gescheitert ist, sondern das Modell-Kontingent erschöpft war."""
    try:
        text = log.read_text(encoding="utf-8", errors="replace")[ab:]
    except OSError:
        return False
    klein = text.lower()
    return any(m in klein for m in ("hit your session limit", "session limit", "usage limit",
                                    "rate limit", "quota exceeded"))


def pruefen(p: dict, log: Path) -> tuple[bool, list[str]]:
    """Mechanische Nachprüfung: Belege vorhanden, Tests grün, deklarierte Befehle grün."""
    gruende, ok = [], True
    bele = BELEGE / p["id"]
    dateien = [f for f in bele.rglob("*") if f.is_file()] if bele.exists() else []
    if not dateien:
        ok = False
        gruende.append(f"keine Belege unter docs/belege/{p['id']}/")
    else:
        gruende.append(f"{len(dateien)} Belegdatei(en) vorhanden")

    if (REPO / "package.json").exists():
        for cmd in (["npm", "ci", "--no-audit", "--no-fund"], ["npm", "test", "--if-present"]):
            rc, fehler = laufen(cmd, PRUEF_TIMEOUT, log)
            if rc != 0:
                ok = False
                gruende.append(f"Befehl fehlgeschlagen: {' '.join(cmd)} ({fehler or 'exit ' + str(rc)})")
            else:
                gruende.append(f"ok: {' '.join(cmd)}")
    else:
        gruende.append("kein package.json – Testlauf übersprungen")

    for befehl in p.get("pruefung", []):
        rc, fehler = laufen(["bash", "-lc", befehl], PRUEF_TIMEOUT, log)
        if rc != 0:
            ok = False
            gruende.append(f"Prüfbefehl fehlgeschlagen: {befehl} ({fehler or 'exit ' + str(rc)})")
        else:
            gruende.append(f"ok: {befehl}")
    return ok, gruende


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def git_sauber_machen() -> None:
    """Nichts verwerfen: nur unversionierte Werkzeuge aus dem Index nehmen, Rest bleibt liegen."""
    git("add", "-A")


def committen_und_pushen(p: dict, nachricht: str | None = None) -> str:
    git("add", "-A")
    if not git("status", "--porcelain"):
        return "keine Änderungen zu committen"
    text = nachricht or f"{p['id']}: {p['titel']}"
    r = subprocess.run(
        ["git", "-c", "user.name=pixel010", "-c", "user.email=pixel010@users.noreply.github.com",
         "commit", "-q", "-m", text],
        cwd=REPO, capture_output=True, text=True,
    )
    if r.returncode != 0:
        return f"Commit fehlgeschlagen: {r.stderr.strip()[:300]}"
    push = subprocess.run(["git", "push", "origin", "main"], cwd=REPO, capture_output=True, text=True)
    sha = git("rev-parse", "--short", "HEAD")
    if push.returncode != 0:
        return f"Commit {sha} lokal, Push fehlgeschlagen: {push.stderr.strip()[:300]}"
    return f"committet und gepusht: {sha}"


def protokollieren(zeile: str) -> None:
    if not PROTOKOLL.exists():
        PROTOKOLL.write_text("# 09 – Arbeitsprotokoll (selbstständiger Lauf)\n\n", encoding="utf-8")
    with PROTOKOLL.open("a", encoding="utf-8") as fh:
        fh.write(zeile + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paket")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--trocken", action="store_true")
    args = ap.parse_args()

    plan = plan_laden()
    uebersicht_schreiben(plan)

    if args.plan:
        for p in plan["pakete"]:
            print(f"{p['id']:>4}  {p['status']:<8} {p['titel']}")
        print(f"\n{sum(1 for p in plan['pakete'] if p['status'] == 'fertig')} von "
              f"{len(plan['pakete'])} fertig, offen: {', '.join(offene_pakete(plan)) or '–'}")
        return 0

    if args.paket:
        treffer = [p for p in plan["pakete"] if p["id"] == args.paket]
        if not treffer:
            print(f"Paket {args.paket} nicht gefunden")
            return 2
        paket = treffer[0]
    else:
        paket = naechstes_paket(plan)
        if paket is None:
            print("Warteschlange leer: kein offenes Paket mit erfüllten Abhängigkeiten.")
            return 0

    if args.trocken:
        print(f"würde bearbeiten: {paket['id']} – {paket['titel']} (Modell {paket.get('modell')})")
        return 0

    if LOCK.exists():
        alt = time.time() - LOCK.stat().st_mtime
        if alt < LAUF_TIMEOUT:
            # Ein abgebrochener Lauf (z. B. durch den Zeitwächter des Cron) hinterlässt ein Lock,
            # dessen Prozess nicht mehr läuft. Ohne diese Prüfung wäre der nächste Lauf zwei
            # Stunden blockiert. Lebt der Besitzer noch, ist wirklich ein Lauf aktiv.
            besitzer = lock_besitzer()
            if besitzer is not None and laeuft_noch(besitzer):
                print(f"Ein Lauf ist bereits aktiv ({int(alt/60)} Minuten alt) – Abbruch.")
                return 0
            print(f"Lock eines beendeten Laufs ({int(alt/60)} Minuten alt) wird übernommen.")
        LOCK.unlink()
    LOCK.write_text(str(os.getpid()), encoding="utf-8")

    LOGDIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    log = LOGDIR / f"{stamp}-{paket['id']}.log"
    versuche = int(plan["regeln"].get("max_versuche_pro_paket", 2))
    try:
        # Bestand prüfen: ein roter Bestand wird saniert und nicht dem nächsten Paket angelastet.
        bestand_ok, bestand_bericht = baseline_pruefen(log)
        if not bestand_ok:
            print(f"Bestand rot, wird saniert: {bestand_bericht}")
            groesse = log.stat().st_size if log.exists() else 0
            bestand_ok, hinweise = sanieren(log)
            if limit_erreicht(log, groesse):
                print("KEIN KONTINGENT: Sanierung nicht möglich, Claude-Kontingent erschöpft – "
                      "kein Paket bearbeitet.")
                return 4
            if not bestand_ok:
                print("BESTAND ROT: Sanierung hat den Bestand nicht repariert – kein Paket bearbeitet.")
                print("Gründe: " + "; ".join(hinweise))
                return 3
            print("Bestand nach Sanierung grün: " + "; ".join(hinweise))
        for versuch in range(1, versuche + 1):
            prompt = prompt_bauen(paket)
            if versuch > 1:
                prompt += ("\n\nNACHTRAG: Der vorige Versuch hat die mechanische Prüfung nicht "
                           "bestanden. Grund:\n" + paket.get("letzter_pruefbericht", ""))
            modell = paket.get("modell", "opus")
            # Vorgabe: Planung mit fable, Umsetzung mit opus. Ist fable erschöpft, laufen Planung
            # UND Ausführung mit opus. Kein Ausweichen auf ein drittes Modell.
            for modell_versuch in ([modell] if modell == "opus" else [modell, "opus"]):
                cmd = [CLAUDE, "-p", prompt,
                       "--model", modell_versuch,
                       "--effort", "high",
                       "--max-turns", MAX_TURNS,
                       "--allowedTools", "Read,Write,Edit,Bash,WebSearch,WebFetch,Glob,Grep"]
                groesse = log.stat().st_size if log.exists() else 0
                rc, fehler = laufen(cmd, LAUF_TIMEOUT, log)
                if not limit_erreicht(log, groesse):
                    break
                if modell_versuch != "opus":
                    print(f"Kontingent für {modell_versuch} erschöpft – Planung und Ausführung "
                          f"laufen mit opus weiter.")
                    continue
                print("Zwischenstand wird gesichert, damit nichts verloren geht.")
                print(committen_und_pushen(paket, f"{paket['id']}: Zwischenstand "
                                                  f"(Kontingent erschöpft)"))
                print("KEIN KONTINGENT: Claude-Kontingent erschöpft – Paket bleibt offen, "
                      "kein Versuch verbraucht.")
                return 4
            ok, gruende = pruefen(paket, log)
            paket["letzter_pruefbericht"] = "; ".join(gruende)
            if ok and rc == 0:
                break
            if versuch == versuche:
                paket["status"] = "blockiert"
                paket["hinweis"] = f"Prüfung nach {versuche} Versuchen nicht bestanden: {'; '.join(gruende)}"

        if paket["status"] != "blockiert":
            paket["status"] = "fertig"
            paket["hinweis"] = ""
        ergebnis = f"Lauf {stamp}, Versuch {versuch}, Prüfung: {'; '.join(gruende)}"
        paket["ergebnis"] = ergebnis
        plan = plan_aktualisieren(paket["id"], {
            "status": paket["status"],
            "hinweis": paket.get("hinweis", ""),
            "ergebnis": ergebnis,
        })
        commit = committen_und_pushen(paket)
        zeile = (f"- **{jetzt()} · {paket['id']} {paket['titel']}** — Status {paket['status']}. "
                 f"{ergebnis}. {commit}. Protokoll: `{log}`")
        protokollieren(zeile)
        print(f"{paket['id']} {paket['titel']}: {paket['status']}")
        print(f"Prüfung: {'; '.join(gruende)}")
        print(f"Git: {commit}")
        print(f"Protokoll: {log}")
        if paket["status"] == "blockiert":
            print(f"BLOCKIERT: {paket.get('hinweis','')}")
            return 1
        print(f"Als Nächstes offen: {', '.join(offene_pakete(plan)) or '–'}")
        return 0
    finally:
        if LOCK.exists():
            LOCK.unlink()


if __name__ == "__main__":
    sys.exit(main())
