# Belege P2 – Signaturprüfung ohne Java

**Stand:** 11.10.2026 · **Erzeugt mit:** [`scripts/belege-p2.sh`](../../../scripts/belege-p2.sh)
(wörtliche Ausgaben mit Exit-Code; Wiederholung jederzeit möglich, ca. 5 Minuten)
**Code:** [`kern/src/validate.ts`](../../../kern/src/validate.ts) und Module darunter, Tests in
[`kern/test/signature.test.ts`](../../../kern/test/signature.test.ts) und
[`kern/test/c14n.test.ts`](../../../kern/test/c14n.test.ts)

Werkzeuge ([00-werkzeuge-und-schluessel.txt](00-werkzeuge-und-schluessel.txt)): Node 26.5.1,
Temurin JDK 21.0.12.1+1, EU DSS 6.5 über das Prototyp-Werkzeug [`prototyp/dss`](../../../prototyp/dss/)
(`HproDss validate`), OpenSSL 3.5, epubcheck 5.4.0, lxml 6.1.3/libxml2 2.14.6 (nur als
Gegenprobe für die Kanonisierung).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Der Kern prüft die Container aus `prototyp/ergebnisse/container/` und kommt zum selben Urteil wie EU DSS | **erfüllt:** alle 17 Container (Fälle `A-*`, 19 Signaturen) mit gleichem Urteil wie DSS 6.5, darunter `hybrid-manipuliert.epub` mit `TOTAL_FAILED / HASH_FAILURE` und die übrigen mit `TOTAL_PASSED` bzw. 0 Signaturen. Dazu 3 Richtlinienfälle (`R-*`) und 19 weitere Fälle (`M-*`, `N-*`): **39 von 39 Fällen, 47 von 47 Signaturen gleich** (Indication und SubIndication) | [vergleich-dss.json](vergleich-dss.json), Tabelle [02-vergleich.txt](02-vergleich.txt), Rohausgaben [dss/](dss/) und [ts/](ts/) |
| 2 | Ein Testfall verändert eine Datei im Container und erwartet `HASH_FAILURE` | **erfüllt:** Test „changing a signed file yields HASH_FAILURE for every signature covering it“ ändert `content/index.xhtml` im Zielformat (1.200,00 → 9.200,00 EUR) und erwartet für beide Signaturen `TOTAL_FAILED/HASH_FAILURE` mit genau dieser Datei als `hash-failure`; Gegenprobe: dieselbe Neuverpackung ohne Änderung bleibt `TOTAL_PASSED`. Dieselbe Manipulation als Fall `M01` bestätigt DSS. Weitere Tests: `container.xml` (M02), Signaturwert (M04), Signierzeit (M05), CAdES (M11, M12) | [03-npm-test.txt](03-npm-test.txt) (88 Tests, 88 bestanden, 0 übersprungen), [dss/M01-inhalt-geaendert.txt](dss/M01-inhalt-geaendert.txt) |
| 3 | Testergebnis als JSON in `docs/belege/`, mit Gegenüberstellung zur DSS-Ausgabe | **erfüllt:** [vergleich-dss.json](vergleich-dss.json): je Fall Container (mit SHA-256), Richtlinie, Vertrauensanker, je Signatur DSS-Urteil, Kern-Urteil, signierte Objekte, Fehler und Warnungen beider Seiten, Laufzeiten und Verweis auf die Rohausgaben | [vergleich-dss.json](vergleich-dss.json) |

## Was der Kern prüft

`validateContainer(bytes, { trustAnchors, policy, validationTime })` bzw. der Adapter
`TsValidator` (Schnittstelle `Validator` aus docs/06 §4.1). Nur Web-Standard-APIs
(`crypto.subtle`, `CompressionStream`) und `@xmldom/xmldom`; kein Java, kein Netz.

| Baustein (EN 319 102-1) | Umsetzung | Fälle |
|---|---|---|
| Format (FC) | Container-Regeln der DSS-Standardrichtlinie: mimetype-Inhalt je Richtlinie (`dss-default` Warnung, `html-pro` erlaubt `application/epub+zip`, `strict` Fehler), `META-INF/manifest.xml` vorhanden (XAdES) bzw. ASiC-Manifest (CAdES), Datendateien vorhanden, alle Dateien signiert (Warnung); eindeutige Signatur-Id; genau eine Referenz auf die eigenen `SignedProperties` | R1–R3, M10, M15, A-hybrid-kommentar |
| Unterzeichnerzertifikat (ISC) | `SigningCertificateV2`/`SigningCertificate` (XAdES) bzw. ESS signing-certificate(-v2) (CAdES): Zertifikats-Digest muss auf ein Zertifikat **aus der Signatur** passen; IssuerSerial wird zusätzlich verglichen | M13 |
| Kryptografie (CV) | jede Referenz: Datei vorhanden (`SIGNED_DATA_NOT_FOUND`) und Digest gleich (`HASH_FAILURE`); `SignedProperties` über exklusive C14N; Signaturwert über kanonisierte `ds:SignedInfo` (RSA PKCS#1 v1.5, ECDSA P-256/384/521; SHA-256/384/512). CAdES: `messageDigest` über das ASiC-Manifest, Signatur über die DER-kodierten signierten Attribute, Digests im Manifest | M01–M06, M09, M11, M12, M14, N1, N4 |
| Zertifikatspfad (XCV) | Pfad vom Unterzeichner zu einem übergebenen Vertrauensanker (Namen und Signatur jedes Glieds), Gültigkeitszeitraum zum Prüfzeitpunkt. Ist der Unterzeichner selbst Anker, braucht es keine Sperrinformation; sonst `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE` wie bei DSS ohne CRL/OCSP | M07, M08, N2, N3 |
| Reihenfolge | FC-Fehler → `TOTAL_FAILED/FORMAT_FAILURE`; ISC → `INDETERMINATE/NO_SIGNING_CERTIFICATE_FOUND`; CV-Fehler gehen einem unklaren Zertifikatspfad vor (M08: fremder Anker **und** Manipulation → `HASH_FAILURE`, wie DSS) | M08 |

Kanonisierung ([`kern/src/c14n.ts`](../../../kern/src/c14n.ts)): exklusive C14N 1.0 (mit/ohne
Kommentare, `InclusiveNamespaces`) und inklusive C14N 1.0/1.1. Abgleich mit libxml2 über lxml in
`c14n.test.ts`: exklusiv und inklusiv in allen Proben byte-gleich. Vererbung von `xml:*`-Attributen aus
Vorfahren (C14N 1.0 §2.4) ist nur gegen die Spezifikation geprüft, weil lxml den Teilbaum wie ein
eigenes Dokument behandelt.

## Fälle

`A-*` = Container aus `prototyp/ergebnisse/container/` unverändert, DSS-Standardrichtlinie,
Vertrauensanker `signer.pem`. `R-*` = Richtlinien aus docs/05 (V3, V11). `M-*` = abgeleitete
Manipulationen ([`scripts/p2-faelle.mjs`](../../../scripts/p2-faelle.mjs)). `N-*` = in diesem Lauf
mit DSS 6.5 neu signiert (eigene Testschlüssel, Zertifikate unter [faelle/](faelle/); private
Schlüssel bleiben in `prototyp/out/p2/`, nicht im Repo).

| Fall | Was | DSS 6.5 | Kern |
|---|---|---|---|
| A (17 Container) | V0–V11 aus docs/05 | wie docs/05, Tabelle 4.1 | gleich |
| R1 / R3 | V3 / V11 mit `policy-hpro.xml` | `TOTAL_PASSED`, keine Warnung | gleich |
| R2 | V3 mit `policy-streng.xml` | `TOTAL_FAILED / FORMAT_FAILURE` | gleich |
| M01 | Betrag in `content/index.xhtml` geändert | 2 × `TOTAL_FAILED / HASH_FAILURE` | gleich |
| M02 | `META-INF/container.xml` geändert | Signatur 1 `HASH_FAILURE`, Signatur 2 `TOTAL_PASSED` (deckt die Datei nicht ab) | gleich |
| M03 | signierte Datei entfernt | 2 × `INDETERMINATE / SIGNED_DATA_NOT_FOUND` | gleich |
| M04 | ein Zeichen im Signaturwert | `TOTAL_FAILED / SIG_CRYPTO_FAILURE` | gleich |
| M05 | `SigningTime` geändert | `TOTAL_FAILED / HASH_FAILURE` | gleich |
| M06 | `DigestValue` in `SignedInfo` geändert | `TOTAL_FAILED / HASH_FAILURE` | gleich |
| M07 | fremder Vertrauensanker | `INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND` | gleich |
| M08 | fremder Anker + Manipulation | `TOTAL_FAILED / HASH_FAILURE` | gleich |
| M09 | zusätzlicher Namensraum an der Wurzel, Zeilenumbrüche zwischen Signaturen | 2 × `TOTAL_PASSED` (exklusive C14N trägt) | gleich |
| M10 | `META-INF/manifest.xml` entfernt | `TOTAL_FAILED / FORMAT_FAILURE` („The manifest file is absent!“) | gleich |
| M11 / M12 | CAdES: Inhalt / ASiC-Manifest geändert | `TOTAL_FAILED / HASH_FAILURE` | gleich |
| M13 | Zertifikat in `ds:KeyInfo` durch fremdes ersetzt | `INDETERMINATE / NO_SIGNING_CERTIFICATE_FOUND` | gleich |
| M14 | ein Leerzeichen in `ds:SignedInfo` | `TOTAL_FAILED / SIG_CRYPTO_FAILURE` | gleich |
| M15 | zweite Signatur mit derselben Id | 2 × `TOTAL_FAILED / FORMAT_FAILURE` | gleich |
| N1 / N4 | ECDSA P-256 (`ecdsa-sha512`), N4 manipuliert | `TOTAL_PASSED` / `HASH_FAILURE` | gleich |
| N2 | Unterzeichner von Test-CA, Anker = CA | `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE` („No revocation data found“) | gleich |
| N3 | wie N2, Anker = Unterzeichner | `TOTAL_PASSED` | gleich |

epubcheck 5.4.0 für N1, N2 und M09: jeweils 0 Fehler, 0 Warnungen ([05-epubcheck.txt](05-epubcheck.txt)).

## Befunde aus dem Abgleich

Zwei Fälle wichen im ersten Lauf ab; der Kern wurde an DSS angepasst, beide Stände sind in der
Git-Historie nachvollziehbar:

1. **M13:** Der Kern suchte das Unterzeichnerzertifikat zunächst auch unter den Vertrauensankern und
   meldete `TOTAL_PASSED`. DSS nimmt Kandidaten nur aus der Signatur und meldet
   `NO_SIGNING_CERTIFICATE_FOUND`. Übernommen; das ist auch die strengere Lesart.
2. **N2:** Der Kern meldete für einen Unterzeichner unter einer CA ohne Sperrinformation `TRY_LATER`;
   DSS 6.5 meldet `CERTIFICATE_CHAIN_GENERAL_FAILURE`. Übernommen.

Für P3 (eigener Signierer) wichtig: **Ohne `META-INF/manifest.xml` lehnt DSS einen XAdES-Container
mit `FORMAT_FAILURE` ab** (M10, Richtlinienregel `ManifestFilePresent Level="FAIL"`), obwohl die Datei
nicht signiert ist und EPUB sie nicht braucht. Der Container-Schreiber muss sie mitschreiben.

## Unterschiede außerhalb des Urteils

Laut [vergleich-dss.json](vergleich-dss.json) stimmen bei 45 von 47 Signaturen die signierten
Objekte und bei 44 von 47 die Warnungen überein. Die Abweichungen:

| Fall | Unterschied | Einordnung |
|---|---|---|
| M11, M12 (CAdES, Hash-Fehler) | DSS führt `content/index.xhtml` nicht mehr unter „Signierte Objekte“; der Kern führt jede referenzierte Datei und markiert sie als `hash-failure` | Darstellung; bei XAdES (M01) listet DSS die Datei weiter |
| M15 | DSS nennt nach dem FC-Fehler keine mimetype-Warnung mehr, der Kern schon | Darstellung |
| N2 | DSS warnt zusätzlich „authority info access / revocation info access is not present“ | Kern prüft diese Zertifikatserweiterungen nicht (nur Warnstufe in DSS) |

## Messung

| Messgröße | Wert | Beleg |
|---|---|---|
| Kern im Prozess (20 Läufe je Fall nach Aufwärmen), Median über 39 Fälle | **2,89 ms** je Container (Bereich der Fall-Mediane 1,92–5,47 ms) | [04-messung.txt](04-messung.txt) |
| Prozessaufruf je Fall, Median: DSS (inkl. JVM-Start) / Kern-CLI (inkl. Node-Start) | ca. 5,0 s / 0,19 s | [laufzeiten.tsv](laufzeiten.tsv), `zusammenfassung.laufzeitMedianMs` in [vergleich-dss.json](vergleich-dss.json) |

Die DSS-Zahl enthält den JVM-Start und ist **kein** Vergleich der reinen Prüfdauer; DSS im laufenden
Prozess wurde nicht gemessen. Container sind klein (5–10 KB); große Container nicht gemessen.

## Nicht geprüft

| Was | Grund |
|---|---|
| EU-Vertrauenslisten (LOTL/TL), qualifizierter Status | außerhalb von P2 (Niveau B mit vorgegebenen Ankern); Kern kennt nur übergebene Anker |
| CRL/OCSP, Zeitstempel (B-T, B-LT, B-LTA) | nicht implementiert; T/LT/LTA wird erkannt und mit Warnung „not verified“ gemeldet, aber nicht gegen DSS getestet (kein Zeitstempeldienst, s. docs/05 §7) |
| Abgelaufenes Zertifikat (`OUT_OF_BOUNDS_NO_POE`) | nur als Kern-Test mit Prüfzeit 2037; DSS-Werkzeug kann keine Prüfzeit setzen |
| Kryptografische Richtlinie von DSS (Mindestschlüssellängen, Ablaufdaten von Algorithmen) | nur SHA-1 wird abgelehnt; Schlüssellängen werden nicht bewertet |
| RSA-PSS, Ed25519, SHA-3, Signaturrichtlinien (`SignaturePolicyIdentifier`), Gegensignaturen, ASiC-S | nicht implementiert bzw. ohne Testfall |
| XAdES/CAdES anderer Hersteller (DigiDoc, Adobe, LibreOffice) und inklusive Kanonisierung in echten Signaturen | keine Beispielsignaturen; alle Signaturen stammen von DSS 6.5 |
| Ausführung im Browser, unter Node 22/24, in WebKit/WebView | nur Node 26.5.1 ausgeführt; der Code nutzt nur Web-APIs, Lauf im Browser steht aus (P4/P13) |
