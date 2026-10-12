# Belege P17 – Sperren, Rechte und eingefrorene Fassung

**Paket:** P17 aus [`docs/08-arbeitsplan.md`](../../08-arbeitsplan.md) · **Stand:** 12.10.2026 ·
**Zusage:** 5 aus [`docs/10`](../../10-anspruch-und-funktionsprofil.md) (sperrbar und vertrauenswürdig)

Alle Dateien hier sind wörtliche Ausgaben echter Läufe. Wiederholen:

```sh
scripts/belege-p17.sh        # erzeugt 00–09, container/, screenshots/ (ca. 3 Minuten)
```

Voraussetzungen wie in [`docs/05`](../../05-prototyp-ergebnisse.md): JDK 21, epubcheck 5.4.0 und das
DSS-Werkzeug unter `prototyp/`; zusätzlich `jwcrypto` in `prototyp/.venv` (für P17 nachinstalliert:
`prototyp/.venv/bin/pip install jwcrypto` → jwcrypto 1.6.1, cryptography 50.0.2). Private
Testschlüssel bleiben unter `prototyp/out/p17/` (nicht im Repo); die Zertifikate liegen in
[`container/`](container/).

## Ergebnis je Abnahmekriterium

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Die eingefrorene Fassung ist signiert und die Signatur wird geprüft; eine spätere Änderung daran wird als Manipulation erkannt | **erfüllt.** Signatur (XAdES-BASELINE-B) über genau die 8 Dateien unter `renditions/nachweis-2026-10-12/` plus `META-INF/container.xml`. Kern: `TOTAL_PASSED`, Abdeckung exakt, Urteil „gültig signiert“; **EU DSS 6.5:** `TOTAL_PASSED`. Hauptfassung danach bearbeitet: Kern und DSS weiterhin `TOTAL_PASSED` (HP-PROF-009). Angebotspreis in der eingefrorenen Fassung mit Python `zipfile` geändert: Kern `TOTAL_FAILED / HASH_FAILURE`, „verändert nach der Signatur“; **DSS** `TOTAL_FAILED / HASH_FAILURE`. Zusätzlich Hash im Fassungsmanifest nachgetragen (Hash-Manifest passt wieder): Kern und DSS weiterhin `TOTAL_FAILED / HASH_FAILURE`. Im Reader: Banner „VERÄNDERT … ungültig (TOTAL_FAILED/HASH_FAILURE)“ | [`05-eingefrorene-fassung.txt`](05-eingefrorene-fassung.txt), [`01-kern-tests.txt`](01-kern-tests.txt) (Tests „criterion 1“), [`09-reader.txt`](09-reader.txt), [`screenshots/07-eingefrorene-fassung-signiert.png`](screenshots/07-eingefrorene-fassung-signiert.png) |
| 2 | Ein gesperrter Abschnitt ist im lebendigen Dokument nicht auslesbar (Test) | **erfüllt** für die Sperre `sealed` (Verschlüsselung, Antrag [HPC-0007](../../spezifikation/aenderungen/HPC-0007.md)). Vorher 14 Treffer der 5 Suchbegriffe, nachher **0** – Volltextsuche des Kerns (jeder Eintrag entpackt als Text, Markup ohne Tags, JSON-Zeichenketten; ZIP roh in UTF-8/UTF-16) **und** unabhängige Suche mit Python `zipfile`. Öffnen: falsches Kennwort und fremdes Zertifikat abgewiesen; Kennwort, RSA- und EC-Empfänger liefern denselben Klartext (gleicher SHA-256); **jwcrypto** (unabhängige JWE-Implementierung) öffnet den Umschlag aus dem Container mit allen drei Schlüsseln, SHA-256 gleich dem des Kerns. Reader (Playwright): Rahmen-HTML und Suche ohne Inhalt, falsches Kennwort abgewiesen, richtiges entschlüsselt nur im Speicher, nach erneutem Öffnen wieder versiegelt | [`03-versiegeln.txt`](03-versiegeln.txt), [`04-gegenprobe-jwe.txt`](04-gegenprobe-jwe.txt), [`01-kern-tests.txt`](01-kern-tests.txt) („criterion 2“, „JWE interop“), [`09-reader.txt`](09-reader.txt) („Abnahme 2“), [`screenshots/01…03`](screenshots/) |
| 3 | Redaktion entfernt die Daten nachweislich aus dem Container und führt ein Prüfprotokoll | **erfüllt.** Vorher 27 Treffer (Text, Alternativtext, `data/kontakt.json`, PNG-Textblock mit der IBAN, signierte eingefrorene Fassung, ZIP roh). Ohne Bestätigung: Warnung, Exit 3, nichts geschrieben (Teil 1, 7.4). Mit Bestätigung: Platzhalter `data-hp-redacted`, JSON-Werte `[geschwärzt]`, PNG und nur dort genutzte Unterschrift entfernt, signierte eingefrorene Fassung samt Signatur entfernt; Protokoll `data/redaction-log.json` mit Adresse, Zeit, Grund, Handelndem, betroffenen Dateien und Prüfangabe; Nachprüfung am geschriebenen Container **0 Treffer** (Kern und Python `zipfile`); Konformitätsprüfer mit `--redacted`: keine Befunde zu HPR-LOCK-002 … 005. Neu eingefroren und signiert: Kern und DSS `TOTAL_PASSED`, wieder 0 Treffer | [`06-redaktion.txt`](06-redaktion.txt), [`01-kern-tests.txt`](01-kern-tests.txt) („criterion 3“) |
| 4 | Belege unter `docs/belege/P17/` | **erfüllt** (diese Dateien) | – |

## Was gebaut wurde

- **Kern** `@hpro/kern`, Modul `lock` ([`kern/src/lock/`](../../../kern/src/lock/), Überblick im
  [Kern-README](../../../kern/README.md#sperren-versiegelte-abschnitte-redaktion-eingefrorene-fassung-p17-lock)):
  Sperren aus `manifest.json#access` (`createContainer({ access })`, Prüfung der Ziele),
  Bearbeiter-Operation `editText` mit `read-only`-Sperre (HP-LOCK-002), Druck-/Exportsicht
  (HP-LOCK-003/004), Versiegeln/Öffnen/Entsiegeln (JWE nach RFC 7516/7518 mit WebCrypto),
  Redaktion mit Protokoll und Nachprüfung, Volltextsuche, Einfrieren+Signieren und Prüfen der
  eingefrorenen Fassung, „nachweisbar“ nach HP-LOCK-006. Einfrieren übernimmt jetzt `access` in die
  Fassung (Teil 1, 7.3 Schritt 5) und schreibt einen Verlaufseintrag, wenn es einen Verlauf gibt
  (sonst Warnung HPR-PROF-015).
- **Kommandozeile** `hpro lock status|seal|open|unseal|redact|search|freeze|frozen-check|edit|view`,
  `hpro keygen --usage encryption --not-before …` ([`kern/bin/hpro-lock.ts`](../../../kern/bin/hpro-lock.ts)).
- **Reader** ([`app/src/locks.ts`](../../../app/src/locks.ts)): Leiste „Sperren“ mit
  Nachweisstatus, `hidden` ausgeblendet mit Hinweis und „Einblenden“ (Suche nennt ausgeblendete
  Treffer), `no-print`/`hidden` nicht im Druck, `read-only` ohne Eingabezellen, „Entsiegeln …“ mit
  Kennwort (nur im Speicher). Beispiel `dist/sperren.hpro`.
- **Beispiel** [`docs/spezifikation/beispiele/p17-sperren/`](../../spezifikation/beispiele/p17-sperren/):
  Vergabevermerk mit `read-only`, `no-print`+`no-export`, `hidden`, zu versiegelnder Bewertung und
  Personendaten (auch als PNG-Textblock). Der Prüfer meldet für das Beispiel 0 Befunde
  ([`08-hpro-check.txt`](08-hpro-check.txt), erster Lauf).
- **Spezifikation:** Änderungsantrag [HPC-0007](../../spezifikation/aenderungen/HPC-0007.md)
  (in Frist bis 09.11.2026), eingetragen im Änderungsverzeichnis von Teil 2.

## Zwei Profile in einer Datei

Der Ablauf in 03 → 05 erzeugt genau das Bild aus Zusage 5: Die **Hauptfassung** bleibt lebendig
und bearbeitbar (Text geändert, Abschnitt versiegelt), die **eingefrorene Fassung**
`renditions/nachweis-2026-10-12/` (Profil `signed`, ohne Skripte) ist signiert. Die Sperren werden
in die Fassung kopiert und sind dort von der Signatur gedeckt („nachweisbar“), in der Hauptfassung
nicht („Sperre nicht signiert“) – [`05-eingefrorene-fassung.txt`](05-eingefrorene-fassung.txt).
Der versiegelte Abschnitt liegt auch in der eingefrorenen Fassung verschlüsselt; die Signatur deckt
den Geheimtext, AES-GCM bindet den Klartext daran.

## Was technisch nicht schützbar ist

| Sperre | Schutz | gemessen |
|---|---|---|
| `read-only` | nur gegen konforme Bearbeiter; jedes ZIP-Werkzeug ändert die Datei. Nachweisbar wird eine Änderung erst durch eine Signatur (eingefrorene Fassung) | 02: Bearbeiter lehnt ab, Exit 4, Datei byte-gleich |
| `no-print`, `no-export` | nur gegen konforme Lesesysteme; der Text liegt im Container | 02: Volltextsuche findet ihn (4 Treffer) |
| `hidden` | keiner, auch nicht gegen das eigene Lesesystem (Einblenden ist Pflicht, HP-LOCK-005) | 02, Reader-Test „hidden“ |
| `sealed` | ohne Schlüssel nicht lesbar. **Sichtbar bleiben:** dass es den Abschnitt gibt, Kennung, ungefähre Länge (Größe des Geheimtexts), Empfänger (`x5t#S256`), ein beibehaltener Titel. **Wer den Schlüssel hat, kann abschreiben.** Ein schwaches Kennwort ist durch Probieren zu finden (PBKDF2, 600 000 Iterationen, mindestens 12 Zeichen) | 03, 04 |
| Redaktion | löscht aus diesem Container. Nicht aus Kopien, die vorher weitergegeben wurden; nicht aus Bildpixeln (keine Texterkennung); nicht Umschreibungen des Inhalts an anderer Stelle (gesucht wird wörtlich, ohne Groß-/Kleinschreibung) | 06 |
| Kopieren | kein Schutz, keine Regel „nicht kopieren“ (HP-LOCK-009) | – |

## Befunde und Abweichungen

- **epubcheck** ([`07-epubcheck.txt`](07-epubcheck.txt)): Container ohne eingefrorene Fassung
  (01, 02, 03, 08) 0 Fehler, 0 Warnungen. Jeder Container mit eingefrorener Fassung (04–07, 09):
  8 × `RSC-011` aus der Navigationsdatei der Fassung – derselbe bekannte Widerspruch wie in P19:
  HP-CONT-004 hält Fassungsdokumente aus dem Spine, EPUB erlaubt Verweise nur auf Spine-Einträge.
  Antrag [HPC-0003](../../spezifikation/aenderungen/HPC-0003.md) löst das; hier nicht vorweggenommen.
- **hpro-check** ([`08-hpro-check.txt`](08-hpro-check.txt)): Beispiel 0 Befunde. Versiegelte
  Dokumente: genau HPR-LOCK-001 (Regel `sealed`) und HPR-VERS-003 (`data-hp-sealed`), je Fassung –
  erwartbar, bis HPC-0007 entschieden ist. Eingefrorene Fassungen zusätzlich HPR-SIG-012 (Warnung:
  kein Signaturzeitstempel, siehe „nicht geprüft“).
- **EU DSS** meldet „Multiple documents match the same digest value“: Hauptfassung und
  eingefrorene Fassung enthalten byte-gleiche Dateien; DSS löst die Referenzen trotzdem über die URI
  auf (Urteile wie erwartet). Ebenfalls bekannt: „Unsupported files: META-INF/container.xml“ (P3).
- Der eigene Validator meldet für die eingefrorene Fassung „Not all files are signed!“: gewollt,
  die Hauptfassung bleibt unsigniert und bearbeitbar (HP-SIG-013 nennt diese Dateien als
  „nicht signiert“, hpro-check als Hinweise HPR-SIG-017).
- **jwcrypto** lehnt ohne Einstellung PBES2 mit mehr als 16 384 Iterationen ab
  (`default_max_pbkdf2_iterations`, gemessen in 04); die Gegenprobe hebt die Grenze an. Ein anderes
  Lesesystem braucht eine solche Einstellung ebenfalls – im Antrag als offener Punkt notiert.
- Die erste Versiegelung des Beispiels scheitert absichtlich an der **Lecksuche**: der Verweistext
  „Preisprüfung“ in `#anlagen` hätte eine Überschrift des Abschnitts im Klartext gelassen (03).

## Nicht geprüft

- **Zeitstempel (RFC 3161, XAdES-BASELINE-T):** nicht umgesetzt und nicht geprüft. Grund: kein
  Zeitstempeldienst im Arbeitsverzeichnis, und die Umsetzung ist Paket P10. Die eingefrorene Fassung
  ist damit *zeitstempelbar* im Format (XAdES erlaubt `SignatureTimeStamp` als unsignierte
  Eigenschaft, die die Signatur nicht verändert), aber hier nur auf Niveau B signiert.
- **Qualifizierte Signatur, EU-Vertrauenslisten, Sperrstatus:** nicht geprüft (Testzertifikate,
  kein Netzdienst; P10).
- **Andere Browser als Chromium**, Mobilgeräte: nicht geprüft.
- **Druck als PDF** aus dem Reader: nicht geprüft (Druckweg ist P18); geprüft ist die
  Druck-Mediendarstellung im Rahmen (`emulateMedia print`) und die Druckansicht des Kerns.
- **Export:** der Reader hat noch keinen Export (P9); `no-export` ist nur über `lock.outputView`
  im Kern belegt.
- **Entsiegeln mit Zertifikat im Reader:** die Oberfläche fragt nur ein Kennwort ab; Zertifikats-
  empfänger sind im Kern, auf der Kommandozeile und mit jwcrypto geprüft.
- **Texterkennung in Bildern** bei der Redaktion: nicht vorhanden; Bilder mit Treffern in
  Metadaten werden entfernt, Pixel nicht untersucht.
- **Rechtliche Wirkung** einer Sperre oder Redaktion: nicht erhoben.

## Dateien

| Datei | Inhalt |
|---|---|
| [`00-werkzeuge.txt`](00-werkzeuge.txt) | Versionen (Node, JDK, epubcheck, DSS, jwcrypto, Python), Testschlüssel |
| [`01-kern-tests.txt`](01-kern-tests.txt) | `kern/test/lock.test.ts`, 17 Tests |
| [`02-sperren-regeln.txt`](02-sperren-regeln.txt) | Sperren im Manifest, `read-only` im Bearbeiter, Druck-/Exportsicht, ehrliche Grenze |
| [`03-versiegeln.txt`](03-versiegeln.txt) | Abnahme 2: Lecksuche, Versiegeln, Umschlag, Volltextsuchen, Öffnen |
| [`04-gegenprobe-jwe.txt`](04-gegenprobe-jwe.txt) | jwcrypto öffnet den Umschlag |
| [`05-eingefrorene-fassung.txt`](05-eingefrorene-fassung.txt) | Abnahme 1: Kern und EU DSS 6.5, Bearbeitung, zwei Manipulationen |
| [`06-redaktion.txt`](06-redaktion.txt) | Abnahme 3: Warnung, Löschen, Protokoll, Nachprüfung, Prüfer, neu signiert |
| [`07-epubcheck.txt`](07-epubcheck.txt) | epubcheck 5.4.0 über alle Container |
| [`08-hpro-check.txt`](08-hpro-check.txt) | Konformitätsprüfer über die Container |
| [`09-reader.txt`](09-reader.txt) | Playwright `e2e/sperren.spec.ts` (4 Tests) und Bildschirmfotos |
| [`10-npm-test.txt`](10-npm-test.txt) | `npm ci` und `npm test` über das ganze Repo |
| [`container/`](container/) | alle erzeugten Container, Druckansicht, Zertifikate |
| [`screenshots/`](screenshots/) | Reader: versiegelt, falsches Kennwort, entsiegelt, ausgeblendet, eingeblendet, Druck, eingefrorene Fassung |
| [`begriffe-versiegelt.txt`](begriffe-versiegelt.txt), [`begriffe-redaktion.txt`](begriffe-redaktion.txt) | Suchbegriffe der Volltextsuchen (Inhalt des Beispiels) |
| [`policy-hpro.xml`](policy-hpro.xml) | DSS-Richtlinie (Kopie aus `prototyp/out/`) |
