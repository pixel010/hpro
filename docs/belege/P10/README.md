# Belege P10 – Fernsignatur (CSC) und Zeitstempel (RFC 3161)

**Stand:** 13.10.2026 · **Erzeugt mit:** [`scripts/belege-p10.sh`](../../../scripts/belege-p10.sh)
(wörtliche Ausgaben mit Exit-Code; jeder Lauf erzeugt neue Schlüssel, Signaturen, Zeitstempel und
Hashwerte, die Befunde bleiben gleich) · **Beschreibung:** [docs/13](../../13-fernsignatur-und-zeitstempel.md)
**Code:** [`kern/src/csc.ts`](../../../kern/src/csc.ts), [`kern/src/tsp.ts`](../../../kern/src/tsp.ts),
[`kern/src/crl.ts`](../../../kern/src/crl.ts), [`kern/src/sign.ts`](../../../kern/src/sign.ts),
[`kern/src/xades.ts`](../../../kern/src/xades.ts); Testdoppel
[`kern/test/remote-mock.ts`](../../../kern/test/remote-mock.ts), [`kern/test/pki.ts`](../../../kern/test/pki.ts);
Tests [`kern/test/remote.test.ts`](../../../kern/test/remote.test.ts)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Node 26.5.1, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 über [`prototyp/dss`](../../../prototyp/dss/) (neuer Befehl
`validate-ts`), OpenSSL 3.5.7 als unabhängige Gegenprobe für RFC 3161. CSC-Spezifikation 2.2.0.0
und 2.0.0.2 als PDF mit SHA-256 (nicht eingecheckt).

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Signatur über den Mock-Dienst ist im Kern prüfbar | **erfüllt:** `RemoteCscSigner` signiert über den Mock-RSSP (CSC API v2, HTTP auf 127.0.0.1) mit RSA 3072 und ECDSA P-256; `validateContainer` urteilt `TOTAL_PASSED` (Anker Signaturzertifikat oder Test-Wurzel + CRL), ohne Sperrliste `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE`, mit gesperrtem Zertifikat `INDETERMINATE / REVOKED_NO_POE`, nach Manipulation `TOTAL_FAILED / HASH_FAILURE`. DSS 6.5 urteilt in allen 13 Aufrufen von 05-dss.txt wie der Kern. Auch über die Kommandozeile `hpro csc sign` (PIN und OTP über stdin). epubcheck: alle 10 erzeugten Container (unsigniert, signiert, manipuliert) 0 Fehler, 0 Warnungen. Testlauf: 27 Tests in `remote.test.ts` | [01-mock-csc.txt](01-mock-csc.txt), [02-csc-kommandozeile.txt](02-csc-kommandozeile.txt), [04-epubcheck.txt](04-epubcheck.txt), [05-dss.txt](05-dss.txt), [07-npm-test.txt](07-npm-test.txt) |
| 2 | Zeitstempel wird gegen einen öffentlichen RFC-3161-Dienst geprüft, Ergebnis in docs/belege/ | **erfüllt** mit vier Diensten: FreeTSA, DigiCert, DFN, Sectigo (qualifiziert). Je Dienst: Anfrage nur mit SHA-256-Hash und Nonce, Antwort `granted`, Kern-Prüfung `PASSED` (Message Imprint, CMS-Signatur, ESS-Bindung, EKU `timeStamping` kritisch, Nonce, Kette bis zur veröffentlichten Wurzel, Sperrlisten der Kette); Gegenprobe mit anderen Daten `FAILED / HASH_FAILURE`. OpenSSL `ts -verify`: 8× `Verification: OK`, mit anderen Daten `FAILED`. Signatur B-T mit FreeTSA- und Sectigo-Zeitstempel: Kern und DSS `TOTAL_PASSED`, Zeitstempel `PASSED`; Zeitstempel einer anderen Signatur: Kern und DSS Zeitstempel `FAILED / HASH_FAILURE` | [03-oeffentliche-tsa.txt](03-oeffentliche-tsa.txt), [05-dss.txt](05-dss.txt), Antworten unter [container/tsa/](container/tsa/) |
| 3 | Was für den echten Anbieter fehlt, steht als offener Punkt in docs/ | **erfüllt:** 14 offene Punkte für A-Trust in [docs/13, Abschnitt 8](../../13-fernsignatur-und-zeitstempel.md#8-offene-punkte-für-den-echten-anbieter-a-trust) (Zugang, OAuth 2.0, Freigabeablauf, Algorithmen, Kodierung, Qualifikation über Vertrauensliste, OCSP und B-LT/LTA, qualifizierter Zeitstempel, Mehrfachsignatur, Datenschutz, CORS, Prüfdienste Dritter, Barrierefreiheit, Rechtliches); „nicht geprüft“ in Abschnitt 7; Verweise in docs/03, docs/05, docs/06 und Spezifikation Teil 18 | [docs/13](../../13-fernsignatur-und-zeitstempel.md) |

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen, Prüfsummen der CSC-Spezifikation, Nachweis: Kernmodule ohne Node-APIs |
| [01-mock-csc.txt](01-mock-csc.txt) | Test-PKI, Mock-RSSP über HTTP, `info`/`auth/login`/`listKeys`, drei Signaturen (RSA, EC, EC + Mock-TSA), Prüfung im Kern mit verschiedenen Ankern und Sperrlisten, Manipulation, Negativfälle, Protokoll dessen, was der Dienst sieht |
| [02-csc-kommandozeile.txt](02-csc-kommandozeile.txt) | `hpro csc info|keys|sign` gegen den Mock (der Nutzer tippt PIN und OTP), `hpro validate`; `hpro timestamp` erweitert eine Fernsignatur nachträglich mit FreeTSA auf B-T |
| [03-oeffentliche-tsa.txt](03-oeffentliche-tsa.txt) | vier öffentliche Dienste: Anfrage, Antwort, Anker, Sperrlisten, Kern-Urteil, Gegenprobe; B-T-Container mit öffentlichem Zeitstempel; vertauschter Zeitstempel; OpenSSL `ts -reply -text` und `ts -verify`; `hpro tsp request|verify` |
| [04-epubcheck.txt](04-epubcheck.txt) | epubcheck 5.4.0 auf alle erzeugten Container |
| [05-dss.txt](05-dss.txt) | DSS 6.5 `validate-ts` auf dieselben Container, je Fall mit dem erwarteten Kern-Urteil in der Überschrift |
| [06-messung.txt](06-messung.txt) | Laufzeiten: Fernsignatur über Mock (HTTP), Mock-TSA, öffentliche Dienste, Offline-Prüfung |
| [07-npm-test.txt](07-npm-test.txt) | `npm ci` und `npm test` des ganzen Repos |
| [08-kein-geheimnis.txt](08-kein-geheimnis.txt) | kein privater Schlüssel, keine SAD, kein Zugangstoken unter `docs/belege/P10`; kein Mock-Server läuft nach dem Lauf |
| [09-konformitaet.txt](09-konformitaet.txt) | Konformitätsprüfer `hpro-check`: Warnung HPR-SIG-012 (kein Signaturzeitstempel, HP-SIG-010) beim B-Container, nicht beim B-T-Container |
| [container/](container/) | signierte Container, Zertifikate der Test-PKI (nur öffentlich), Sperrlisten (`crl/`), Anfragen, Antworten und Anker der öffentlichen Dienste (`tsa/`) |

## Was der Fernsignaturdienst zu sehen bekommt

Aus dem Protokoll des Testdoppels ([01-mock-csc.txt](01-mock-csc.txt), Geheimnisse geschwärzt):
Credential-Kennung, ein SHA-256-Hash (Base64), Algorithmus-OIDs, die Beschreibung
„hpro: Prüfdokument hpro P1“ (Dokumenttitel, für die Freigabeanzeige). Kein Dokumentinhalt:
`Lieferung=false, 1.200,00=false, <html=false`; `Prüfdokument=true` stammt aus dem Titel. Ob der Titel
gesendet werden soll, ist offener Punkt 10 in docs/13.

## Befunde am Rand

- **Kein Urteil ohne Sperrinformation:** Unterhalb eines Vertrauensankers bleibt eine Kette ohne
  Sperrliste `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE` – beim Kern wie bei DSS. Deshalb
  prüft der Kern jetzt CRLs; OCSP fehlt.
- **Ein kaputter Zeitstempel kippt die Signatur nicht:** DSS 6.5 meldet in diesem Fall
  `TOTAL_PASSED` mit Warnung und bewertet nur den Zeitstempel als `FAILED / HASH_FAILURE`; der Kern
  hält es genauso (docs/13, Abschnitt 5).
- **DSS-Warnungen zum Testdoppel:** „The authority info access is not present!“ und „The revocation
  info access is not present!“ – die Zertifikate der Test-PKI tragen keine AIA- und keine
  CRL-Verteilpunkt-Erweiterung; das Urteil bleibt `TOTAL_PASSED`.
- **Kodierung ECDSA:** Der Mock liefert DER (Standard) oder r‖s; der Kern nimmt beides, die
  Spezifikation legt es nicht fest (offener Punkt 5).
- **Netzlaufzeit dominiert:** Fernsignatur im Kern 16–27 ms (Median, Loopback), öffentliche
  Zeitstempel 0,2–3,2 s je Anfrage ([06-messung.txt](06-messung.txt)).

## Nicht geprüft

Echter Fernsignaturdienst, OAuth-2.0-Ablauf, asynchrone Freigabe, Qualifikation über
Vertrauenslisten, OCSP, CORS im Browser, RTR-Prüfdienst – jeweils mit Grund in
[docs/13, Abschnitt 7](../../13-fernsignatur-und-zeitstempel.md#7-nicht-geprüft).
