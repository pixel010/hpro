#!/usr/bin/env python3
"""Evaluates the Android test runs of the mobile shell (mobil/scripts/e2e-android.sh).

Usage: e2e-android-check.py OUTDIR [ipc|launch|read|print]...
Prints one block per scenario with the facts read from record.jsonl, logcat and the dumps,
and a verdict line. Exit code 0 means every requested scenario could be evaluated (not that
the verdicts are positive: a measured "nein" is a valid result of the spike).
"""
import json
import os
import re
import sys

out = sys.argv[1]
scenarios = sys.argv[2:] or ["ipc", "launch", "read", "print"]
missing = []


def load(d):
    path = os.path.join(out, d, "record.jsonl")
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def reports(rows):
    res = []
    for r in rows:
        if r.get("kind") == "report":
            try:
                res.append(json.loads(r["value"]))
            except (json.JSONDecodeError, TypeError):
                pass
    return res


def step(reps, name):
    return [r for r in reps if r.get("step") == name]


def text(d, name):
    p = os.path.join(out, d, name)
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""


def ipc(d="ipc", shell="Tauri"):
    rows = load(d)
    reps = reports(rows)
    print(f"== Kriterium 1: Dokumentrahmen gegen die Brücke von {shell} (Android) ==")
    if not reps:
        missing.append(d)
        print("keine Aufzeichnung")
        return
    start = step(reps, "driver-start")
    if start:
        print("WebView:", re.sub(r".*(Chrome/[\d.]+).*", r"\1", start[0].get("userAgent", "")), "| Seite:", start[0].get("href"))
    ctl = step(reps, "control-canary")
    print("Positivkontrolle Hauptfenster: canary n =", ctl[0]["n"] if ctl else "fehlt")
    acl = step(reps, "acl")
    allowed = [a["cmd"] for a in acl if a.get("result") != "rejected"]
    print(f"Nicht freigegebene Befehle: {len(acl)} geprüft, {len(acl) - len(allowed)} abgelehnt", ("ERLAUBT: " + ", ".join(allowed)) if allowed else "")
    doc = step(reps, "launch-document")
    print("Dokument dargestellt:", doc[0] if doc else "fehlt")
    fh = step(reps, "frame-host")
    print("Dokumentrahmen:", fh[0] if fh else "fehlt")
    att = step(reps, "attack")
    result = (att[0].get("result") if att else None) or {}
    print("Angriffsseite meldet:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    canaries = [r["value"] for r in rows if r.get("kind") == "canary"]
    print("Zähleraufrufe (canary):", canaries)
    accepted = [r["value"] for r in rows if r.get("kind") == "accepted"]
    counts = {}
    for c in accepted:
        counts[c] = counts.get(c, 0) + 1
    print("Angenommene Befehle (Anzahl):", counts)
    after = step(reps, "control-canary-after")
    print("Positivkontrolle danach: canary n =", after[0]["n"] if after else "fehlt")
    from_frame = [c for c in canaries if "frame" in c]
    answers = {k: v for k, v in result.items() if k.split(" ")[0] in ("invoke", "nativePromise") and str(v).startswith("ANSWER")}
    reached = bool(from_frame or answers)
    print("Befehle aus dem Rahmen beantwortet:", answers if answers else "keine")
    if not att or not att[0].get("received"):
        print("ERGEBNIS Kriterium 1: nicht auswertbar (Angriffsseite meldete nichts)")
        missing.append(d)
    else:
        print(f"ERGEBNIS Kriterium 1 ({shell}):", f"NEIN – der Dokumentrahmen erreicht {shell}-Befehle" if reached else f"JA – kein {shell}-Befehl aus dem Rahmen erreicht")
    if shell == "Capacitor":
        log = text(d, "logcat.txt")
        blocked = [l for l in log.splitlines() if "Main Frame only" in l]
        print("Capacitor-Warnungen 'Plugin execution is allowed in Main Frame only':", len(blocked))


def launch():
    print("== Kriterium 2: .hpro aus Dateimanager und Mail (Android) ==")
    intents = text("launch", "intents.txt")
    if not intents:
        missing.append("launch")
        print("keine Intent-Abfrage")
    blocks = re.split(r"^-- ", intents, flags=re.M)[1:]
    for b in blocks:
        head, _, body = b.partition("\n")
        ok = "org.hpro.reader" in body
        print(f"  {head.strip():45s} -> {'hpro-Reader wird angeboten' if ok else 'hpro-Reader NICHT angeboten'}")
    reps = reports(load("launch"))
    shown = [r.get("title") or r.get("text") for r in reps if r.get("step") in ("shown", "error-shown")]
    print("Im Reader angezeigt (Kaltstart, onNewIntent, Teilen):", shown)
    fm = text("launch", "dateimanager/ergebnis.txt")
    if fm:
        print("Dateimanager (Files/DocumentsUI, Tippen auf die Datei):")
        for line in fm.strip().splitlines():
            print("  " + line)
    else:
        print("Dateimanager: kein Ergebnis")


def read():
    print("== Kriterium 3 (ANR): 24 MiB über das Kotlin-Plugin ==")
    reps = reports(load("read"))
    r = step(reps, "read")
    if not r:
        missing.append("read")
        print("keine Messung")
        return
    print("Messung:", r[0])
    log = text("read", "logcat.txt")
    anr = [l for l in log.splitlines() if "ANR in org.hpro.reader" in l or "Application Not Responding" in l]
    skipped = [int(m) for m in re.findall(r"Skipped (\d+) frames", log)]
    print("ANR-Meldungen im logcat:", len(anr), anr[:3])
    print("dumpsys activity anr:", "org.hpro.reader" in text("read", "anr.txt") and "Eintrag für org.hpro.reader" or "kein Eintrag für org.hpro.reader")
    print("Choreographer 'Skipped frames' (alle Prozesse):", skipped if skipped else "keine")


def printing():
    print("== A10 und Kriterium 3: Drucken ==")
    reps = reports(load("print"))
    if not reps:
        missing.append("print")
        print("keine Aufzeichnung")
        return
    doc = step(reps, "print-document")
    print("Druckprobe dargestellt:", doc[0] if doc else "fehlt")
    print("Nach window.print():", text("print", "nach-window-print.txt").strip() or "–")
    pb = step(reps, "print-button")
    print("Reader nach Knopf Drucken:", pb[0] if pb else "fehlt")
    print("Nach dem Knopf vorn:", text("print", "nach-druckknopf.txt").strip() or "–")
    d2 = text("print", "dumpsys-print-2.txt")
    jobs = re.findall(r"label=([^,\n]+)", d2)
    states = re.findall(r"state=(\w+)", d2)
    print("dumpsys print: Aufträge", jobs[:5], "Zustände", states[:5])
    ui = text("print", "ui-druck.xml")
    for want in ("A4", "Als PDF speichern", "Save as PDF", "Seiten", "pages"):
        if want in ui:
            print(f"  Druckdialog enthält '{want}'")


for s in scenarios:
    {"ipc": ipc, "launch": launch, "read": read, "print": printing, "capacitor-ipc": lambda: ipc("capacitor-ipc", "Capacitor")}[s]()
    print()
if missing:
    print("Nicht auswertbar:", ", ".join(missing))
    sys.exit(1)
