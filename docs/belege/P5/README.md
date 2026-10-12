# Belege P5 – Editor: strukturierte Bearbeitung, echtes Redigieren, Versionierung

**Paket:** P5 aus [`docs/08-arbeitsplan.md`](../../08-arbeitsplan.md) · **Stand:** 12.10.2026 ·
**Zusagen:** 4 (leicht zu bearbeiten) und 5 (Redaktion löscht) aus
[`docs/10`](../../10-anspruch-und-funktionsprofil.md)

Alle Dateien hier sind wörtliche Ausgaben echter Läufe. Wiederholen:

```sh
scripts/belege-p5.sh        # erzeugt 00–10, container/, screenshots/ (ca. 4 Minuten)
```

Voraussetzungen wie in [`docs/05`](../../05-prototyp-ergebnisse.md): JDK 21, epubcheck 5.4.0 und das
DSS-Werkzeug unter `prototyp/`, `prototyp/out/policy-hpro.xml`. Der private Testschlüssel bleibt
unter `prototyp/out/p5/` (nicht im Repo); das Zertifikat liegt in [`container/`](container/). Die
Operationen der Kommandozeilenläufe stehen als JSON in [`ops/`](ops/).

## Ergebnis je Abnahmekriterium

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Bearbeiteter Text steht im Containerinhalt (nicht in einer Overlay-Schicht), Beweis über Rohausgabe des Containers | **erfüllt.** Zehn Operationen über `hpro edit apply` (Überschrift, Absatz mit Fett und Fußnotenverweis, Zelle `#termin-tabelle.B3`, Tabellenzeile, Listenpunkt eingefügt und eingerückt, Abschnitt mit Absatz und Liste, Fußnote, Querverweis, Abbildung mit neuem Bild). Rohausgabe mit Python `zipfile` (kein Kern-Code): jeder der neun bearbeiteten Texte steht im entpackten `content/index.xhtml` (Überschriften zusätzlich im Inhaltsverzeichnis `content/nav.xhtml`, das sie aufführt) und in keinem anderen Eintrag; die Elemente sind wörtlich zitiert (`<h2 id="stand-h">Stand der Arbeiten am 8. Oktober</h2>` …). Neu im Container sind nur das Bild und das Verlaufsjournal `data/history.json`, keine Anmerkungs- oder Zusatzschicht. Hashes im Manifest stimmen (nachgerechnet mit `hashlib`). Kern-Test „criterion 1“ prüft dasselbe an den rohen ZIP-Einträgen; Browser-Test: im Reader bearbeitet, gespeichert, die heruntergeladene Datei roh geprüft | [`02-abnahme1-bearbeiten-rohausgabe.txt`](02-abnahme1-bearbeiten-rohausgabe.txt), [`01-kern-tests.txt`](01-kern-tests.txt), [`09-reader.txt`](09-reader.txt), [`screenshots/01…`](screenshots/01-bearbeiten-ueberschrift-vorschau.png) |
| 2 | Redaktion: nach dem Entfernen ist der Text im Container und in der Textsuche nicht mehr auffindbar; Protokoll wird mitgeschrieben | **erfüllt.** Vorher 8 Treffer (Kern) in der aktuellen Fassung und Treffer in **jeder** der vier Fassungen des Verlaufs. Redaktion von `content/anhang.xhtml#kontakte-text` und zwei Begriffen: danach 0 Treffer — Kern-Volltextsuche (jeder Eintrag entpackt als Text, Markup ohne Tags, JSON; ZIP roh UTF-8/UTF-16), unabhängige Suche mit Python `zipfile`, und dieselbe Suche in **jeder** aus dem Verlauf wiederhergestellten Fassung 0–3 (die Adresse ist in jeder Fassung geleert). Textsuche des Readers (`app/src/search.ts`): vorher 2 Treffer, danach „Keine Treffer“, auch in einer geöffneten früheren Fassung (Unit-Test und Browser-Test). Protokoll `data/redaction-log.json` mit Adresse, Zeit, Grund, Handelndem, Dateien und Prüfangabe (`hits: 0`); Konformitätsprüfer mit `--redacted`: keine HPR-LOCK-Befunde. Platzhalter erscheinen im Reader als Balken | [`04-abnahme2-redaktion.txt`](04-abnahme2-redaktion.txt), [`09-reader.txt`](09-reader.txt), [`screenshots/05…`](screenshots/05-nach-schwaerzung-suche-ohne-treffer.png) |
| 3 | Diff zwischen zwei Fassungen erkennt eine geänderte Überschrift, einen geänderten Absatz und ein entferntes Bild | **erfüllt.** `hpro diff` zwischen zwei Dateien und aus dem Verlauf **einer** Datei (`--from 1 --to 2`) meldet genau vier Änderungen: „Überschrift geändert“ `#stand-h` (`Stand der Arbeiten [-am-]{+und+} [-8. Oktober-]{+Ausblick+}`), „Absatz geändert“ `#einleitung` (`am [-8-]{+9+}. Oktober`), „Bild entfernt“ `#abb-fassade` (Alternativtext, Datei `content/media/fassade-nord.png`, Bildunterschrift) und „Datei entfernt“. Bericht als XHTML (`del`/`ins`) und JSON. Im Reader: Dialog „Verlauf“ vergleicht Fassung 1 und 2 mit demselben Ergebnis (Browser-Test), axe-core ohne schwere Verstöße | [`03-abnahme3-vergleich.txt`](03-abnahme3-vergleich.txt), [`container/vergleich-1-2.xhtml`](container/vergleich-1-2.xhtml), [`09-reader.txt`](09-reader.txt), [`screenshots/03…`](screenshots/03-verlauf-vergleich.png) |
| – | Belege unter `docs/belege/P5/` | **erfüllt** (diese Dateien) | – |

## Was gebaut wurde

- **Kern** `@hpro/kern`, Modul `edit` ([`kern/src/edit/`](../../../kern/src/edit/), Überblick im
  [Kern-README](../../../kern/README.md#bearbeiten-verlauf-und-vergleich-p5-edit)):
  - `EditSession`: Operationen auf der Struktur der Inhaltsdokumente — Text und eingeschränktes
    Inline-XHTML, Überschriftenebene, Absatz ↔ Überschrift, Blöcke einfügen (Absatz, Überschrift,
    Abschnitt, Listen, Tabelle, Abbildung mit neuem Bild, Code, Zitat), löschen, verschieben,
    Listen (Art, Beginn, einrücken, ausrücken), Tabellen (Zeilen und Spalten, verbundene Zellen),
    Fußnoten als Paar mit fortlaufender Nummer, Querverweise auf existierende Ziele, Bild und
    Alternativtext, Titel; Rückgängig. Jede Operation wird geprüft und bei Fehler zurückgerollt
    (tote Verweise, Fußnotenpaare, Überschriftensprünge, Tabellengitter, Kennungen, Inhaltsverzeichnis),
    Sperren (`read-only`, `sealed`, eingefrorene Fassung, Schwärzung, Rechentabellen) werden
    eingehalten, Kennungen früherer Fassungen nicht neu vergeben (HP-ADR-004), das
    Inhaltsverzeichnis wird nachgeführt.
  - **Verlaufsjournal** `data/history.json` (Rückwärts-Deltas je Fassung, entfernte Bilder unter
    `data/history/blobs/`), byte-genaue Wiederherstellung mit Prüfung der Hashkette;
    fortgeschrieben auch von Tabellenrechner, Datenkanal, `lock.editText`, Versiegeln,
    Entsiegeln und Einfrieren.
  - **Fassungsvergleich** `diffContainers`/`diffVersions` mit Text- und XHTML-Bericht.
  - **Redaktion und Versiegeln reichen in den Verlauf** ([`kern/src/lock/history.ts`](../../../kern/src/lock/history.ts)):
    die früheren Fassungen werden bereinigt und das Journal neu geschrieben (HP-LOCK-007).
- **Kommandozeile** `hpro edit blocks|apply|set-text`, `hpro history [checkout]`, `hpro diff`
  ([`kern/bin/hpro-edit.ts`](../../../kern/bin/hpro-edit.ts)).
- **Reader** ([`app/src/editor.ts`](../../../app/src/editor.ts)): Leiste „Bearbeiten“ mit
  Blockstruktur, Eingabefeld (nur über eine Positivliste befüllt, kein `innerHTML` aus dem Dokument),
  Live-Vorschau im Dokumentrahmen, „Speichern“ (neue Datei mit Verlauf), Dialog „Verlauf“
  (Fassungen, Prüfung, frühere Fassung öffnen, Vergleich), „Schwärzen …“ mit Protokoll; Beispiel
  `dist/bearbeiten.hpro`.
- **Beispiel** [`docs/spezifikation/beispiele/p5-bearbeiten/`](../../spezifikation/beispiele/p5-bearbeiten/):
  Protokoll mit Überschriften, verschachtelter Liste, Tabelle, Fußnote, Querverweisen, PNG und SVG,
  Personendaten.
- **Spezifikation:** Änderungsantrag [HPC-0008](../../spezifikation/aenderungen/HPC-0008.md)
  (Journal, Bearbeiter-Regeln, Vergleich, Redaktion im Verlauf; Frist bis 09.11.2026), eingetragen
  im Änderungsverzeichnis von Teil 2.

## Weitere Befunde

- **Verlauf** ([`05-verlauf.txt`](05-verlauf.txt)): Fassungen 0, 1 und 2 aus der Datei der
  Fassung 3 wiederhergestellt — jeder Eintrag byte-gleich mit der damals gespeicherten Datei
  (10/10, 12/12, 12/12). Ein in einem Patch des Journals geändertes Zeichen bei nachgetragenem Hash
  (das Hash-Manifest passt wieder, `hpro inspect` meldet OK) wird über die Hashkette erkannt:
  `ABWEICHUNG` für die Fassungen 0–2, Exit 1.
- **Eingefrorene Fassung** ([`06-eingefrorene-fassung-dss.txt`](06-eingefrorene-fassung-dss.txt)):
  nach dem Einfrieren und Signieren die Hauptfassung strukturiert bearbeitet — Kern „gültig
  signiert“, **EU DSS 6.5 `TOTAL_PASSED`** (Richtlinie hpro); der Bearbeiter lehnt die eingefrorene
  Fassung ab; das Journal läuft durch das Einfrieren weiter und liegt nicht in `renditions/`.
- **epubcheck 5.4.0** ([`07-epubcheck.txt`](07-epubcheck.txt)): 10 Container ohne Fehler und
  Warnungen, darunter alle mit Journal und Blobs und alle wiederhergestellten Fassungen. Die zwei
  Container mit eingefrorener Fassung melden `RSC-011` aus der Fassung — derselbe bekannte
  Widerspruch wie in P17/P19 (HP-CONT-004 hält Fassungsdokumente aus dem Spine), Antrag HPC-0003.
- **hpro-check** ([`08-hpro-check.txt`](08-hpro-check.txt)): 0 Fehler, 0 Warnungen für alle
  bearbeiteten, redigierten und wiederhergestellten Container. Exit 3 bedeutet „Stufe unbestimmt“,
  weil der Lauf epubcheck und Fremdprüfungen ausschließt (6 Regeln „nicht geprüft“). Die
  Container mit eingefrorener Fassung zeigen die erwartete Warnung HPR-SIG-012 (kein Zeitstempel)
  und die Hinweise „nicht signiert“ für die bearbeitbare Hauptfassung.
- **Messungen** ([`10-messungen.txt`](10-messungen.txt)): Das Journal wächst je gespeicherter
  Fassung im Mittel um 125 Bytes im ZIP (Beispiel, 40 Fassungen; Datei 6 424 → 13 958 Bytes) bzw.
  196 Bytes (Bericht mit 400 Absätzen, 72 KB XHTML, 20 Fassungen). Speichern samt Journal,
  Wiederherstellen einer Fassung und Vergleich liegen in diesem Lauf bei einigen zehn
  Millisekunden (Node, ein Lauf, Werte in der Datei); eine Redaktion über 41 Fassungen schreibt den
  ganzen Verlauf in rund 0,1 s neu, danach 0 Treffer in den Stichproben-Fassungen 0/10/20/30/40.
- Die Verlaufsnotizen nennen Adressen, keinen Inhalt (HP-EDIT-004 im Antrag); die Redaktion muss
  sie deshalb nicht umschreiben. Der Vergleich über eine Redaktion hinweg zeigt nur den Eintrag
  „Redaktion“.

## Nicht geprüft

- **Andere Browser als Chromium**, Mobilgeräte mit Bildschirmtastatur: nicht geprüft (P13).
  Die Auszeichnung „Fett/Kursiv“ nutzt `document.execCommand`, das in allen Engines vorhanden, aber
  als veraltet markiert ist.
- **Paralleles Bearbeiten** (zwei Personen ändern dieselbe Fassung, Zusammenführen): nicht
  umgesetzt; der Verlauf ist linear.
- **Texterkennung in Bildern** bei der Redaktion: wie in P17 nicht vorhanden; Bilder mit Treffer in
  Metadaten werden entfernt, Pixel nicht untersucht. Auch Blobs des Verlaufs werden so behandelt.
- **Bildschirmleser-Test** der Leiste „Bearbeiten“ mit NVDA/VoiceOver: nicht geprüft (kein
  Gerät); geprüft sind Tastaturbedienung im Browser-Test und axe-core-Regeln.
- **Rechtliche Wirkung** einer Redaktion: nicht erhoben.

## Dateien

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Versionen (Node, JDK, epubcheck, DSS, Python), Testschlüssel |
| [`01-kern-tests.txt`](01-kern-tests.txt) | `kern/test/edit.test.ts`, 14 Tests |
| [`02-abnahme1-bearbeiten-rohausgabe.txt`](02-abnahme1-bearbeiten-rohausgabe.txt) | Abnahme 1: Blockstruktur, Operationen, Rohausgabe, abgelehnte Änderungen |
| [`03-abnahme3-vergleich.txt`](03-abnahme3-vergleich.txt) | Abnahme 3: Vergleich zweier Dateien und aus dem Verlauf |
| [`04-abnahme2-redaktion.txt`](04-abnahme2-redaktion.txt) | Abnahme 2: Suche vorher/nachher in Datei und jeder Fassung, Protokoll, Prüfer |
| [`05-verlauf.txt`](05-verlauf.txt) | Fassungen, byte-genaue Wiederherstellung, Journalaufbau, Manipulation |
| [`06-eingefrorene-fassung-dss.txt`](06-eingefrorene-fassung-dss.txt) | Einfrieren, Bearbeiten, Kern und EU DSS 6.5 |
| [`07-epubcheck.txt`](07-epubcheck.txt) | epubcheck 5.4.0 über alle Container |
| [`08-hpro-check.txt`](08-hpro-check.txt) | Konformitätsprüfer über die Container |
| [`09-reader.txt`](09-reader.txt) | vitest `app/test/editor.test.ts` (3), Playwright `e2e/bearbeiten.spec.ts` (3), Bildschirmfotos |
| [`10-messungen.txt`](10-messungen.txt) | Journalgröße und Zeiten (`scripts/p5-messung.mjs`) |
| [`11-npm-test.txt`](11-npm-test.txt) | `npm ci` und `npm test` über das ganze Repo |
| [`container/`](container/) | alle erzeugten Container, Vergleichsbericht (XHTML, JSON), Zertifikat |
| [`ops/`](ops/) | Operationen (JSON), bearbeitete Texte, Suchbegriffe der Redaktion |
| [`screenshots/`](screenshots/) | Reader: Bearbeiten mit Vorschau, abgelehnte Änderung, Vergleich, Schwärzen, Suche danach, Telefonbreite |
| [`policy-hpro.xml`](policy-hpro.xml) | DSS-Richtlinie (Kopie aus `prototyp/out/`) |
