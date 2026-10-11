# Prototyp Phase 2: Container-Experiment

Prüft, ob eine Datei zugleich als **EPUB 3** gültig und als **ASiC-E (XAdES)** signiert und
validierbar ist. Ergebnisse und Einordnung: [`../docs/05-prototyp-ergebnisse.md`](../docs/05-prototyp-ergebnisse.md).

```sh
./setup-tools.sh      # einmalig: JDK 21, epubcheck 5.4.0, Maven, calibre 9.16, venv, DSS-Werkzeug
./run_experiment.sh   # alle Fälle; schreibt ergebnisse/NN-*.txt und ergebnisse/container/*
```

| Datei | Inhalt |
|---|---|
| `build_container.py` | Basis-Container, reproduzierbar (feste Zeitstempel und Reihenfolge), `manifest.json` mit SHA-256 |
| `zipedit.py` | Eingriffe für die Kreuzfälle (mimetype, Umbenennen, Manipulation, Nachtrag, OCF-Wurzel, Zusammenführen) |
| `reader_check.py` | Öffnen mit EbookLib |
| `dss/` | Signieren und Prüfen mit EU DSS 6.5 (Maven-Projekt) |
| `ergebnisse/` | wörtliche Protokolle des letzten Laufs und die erzeugten Container (`signer.pem` = Testzertifikat, nicht qualifiziert) |

Nicht im Repo (siehe `.gitignore`): `tools/` (≈ 1,1 GB), `.venv/`, `out/` (Testschlüssel, Zwischenstände),
`dss/target/`. Alles liegt innerhalb von `prototyp/`; es wird nichts außerhalb des Repos installiert.
