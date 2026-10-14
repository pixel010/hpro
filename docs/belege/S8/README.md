# Belege S8 – Einbau in Fremdsoftware: SDK, Kommandozeile und Office-Export

Erzeugt mit `scripts/belege-s8.sh` (Dateien 00–09, Dauer im letzten Lauf 9 min);
`10-npm-test.txt` ist der Lauf `npm ci --no-audit --no-fund && npm test --if-present` wie beim Läufer.
Jede Datei enthält die wörtlichen Ausgaben mit `[Exit-Code n]`.

| Abnahmekriterium | Beleg |
| --- | --- |
| 1 Kommandozeile mit stabilen Befehlen (`create`, `check`, `sign`, `pdf export`) und dokumentierten Rückgabecodes 0–4 | `01-kommandozeile.txt`, `08-pdf.txt` (PDF mit veraPDF), `07-dss.txt` (Gegenprobe der Signatur mit EU DSS 6.5); Tests `kern/test/cli.test.ts` in `10-npm-test.txt`; Tabelle der Rückgabecodes in Teil 6, Kapitel 3.2 |
| 2 Office-Exportweg besteht den Konformitätsprüfer | `02-office-export.txt` (LibreOffice-Erweiterung „Als hpro exportieren“ in LibreOffice 26.8, Writer und Calc), `03-office-pruefung.txt` (`hpro check` mit epubcheck: 0 fatal, 0 Fehler; epubcheck 5.4.0: 0 Fehler; Byte-Gleichheit zweier Läufe), `04-darstellung.txt` (Darstellungsregeln in Chromium); Eingaben unter `eingabe/`, Ergebnisse unter `container/`, Berichte unter `berichte/` |
| 3 Bibliothek als Paket (Installation, Version, Beispielaufruf), API dokumentiert | `05-paket.txt` (`npm pack`, Installation in ein fremdes Projekt, `npx hpro version`, `KERN_VERSION`, Beispielaufruf `einbau/bibliothek/beispiel.mjs`); API in Teil 6, Kapitel 4, mechanisch gegen die Exporte geprüft in `09-einbau-check.txt` |
| 4 Fachanwendung lauffähig | `06-fachanwendung.txt` (`einbau/fachanwendung/bericht.mjs`: Prüfbericht aus CSV-Messdaten, signiert, im fremden Projekt und im Repository, mit Zeitstempel von FreeTSA, Manipulation erkannt; Anbindung aus Python `einbau/python/hpro_bericht.py`), `07-dss.txt` |
| 5 Anleitung für Dritte | `docs/spezifikation/06-einbau.md`; `09-einbau-check.txt` (`npm run einbau:check`: jede Befehlsausgabe wörtlich in diesen Belegen, jeder Export genannt, Rückgabecodes, Befehle und Versionen gegen den Code; Selbsttest 10 von 10 Fällen) |

**Rückgabe 3 bei `hpro check`:** Der Prüfer hat keine Browser-Engine; die Regeln HPR-INH-004, -006
und -022 bleiben dort „nicht geprüft“ und die Stufe „unbestimmt“. Die Gegenprobe dieser Regeln steht
in `04-darstellung.txt`.

**Nicht geprüft:** Klick im Menü einer sichtbaren LibreOffice-Oberfläche, Dateidialog und
Meldungsfenster (keine Bildschirmsitzung im Prüflauf); LibreOffice unter Windows und macOS sowie
Dateien aus Microsoft Word, Excel oder Google Docs (nicht verfügbar). Siehe Teil 6, Kapitel 8.
