# Belege P3 – Signieren im Kern (AdES-Baseline-B) und eigener ZIP-Schreiber

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-p3.sh`](../../../scripts/belege-p3.sh)
(wörtliche Ausgaben mit Exit-Code, Lauf 2026-10-11T12:37Z, ca. 3 Minuten; jeder Lauf erzeugt neue
Schlüssel, Signatur-Ids und Hashwerte, die Befunde bleiben gleich)
**Code:** [`kern/src/sign.ts`](../../../kern/src/sign.ts), [`kern/src/softkey.ts`](../../../kern/src/softkey.ts),
[`kern/src/der-write.ts`](../../../kern/src/der-write.ts); ZIP-Schreiber aus P1
([`kern/src/zip.ts`](../../../kern/src/zip.ts)); Tests in [`kern/test/sign.test.ts`](../../../kern/test/sign.test.ts)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über das Prototyp-Werkzeug [`prototyp/dss`](../../../prototyp/dss/)
(`HproDss validate`), OpenSSL 3.5.7 **nur zum Gegenlesen** der Zertifikate, Python `zipfile`
(über [`prototyp/zipedit.py`](../../../prototyp/zipedit.py)) als fremdes ZIP-Werkzeug für die
Manipulation.

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Der erzeugte signierte Container besteht epubcheck 5.4.0 mit 0 Fehlern | **erfüllt:** `signiert-rsa.epub`, `signiert-ec.epub`, `signiert-2sig.epub` (zwei Signaturen) und `teilsigniert.epub`: jeweils `Messages: 0 fatals / 0 errors / 0 warnings / 0 infos`, Exit-Code 0. Zusätzlich im Testlauf: Test „epubcheck 5.4.0: signed container …“ | [03-epubcheck.txt](03-epubcheck.txt), [08-npm-test.txt](08-npm-test.txt) |
| 2 | Derselbe Container wird von `prototyp/dss` (DSS 6.5) als gültig bestätigt (`TOTAL_PASSED`) | **erfüllt:** `signiert-rsa.epub` und `signiert-ec.epub` → `Anzahl Signaturen: 1 (gültig: 1)`, `Format: XAdES-BASELINE-B`, `Indication: TOTAL_PASSED`, `Format-Prüfung (FC): PASSED`, signierte Objekte = alle 7 Datendateien plus `META-INF/container.xml`. `signiert-2sig.epub`: je Anker eine der beiden Signaturen `TOTAL_PASSED` (die andere `NO_CERTIFICATE_CHAIN_FOUND`, weil das DSS-Werkzeug nur einen Anker nimmt). Mit der hpro-Richtlinie ohne Warnung. Zusätzlich im Testlauf für RSA und EC | [04-dss.txt](04-dss.txt), [08-npm-test.txt](08-npm-test.txt) |
| 3 | Nach einer Manipulation meldet die eigene Prüfung `HASH_FAILURE` und DSS ebenfalls | **erfüllt:** `content/index.xhtml` mit Python `zipfile` geändert (1.200,00 → 9.200,00 EUR). Eigene Prüfung: `TOTAL_FAILED / HASH_FAILURE`, Referenz `content/index.xhtml` = `hash-failure`; DSS: `Indication: TOTAL_FAILED / HASH_FAILURE`, `The reference data object is not intact!`. Bei zwei Signaturen melden Kern und DSS für beide Signaturen `HASH_FAILURE` | [05-manipulation.txt](05-manipulation.txt) |

Kein Java im Signierpfad: Schlüsselerzeugung, Testzertifikat, XAdES-Aufbau, Kanonisierung,
Signaturwert (WebCrypto) und ZIP-Schreiben laufen im TypeScript-Kern; die Quelldateien enthalten
keine Prozessaufrufe und keine Node-Module ([00-werkzeuge.txt](00-werkzeuge.txt), `grep` mit
Exit-Code 1). Java läuft nur für die Gegenproben epubcheck und DSS.

## Was erzeugt wurde

| Datei unter [`container/`](container/) | Inhalt | epubcheck | DSS 6.5 | eigene Prüfung |
|---|---|---|---|---|
| `unsigniert.epub` | Beispieldokument aus `hpro sample` (P1) | 0 Fehler | – | – |
| `signiert-rsa.epub` | + 1 Signatur, RSA 3072 / SHA-256 | 0 Fehler | `TOTAL_PASSED` | `TOTAL_PASSED` |
| `signiert-ec.epub` | + 1 Signatur, ECDSA P-256 / SHA-256 | 0 Fehler | `TOTAL_PASSED` | `TOTAL_PASSED` (auch mit `dss-default`) |
| `signiert-2sig.epub` | `signiert-rsa.epub` + Gegenzeichnung EC in derselben `signatures.xml` | 0 Fehler | je Anker `TOTAL_PASSED` | 2 × `TOTAL_PASSED` |
| `teilsigniert.epub` | Signatur ohne `content/anhang.xhtml` („lebendige“ Datei, docs/10 Zusage 5) | 0 Fehler | `TOTAL_PASSED` + Warnung „Not all files are signed!“ | – |
| `teilsigniert-anhang-bearbeitet.epub` | dto., danach `content/anhang.xhtml` bearbeitet | – | `TOTAL_PASSED` + Warnung „Not all files are signed!“ | `TOTAL_PASSED`, `unsigned files: [content/anhang.xhtml]`; Hash-Manifest meldet `hash-mismatch` |
| `manipuliert-rsa.epub` | `signiert-rsa.epub`, Betrag geändert | 0 Fehler (EPUB prüft keine Signatur, wie V8) | `TOTAL_FAILED / HASH_FAILURE` | `TOTAL_FAILED / HASH_FAILURE` |
| `manipuliert-2sig.epub` | `signiert-2sig.epub`, Betrag geändert | – | `TOTAL_FAILED / HASH_FAILURE` | 2 × `TOTAL_FAILED / HASH_FAILURE` |
| `rsa-unterzeichner.pem`, `ec-gegenzeichner.pem` | öffentliche Testzertifikate (selbstsigniert, **nicht qualifiziert**) | | | |

Die privaten Schlüssel liegen nur unter `prototyp/out/p3/` (nicht im Repo);
[09-kein-privater-schluessel.txt](09-kein-privater-schluessel.txt) belegt, dass unter
`docs/belege/P3/` keiner liegt.

**Aufbau** ([02-signieren.txt](02-signieren.txt), unabhängig mit Python `zipfile` gelesen):
`mimetype` an Offset 0, `stored`, Extra-Feld 0, Inhalt `application/epub+zip`; alle Einträge des
unsignierten Containers in gleicher Reihenfolge und mit gleichem Inhalt, dann
`META-INF/signatures.xml` (OCF-Wurzel `<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container">`)
und `META-INF/manifest.xml` (ODF, Wurzeleintrag `application/epub+zip`). Die Signaturdatei steht
dort wörtlich: exklusive C14N, `rsa-sha256` bzw. `ecdsa-sha256`, acht Datei-Referenzen mit SHA-256,
`SigningTime`, `SigningCertificateV2` mit `IssuerSerialV2`, `DataObjectFormat` mit echten Media-Types
(`application/xhtml+xml`, `image/svg+xml`, `text/css`, …).

**Testzertifikate** ([01-schluessel.txt](01-schluessel.txt)): mit `hpro keygen` erzeugt
(WebCrypto + DER-Schreiber des Kerns). OpenSSL liest sie als X.509 v3 mit
`keyUsage critical: Digital Signature, Non Repudiation`, `basicConstraints critical: CA:FALSE`,
`subjectKeyIdentifier`; `openssl verify -check_ss_sig` meldet `OK`.

## Messung

[07-messung.txt](07-messung.txt): `signContainer` im laufenden Prozess (ohne Node-Start), Beispielcontainer
4 548 Bytes, 20 Durchläufe nach 3 Aufwärmläufen. Eine Messung umfasst Lesen, Hashen, XAdES-Aufbau,
C14N, Signatur, ZIP-Schreiben und die Rückleseprüfung.

| Schlüssel | Ausgabe | Median | Min | Max | Prüfen (Median) |
|---|---|---|---|---|---|
| RSA 3072 / SHA-256 | 7 911 Bytes | 20,24 ms | 15,13 ms | 39,64 ms | 4,26 ms |
| ECDSA P-256 / SHA-256 | 6 842 Bytes | 10,57 ms | 9,92 ms | 17,40 ms | 3,26 ms |

Eine Signatur macht den Container um gut 2,3 KB (EC) bzw. 3,4 KB (RSA, inkl. 3072-Bit-Zertifikat) größer.

## Tests

[08-npm-test.txt](08-npm-test.txt): `npm ci` und `npm test`, **109 Tests, 109 bestanden, 0 übersprungen**
(davon 19 neu in `sign.test.ts`). Neu geprüft:

- Testidentitäten RSA/EC: selbstsigniert, Schlüsselverwendung, Schlüssel passt zum Zertifikat;
  fremder Schlüssel und falscher Digest werden abgelehnt; PKCS#1-Schlüssel mit Umwandlungshinweis
  abgelehnt.
- Signieren RSA und EC: `TOTAL_PASSED`, alle Dateien plus `container.xml`, Niveau B, keine Warnung
  unter der hpro-Richtlinie; ZIP-Aufbau (mimetype, unveränderte Einträge, OCF-Wurzel,
  ODF-Manifest, echte Media-Types).
- Gegenzeichnung: neue Signatur als letztes Kind, alles davor Byte für Byte gleich, beide gültig;
  Signieren des Prototyp-Containers V11 (zwei DSS-Signaturen) lässt beide DSS-Signaturen gültig.
- Manipulation einer Datei und der signierten Eigenschaften (`SigningTime`) → `HASH_FAILURE`.
- Teilsignatur: unsignierte Datei darf sich ändern, Signatur bleibt gültig, Datei wird als
  unsigniert gemeldet.
- Ablehnung: `manifest.json` stimmt nicht, Signierzeit außerhalb der Zertifikatsgültigkeit,
  vorhandene `signatures.xml` mit ASiC-Wurzel.
- Gegenproben mit epubcheck 5.4.0 und DSS 6.5 (RSA und EC, je gültig und manipuliert).

## Nicht geprüft

| Was | Warum nicht |
|---|---|
| Signieren im Browser, in Tauri-Webviews, unter Node 22/24 | nur unter Node 26.5.1 ausgeführt; der Code nutzt nur `crypto.subtle`, `CompressionStream` und `@xmldom/xmldom` |
| Zertifikate unter einer CA mit Zwischenzertifikat | `--chain` schreibt die Kette in `KeyInfo`, mit DSS gegengeprüft nur selbstsignierte Zertifikate |
| Pfade mit Leerzeichen oder Nicht-ASCII-Zeichen in Referenz-URIs | Beispieldokument hat nur ASCII-Pfade; der Kern kodiert je Segment mit `encodeURIComponent`, wie DSS solche URIs auflöst, ist nicht geprüft |
| PKCS#12-Import | WebCrypto liest kein PKCS#12; nur PKCS#8 (`BEGIN PRIVATE KEY`) + PEM-Zertifikat. Eigener PKCS#12-Leser wäre nötig (docs/06, Anmerkung 11) |
| RSA-PSS, ECDSA P-521, Ed25519 | nicht umgesetzt; der Prüfer aus P2 kennt RSA-PSS ebenfalls nicht |
| Niveaus B-T/LT/LTA (Zeitstempel) | Paket P10 |
| Qualifizierte Signatur, Fernsignatur (CSC) | Paket P10; die `Signer`-Schnittstelle trägt dafür weiterhin nur den Digest |
| Fremde Prüfdienste (RTR, DSS-Demo online, DigiDoc) | Upload an externe Dienste nicht freigegeben (wie docs/05 §7) |
| Zuordnung „lebendig/eingefroren“ im Format | Teilsignatur ist technisch möglich (DSS bestätigt), aber welche Dateien zur eingefrorenen Fassung gehören und wie `manifest.json` (Hash auch der lebendigen Dateien) damit umgeht, legt das Format noch nicht fest; gehört in die Spezifikation |
