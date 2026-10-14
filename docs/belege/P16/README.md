# Belege P16 – Verschachtelte Information und stabile Adressen

Stand 14.10.2026. Umsetzung: `kern/src/nest/address.ts`, Test: `kern/test/nest.test.ts`
(läuft mit `npm test -w kern` im Bestandstest mit).

## Adressschema

Eine Adresse ist `<Pfad im Container>#<id>` eines Abschnitts, einer Überschrift, eines
aufklappbaren `<details>`, einer Tabelle/Abbildung oder eines eingebetteten Unterdokuments.
Die `id` ist je Container eindeutig (`containerAddresses` bricht sonst ab). Daraus folgt:

- Die Adresse benennt ein Element, keine Position — sie hängt nicht von Fensterbreite,
  Schriftgröße oder Seitenumbruch ab.
- Wandert ein Abschnitt in ein anderes Inhaltsdokument, löst `resolveAddress` die alte
  Adresse über die `id` auf (`moved`); `diffAddresses` meldet verlorene Adressen (`lost`).
- Zusätzlich gibt es den Gliederungspfad (`methode/methode-messung`) und die Detailtiefe
  (`depth`: 0 Überblick, +1 je umschließendem `section`/`details`) für Anzeige und Zitat.
- Unterdokumente liegen als hpro-Container unter `attachments/*.hpro` im Elterncontainer, mit
  Hash in `manifest.json`; `openSubdocument` liest sie nur aus den Elternbytes.

## Abnahmekriterien

| Nr. | Kriterium | Test | Ergebnis | Beleg |
|---|---|---|---|---|
| 1 | Verweis bleibt gültig bei wechselnder Fensterbreite und Schriftgröße | `P16-1` (Chromium headless, offline, 3 Breiten × 3 Schriftgrößen) | erfüllt: in allen 9 Läufen `:target` = Abschnitt „Messung“, Oberkante 0 px, Dokumenthöhe 1428–13651 px | `testlauf-nest.txt` |
| 2 | Eingebettetes Unterdokument mitgeliefert und offline gelesen | `P16-2` (`fetch` gesperrt, 0 Aufrufe; Hash im Manifest; Integrität geprüft) | erfüllt | `testlauf-nest.txt` |
| 3 | Adressen stabil über zwei Fassungen | `P16-3` (Fassung 2 fügt Abschnitte ein, verlängert Text, verschiebt „Ergebnis“ in eigene Datei, neuer Anhang B) | erfüllt: 13 Adressen, 11 unverändert, 2 verschoben und auflösbar, 0 verloren; Gegenprobe mit entfernter id meldet `lost` | `testlauf-nest.txt` |
| 4 | Belege | — | diese Datei und `testlauf-nest.txt` | |

## Nicht geprüft

- Kriterium 1 nur in Chromium; Firefox und WebKit (P13-Suite) nicht geprüft, weil das
  Zeitbudget dieses Laufs (HPRO_ZEITBUDGET_S = 1508 s) dafür nicht reichte.
- Wechsel des Geräts (docs/10 nennt ihn zusätzlich) nur über die Fensterbreite 360 px angenähert,
  kein echtes Mobilgerät.
- Seitenzahl plus Abschnittskennung im Ausdruck (docs/10, Zusage 3) ist nicht Teil der
  Abnahme dieses Pakets und nicht geprüft.
- Die Reader-Oberfläche (app/) zeigt Adressen noch nicht an und klappt `<details>` beim
  Anspringen nicht selbst auf; der Test öffnet es per Skript. Offen für ein Folgepaket.
- epubcheck des Containers mit eingebettetem Unterdokument: nicht geprüft (Zeitbudget).
