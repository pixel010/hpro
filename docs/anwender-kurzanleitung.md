# hpro – Kurzanleitung für Anwender (Version 0.1.0)

hpro ist ein Dateiformat für Dokumente, die für den Bildschirm gemacht sind: Der Text passt sich dem
Gerät an, Einzelheiten lassen sich aufklappen, Tabellen rechnen, Formulare prüfen sich selbst. Ein
Dokument kann signiert werden, und der Ausdruck auf A4 wird aus derselben Datei abgeleitet. Eine
hpro-Datei endet auf `.hpro` und ist eine einzige Datei. Sie lässt sich per Mail oder Messenger
weitergeben und offline öffnen, ohne Konto und ohne Server.

Zum Ausprobieren gibt es drei Dokumente in [`demo/`](../demo/README.md): einen Bericht, ein Formular
und einen signierten Nachweis.

## 1. Öffnen

| Weg | So geht's | Stand in 0.1.0 |
|---|---|---|
| **Reader im Browser** | Die Web-App (Archiv `hpro-reader-0.1.0.tar.gz`, siehe [BAUEN.md](../BAUEN.md) Abschnitt 6) im Browser aufrufen. Dann „Öffnen“ (Ordner-Symbol oben rechts) wählen oder die Datei ins Fenster ziehen. | geprüft mit Chromium; in Firefox und WebKit (Engine von Safari) lesen sich Dokumente laut Testsuite (P13, [docs/16](16-testmatrix-und-ci.md)) ohne waagrechtes Scrollen, der Druck bricht dort teils anders um |
| **Als App installiert** | Im Chrome oder Edge „App installieren“ wählen. Danach öffnet ein Doppelklick auf eine `.hpro`-Datei den Reader. | Chrome und Edge |
| **Ohne hpro-Programm** | Jede hpro-Datei ist zugleich ein gültiges EPUB. Zum Lesen die Endung auf `.epub` ändern und mit einem EPUB-Leser öffnen. | Mit calibre geprüft ([docs/05](05-prototyp-ergebnisse.md)), andere EPUB-Leser nicht. Text, Bilder und Tabellen gehen. Rechnen, Formulare und die Signaturprüfung gehen nicht. |

Der Reader schickt nichts ins Netz. Nach dem ersten Aufruf startet er auch offline.

## 2. Lesen

- **Fließende Ansicht** (Vorgabe): Der Text passt sich der Fensterbreite an, auch auf dem Telefon
  ohne Zoomen. Die **Seitenansicht** (Seiten-Symbol) zeigt eine A4-Vorschau.
- **Inhaltsverzeichnis**: Menü-Symbol oben links. Der aktuelle Abschnitt ist markiert.
- **Aufklappen**: Zeilen mit ▸ öffnen Einzelheiten. Die Suche findet auch Text in zugeklappten
  Abschnitten und klappt sie beim Sprung auf.
- **Suchen**: Lupe oder Taste `/`.
- **Schrift und Farben**: `−` / `+` ändern die Textgröße (50–300 %). Unter „Darstellung“ lassen sich
  Zeilenabstand, Buchstabenabstand und Farbschema einstellen (hell, dunkel, hoher Kontrast).
- **Adressen statt Seitenzahlen**: Jeder Abschnitt hat eine feste Adresse, zum Beispiel
  `#qualitaet` im Demo-Bericht. Das Ketten-Symbol in der Fußleiste kopiert die Adresse. Sie trifft
  auf jedem Gerät und bei jeder Schriftgröße dieselbe Stelle und eignet sich deshalb zum Zitieren.
- **Tastatur**: Alles geht ohne Maus. `?` zeigt die Tastenkürzel.

## 3. Rechnen und Formulare ausfüllen

- **Tabellen mit Formeln** rechnen nach jeder Änderung neu. Die Fußleiste zeigt das an, zum
  Beispiel „Rechnet: 7 Formeln“. Ohne Rechner (etwa in einem EPUB-Leser) erscheinen die Werte der
  letzten Berechnung.
- **Formulare**: Felder ausfüllen. Summen erscheinen sofort, und manche Abschnitte zeigen sich erst
  nach einer Auswahl, im Demo-Formular „Eigenes Fahrzeug“. Fehler stehen direkt am Feld.
  - **Entwurf speichern** lädt eine neue Datei mit dem Zwischenstand herunter.
  - **Absenden** geht nur, wenn alle Prüfungen erfüllt sind. Es lädt die abgesendete `.hpro`-Datei
    und die Daten als JSON herunter.
  - Die Datei geben Sie selbst weiter, etwa per Mail. Das Formular sendet nichts.

## 4. Drucken

„Drucken“ (Drucker-Symbol, Taste `p` oder Strg+P) setzt das Dokument auf A4. Der Ausdruck hat
Kopf- und Fußzeile mit Seitenzahlen und ein Verzeichnis mit Seitenzahl und Adresse. Tabellenköpfe
wiederholen sich auf jeder Seite, und aufgeklappte wie zugeklappte Abschnitte werden vollständig
gedruckt. Statt Video und Animation erscheint ein Standbild mit Verweis auf die lebendige Fassung.
„Als PDF speichern“ im Druckdialog ergibt ein PDF zum Weitergeben, aber kein PDF/A.

## 5. Signaturen prüfen

Signierte Dokumente tragen am Anfang einen sichtbaren Hinweis, wie der Demo-Nachweis.

- **Im Reader (0.1.0)**: Der Info-Dialog (ⓘ) nennt die Signaturdateien. Bei eingefrorenen Fassungen
  zeigt die Leiste „Sperren“ an, ob eine gültige Signatur sie deckt. Die Signatur des ganzen
  Dokuments **prüft der Reader in dieser Version noch nicht**.
- **Mit der Kommandozeile** (Paket `hpro-kern-0.1.0.tgz`, siehe [BAUEN.md](../BAUEN.md) Abschnitt 6):

  ```sh
  npx hpro validate hpro-demo-nachweis.hpro --trust demo-pruefstelle.cert.pem
  ```

  `indication: TOTAL_PASSED` heißt: Der Inhalt ist seit der Signatur unverändert, und der
  Unterzeichner ist der mit `--trust` angegebene. `TOTAL_FAILED / HASH_FAILURE` heißt: Nach der
  Signatur wurde etwas geändert. Ohne `--trust` lautet das Ergebnis `INDETERMINATE`: Rechnerisch ist
  alles intakt, aber wem das Zertifikat gehört, ist nicht geprüft.
- Das Zertifikat des Demo-Nachweises ist ein **Testzertifikat**. Es beweist nichts über eine
  echte Person oder Stelle.

## 6. Prüfen, ob eine Datei hpro-konform ist

```sh
npx hpro check datei.hpro
```

Der Prüfer wendet die Regeln aus Teil 1 der Spezifikation an. `0 fatal, 0 Fehler` heißt: Die Datei
erfüllt alle Regeln, die ohne Browser prüfbar sind. Warnungen sind Empfehlungen. Bei signierten
Dokumenten etwa fehlt sonst ein Zeitstempel. „Nicht geprüft“ nennt die Regeln, die eine
Browser-Engine brauchen.

## 7. Was diese Version noch nicht kann

- Signieren im Reader geht nur in der Desktop-Hülle mit Chipkarte oder Token (P11). Diese Hülle ist
  nicht Teil der Version 0.1.0. Im Browser signiert die Kommandozeile (`hpro sign`).
- Die Signatur des ganzen Dokuments prüft der Reader nicht (siehe Abschnitt 5).
- Getestet ist der Reader vor allem mit Chromium. Firefox und Safari können anders umbrechen.
- Die Apps für Desktop (Windows, macOS, Linux) und Mobilgeräte (Android, iOS) sind Prototypen und
  werden nicht ausgeliefert ([docs/14](14-desktop-huelle.md), [docs/15](15-mobil-huelle.md)).

Weitere Einzelheiten: [Funktionen des Readers](../app/README.md),
[Autorenleitfaden](spezifikation/05-autorenleitfaden.md) (Dokumente erstellen),
[Spezifikation](spezifikation/00-spezifikation.md).
