# Einbau in fremde Software (S8)

**Anleitung:** [Teil 6, `docs/spezifikation/06-einbau.md`](../docs/spezifikation/06-einbau.md) ·
**Belege:** [`docs/belege/S8/`](../docs/belege/S8/README.md) (`scripts/belege-s8.sh`)

Beispiele dafür, wie fremde Software hpro erzeugt, ohne das Format selbst umzusetzen. Alles hier
nutzt nur das Paket `@hpro/kern` (Bibliothek und Kommandozeile `hpro`).

| Ordner | Inhalt | Ausführen |
| --- | --- | --- |
| [`libreoffice/hpro-export/`](libreoffice/hpro-export/) | LibreOffice-Erweiterung (Python, ab LibreOffice 7.0): Datei → „Als hpro exportieren…“ für Writer und Calc; ruft `hpro create` und `hpro check` | Archiv bauen und installieren: siehe unten |
| [`libreoffice/pruefen.py`](libreoffice/pruefen.py) | Prüflauf der Erweiterung in einem echten LibreOffice ohne Oberfläche (installieren, Dokumente über die Office-API aufbauen, Menübefehl auslösen) | `prototyp/tools/libreoffice/opt/libreoffice26.8/program/python einbau/libreoffice/pruefen.py <ausgabe> "node $PWD/kern/build/bin/hpro.js"` |
| [`fachanwendung/`](fachanwendung/) | Fachanwendung: Prüfbericht Trinkwasserhygiene aus Messdaten (CSV) mit Überblick, rechnender Tabelle, aufklappbaren Einzelbefunden, Anhang, Signatur, Prüfung | `node einbau/fachanwendung/bericht.mjs einbau/fachanwendung/daten/legionellen-2026-10.csv bericht.hpro [--tsa URL] [--eingefroren]` |
| [`bibliothek/beispiel.mjs`](bibliothek/beispiel.mjs) | kleinstes Bibliotheksprogramm: Markdown → Container → Prüfung | `node einbau/bibliothek/beispiel.mjs aktennotiz.hpro` |
| [`python/hpro_bericht.py`](python/hpro_bericht.py) | Anbindung aus einer anderen Sprache nur über die Kommandozeile (Rückgabecodes, JSON-Berichte) | `HPRO_CLI="node $PWD/kern/build/bin/hpro.js" python3 einbau/python/hpro_bericht.py <messdaten.csv> <bericht.hpro>` |

Im Repository finden die Beispiele `@hpro/kern` über den npm-Workspace (`npm ci`, dann
`npm run build -w kern`). In einem fremden Projekt:

```sh
cd kern && npm pack                                  # baut dist/, cli/, spec/ → hpro-kern-0.1.0.tgz
cd /pfad/zum/projekt && npm install /pfad/zu/hpro-kern-0.1.0.tgz
npx hpro version
```

**LibreOffice-Erweiterung installieren:** Das Archiv `hpro-export.oxt` ist der Inhalt von
`libreoffice/hpro-export/` als ZIP (so baut es `pruefen.py`; das gebaute Archiv liegt unter
`docs/belege/S8/eingabe/hpro-export.oxt`). In LibreOffice: Extras → Extension Manager → Hinzufügen,
oder `unopkg add hpro-export.oxt`. Die Erweiterung braucht Node.js und findet `hpro` im Suchpfad
(`npm install -g /pfad/zu/hpro-kern-0.1.0.tgz`) oder über die Umgebungsvariable `HPRO_CLI`.
