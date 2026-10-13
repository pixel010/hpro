#!/usr/bin/env python3
"""Checks the record of huelle/scripts/e2e-ipc.sh. Prints one line per check and exits 1 if one fails."""
import json
import sys
from pathlib import Path

out = Path(sys.argv[1])
lines = [json.loads(l) for l in (out / "record.jsonl").read_text().splitlines() if l.strip()]
stderr = (out / "stderr.log").read_text(errors="replace") if (out / "stderr.log").exists() else ""
reports = {}
acl = []
for l in lines:
    if l["kind"] == "report":
        v = json.loads(l["value"])
        if v["step"] == "acl":
            acl.append(v)
        else:
            reports[v["step"]] = v
accepted = [l["value"] for l in lines if l["kind"] == "accepted"]
canary = [l["value"] for l in lines if l["kind"] == "canary"]
attack = (reports.get("attack") or {}).get("result") or {}
forged_dropped = stderr.count("__TAURI_INVOKE_KEY__ expected")

checks = []
def check(name, ok, detail=""):
    checks.append(ok)
    print(f"{'ok  ' if ok else 'FAIL'} {name}{': ' + detail if detail else ''}")

check("Treiber lief im Hauptfenster", "driver-start" in reports, reports.get("driver-start", {}).get("href", ""))
check("Positivkontrolle: Canary aus dem Reader-Fenster angenommen", reports.get("control-canary", {}).get("n") == 1)
check("Nicht freigegebene Befehle (Core, Plugins, unbekannt) abgelehnt", len(acl) == 10 and all(a["result"] == "rejected" for a in acl),
      "; ".join(f"{a['cmd']} → {a['result']}" for a in acl))
lr = reports.get("launch-document", {})
check("Startargument geöffnet und dargestellt", lr.get("ready") is True, f"Titel „{lr.get('title', '')}“")
check("Angriffsseite lief im Dokumentrahmen und meldete sich", reports.get("attack", {}).get("received") is True)
check("Dokumentrahmen hat opake Herkunft", attack.get("origin") == "null", str(attack.get("origin")))
for k in ("tauriInternals", "tauriGlobal", "windowIpc"):
    check(f"Dokumentrahmen: {k} fehlt", attack.get(k) == "undefined", str(attack.get(k)))
for k in ("parentInternals", "topInternals", "topDocument", "nestedAppFrame"):
    check(f"Dokumentrahmen: {k} gesperrt", str(attack.get(k, "")).startswith("blocked"), str(attack.get(k)))
for k, v in attack.items():
    if k.startswith("fetch ") or k == "xhr":
        check(f"Dokumentrahmen: {k} kommt nicht durch", not str(v).startswith("status"), str(v))
check("Kein Fenster aus dem Dokumentrahmen", attack.get("windowOpen") in ("null", None) or str(attack.get("windowOpen")).startswith("blocked"), str(attack.get("windowOpen")))
check("Hauptfenster nicht wegnavigiert", reports.get("top-location", {}).get("href", "").endswith("index.html") or reports.get("top-location", {}).get("href", "").startswith("tauri://localhost"), reports.get("top-location", {}).get("href", ""))
posted = attack.get("webkitForgedMessages", 0)
check("Gefälschte Nachrichten an den WebKit-Handler verworfen (falscher Aufrufschlüssel)",
      posted == 0 or forged_dropped >= posted, f"gesendet {posted}, von Tauri verworfen {forged_dropped}")
check("Canary nur aus dem Reader-Fenster (2 Aufrufe: Kontrolle vorher und nachher)", [c.split()[1] for c in canary] == ["shell", "shell-after"], str(canary))
allowed = {"take_launch_files", "read_document", "e2e_canary", "e2e_report", "e2e_exit"}
check("Angenommene Befehle nur aus dem Treiber", set(accepted) <= allowed, ", ".join(sorted(set(accepted))))
print(f"Angenommene Befehle insgesamt: {len(accepted)}; Angriffsergebnis: {json.dumps(attack, ensure_ascii=False)}")
sys.exit(0 if all(checks) else 1)
