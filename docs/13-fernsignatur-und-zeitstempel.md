# 13 – Fernsignatur (CSC) und Zeitstempel (RFC 3161)

**Projekt:** hpro · **Paket:** P10 · **Stand:** 13.10.2026
**Belege:** [`docs/belege/P10/`](belege/P10/README.md) · **Code:** [`kern/src/csc.ts`](../kern/src/csc.ts),
[`kern/src/tsp.ts`](../kern/src/tsp.ts), [`kern/src/crl.ts`](../kern/src/crl.ts),
[`kern/src/sign.ts`](../kern/src/sign.ts), [`kern/src/xades.ts`](../kern/src/xades.ts),
Testdoppel [`kern/test/remote-mock.ts`](../kern/test/remote-mock.ts) und
[`kern/test/pki.ts`](../kern/test/pki.ts), Tests [`kern/test/remote.test.ts`](../kern/test/remote.test.ts)

---

## 1. Ergebnis in fünf Sätzen

1. **Fernsignatur:** Der Kern signiert über einen Fernsignaturdienst nach CSC API v2 (geprüft gegen
   die Fassung 2.2.0.0 der Spezifikation). Zum Dienst gehen nur der SHA-256-Hash des kanonischen
   `SignedInfo`, die Credential-Kennung und eine Beschreibung; der signierte Container wird im Kern
   gebaut und von ihm geprüft (`TOTAL_PASSED`, gleiches Urteil wie EU DSS 6.5).
2. **Testdoppel statt Anbieter:** Zugangsdaten von A-Trust liegen nicht vor. Ein Mock-Dienst setzt
   durch, was ein echter Anbieter durchsetzt (Zugangstoken, PIN und Einmalcode, an den Hash gebundene
   Signaturfreigabe, Einmalverwendung, Algorithmus des Schlüssels). Er läuft in den Tests im Prozess
   und für die Belege über HTTP auf 127.0.0.1 und wird danach beendet.
3. **Zeitstempel:** Signaturen erreichen Niveau **XAdES-BASELINE-T** (Anforderung HP-SIG-010). Der Kern
   holt, schreibt und prüft RFC-3161-Zeitstempel. Gegen vier öffentliche Dienste (FreeTSA, DigiCert,
   DFN, Sectigo qualifiziert) ist das Ergebnis `PASSED`, mit Kette bis zur veröffentlichten Wurzel und
   Sperrlisten; OpenSSL und DSS bestätigen es unabhängig.
4. **Sperrlisten:** Damit ein Urteil unterhalb eines Vertrauensankers nicht bei „unbestimmt“ stehen
   bleibt, prüft der Kern jetzt CRLs (Signatur der Sperrliste, Gültigkeit, Sperreintrag). OCSP,
   Vertrauenslisten und das Einbetten der Prüfdaten (B-LT/LTA) fehlen noch.
5. **Für den echten Anbieter** fehlen vor allem: Zugang und Testumgebung, die OAuth-2.0-Anbindung im
   Reader, Klarheit über Freigabeablauf, Schlüsselalgorithmus und Kodierung bei A-Trust sowie die
   Prüfung der Qualifikation über die Vertrauensliste (Abschnitt 8).

---

## 2. Einordnung in den Anspruch (docs/10)

| Zusage / Regel aus [10](10-anspruch-und-funktionsprofil.md) | Was P10 dafür tut | Was es nicht tut |
|---|---|---|
| Zusage 5, *signiert, zeitgestempelt, mit Prüfprotokoll* | Signatur auf Niveau B-T, Prüfbericht je Zeitstempel (genTime, TSA, Kette, Sperrstatus) | keine Anzeige im Reader (P4 zeigt den Status, die Zeitstempelzeile fehlt dort noch) |
| Zusage 5, *eingefrorene Fassung signierbar* | `signContainer` mit `paths` (P3) und `timestamp` zusammen nutzbar; `hpro timestamp` erweitert eine vorhandene Signatur der eingefrorenen Fassung nachträglich | Zuordnung Signatur ↔ Fassung bleibt Sache von P17 |
| Kap. 3 Nr. 2, *eine Datei, kein Dienst* | Dienste nur beim **Erzeugen** (Signaturwert, Zeitstempel). Token, Zertifikate und Kette liegen in der Datei; die Prüfung läuft offline, Sperrlisten werden nur auf ausdrücklichen Wunsch (`--fetch-crls`) geholt | Sperrlisten liegen noch nicht in der Datei (B-LT, Abschnitt 8) |
| Kap. 4 a, *aufbauen auf offenen Standards* | CSC API v2, RFC 3161/5816, RFC 5652 (CMS), RFC 5280 (CRL), XAdES EN 319 132-1 | – |
| Kap. 3 Nr. 4, *Sicherheit im Format* | Der Signaturwert des Dienstes wird mit dem Zertifikat geprüft, bevor er ins Dokument kommt; Zeitstempel werden vor dem Einbetten geprüft (Hash, Nonce, Signatur) | – |

---

## 3. Was gebaut wurde

| Teil | Datei | Inhalt |
|---|---|---|
| RFC 3161 | `kern/src/tsp.ts` | `encodeTimeStampRequest` (nur Hash, Nonce, `certReq`), `parseTimeStampResponse` (Status, `failInfo`), `parseTstInfo`, `verifyTimeStampToken` (CMS-Signatur, `messageDigest`, ESS-Zertifikatsbindung v1/v2, EKU `timeStamping` kritisch, `genTime` in der Zertifikatslaufzeit, Message Imprint, Nonce, Kette, Sperrstatus), `HttpTimestampAuthority` (RFC 3161 §3.4 über `fetch`) |
| CSC API v2 | `kern/src/csc.ts` | `CscClient` (`info`, `auth/login`, `credentials/list`, `credentials/info`, `credentials/getChallenge`, `credentials/authorize`, `signatures/signHash`, `signatures/timestamp`; Fehler nach Abschnitt 10.1 als `CscError`), `RemoteCscSigner` (Adapter `Signer`), `CscTimestampAuthority` |
| Sperrlisten | `kern/src/crl.ts` | `parseCrl`, `crlIssuedBy`, `revocationStatus`, `fetchCrls` (nur HTTP/HTTPS aus den Verteilpunkten) |
| Signieren B-T | `kern/src/sign.ts` | Option `timestamp` in `signContainer`; `addSignatureTimestamp` erweitert eine vorhandene B-Signatur; Rückleseprüfung verlangt Niveau T, passenden Imprint und intakte TSA-Signatur |
| Prüfen B-T | `kern/src/xades.ts`, `validate.ts`, `sigcommon.ts` | `xades:SignatureTimeStamp` je Signatur geprüft, Bericht `timestamps[]`; CRLs für Signatur- und TSA-Kette (`ValidateOptions.crls`); neue Unterindikation `REVOKED_NO_POE` |
| Adapter | `kern/src/adapters/timestamp.ts` | Schnittstelle `TimestampAuthority`; `PlatformAdapters.timestampAuthorities` |
| Kommandozeile | `kern/bin/hpro-remote.ts`, `hpro.ts` | `hpro sign … --tsa URL`, `hpro timestamp`, `hpro tsp request|verify`, `hpro csc info|keys|sign`, `hpro validate --crl/--fetch-crls` |
| Testdoppel | `kern/test/remote-mock.ts`, `pki.ts` | Mock-RSSP (CSC v2.2.0.0), Mock-TSA, Test-PKI (Wurzel, zwei Signaturzertifikate, TSA-Zertifikat, CRL) |
| Gegenprobe | `prototyp/dss/…/HproDss.java` | neuer Befehl `validate-ts`: mehrere Anker, Sperrlisten offline, Zeitstempelbericht |

Die Kernmodule nutzen nur `fetch` und WebCrypto (Beleg in
[00-werkzeuge.txt](belege/P10/00-werkzeuge.txt)); sie laufen damit unverändert im Browser, in
Tauri und in Node. Der Mock-Dienst nutzt Node-APIs und liegt deshalb unter `kern/test/`, nicht in
der Bibliothek.

### 3.1 Kommandozeile (Beispiele)

```sh
# Signieren mit Software-Schlüssel und Zeitstempel (B-T)
hpro sign doc.hpro signiert.hpro --key key.pem --cert cert.pem --tsa https://freetsa.org/tsr
# vorhandene Signatur nachträglich auf B-T erweitern
hpro timestamp signiert-b.hpro signiert-t.hpro --tsa http://timestamp.sectigo.com/qualified
# prüfen, Sperrlisten der Ketten online holen (sonst offline)
hpro validate signiert-t.hpro --trust anker.pem --trust tsa-wurzel.pem --fetch-crls
# Fernsignatur (PIN und Einmalcode werden abgefragt)
hpro csc sign doc.hpro signiert.hpro --url https://rssp.example/csc/v2 --user ID --credential CRED --tsa URL
```

---

## 4. Vertrag mit dem Fernsignaturdienst (CSC API v2)

Grundlage ist die Spezifikation des Cloud Signature Consortium, Fassung **2.2.0.0**
(<https://cloudsignatureconsortium.org/wp-content/uploads/2025/11/csc-api.pdf>, SHA-256
`339cb990…76c1`), gegengelesen mit 2.0.0.2. Die Abschnittsnummern unten beziehen sich auf 2.0.0.2,
die Methoden und Felder sind in 2.2.0.0 gleich (Abschnitt 11.13 `signatures/signHash` in 2.2.0.0).
Die PDF-Dateien sind nicht eingecheckt.

### 4.1 Ablauf einer Signatur

```
hpro (Gerät)                                         Fernsignaturdienst (RSSP)
 1. XAdES-Gerüst bauen, SignedInfo kanonisieren
 2. SHA-256(SignedInfo) = H
                         ── credentials/list ──────▶  Zertifikatskette, key/algo, auth/mode, SCAL
 3. Nutzer gibt frei (PIN, Einmalcode …)
                         ── credentials/getChallenge ▶ (OTP per SMS, HTTP 204)
                         ── credentials/authorize ──▶  hashes=[H], numSignatures=1, authData
                         ◀─ SAD ─────────────────────  (an H gebunden, SCAL 2)
                         ── signatures/signHash ────▶  hashes=[H], signAlgo, SAD
                         ◀─ Signaturwert ────────────
 4. Wert mit dem Zertifikat über SignedInfo prüfen
 5. optional Zeitstempel über ds:SignatureValue (RFC 3161 oder signatures/timestamp)
 6. signatures.xml schreiben, Container schreiben, zurücklesen und prüfen
```

### 4.2 Abbildung auf den Kern

| Kern (`Signer`, docs/06 4.1) | CSC | Regel |
|---|---|---|
| `listKeys()` | `credentials/list` mit `credentialInfo`, `certificates=chain`, `certInfo`, `authInfo`; fehlende Angaben über `credentials/info` | nur Credentials mit `key/status = enabled`, Zertifikatskette und einem Algorithmus, den der Kern schreiben kann |
| `SigningKey.algorithms` | `key/algo` + Schlüssel im Zertifikat | RSA: `sha256WithRSAEncryption` (Hash implizit) oder `rsaEncryption` + `hashAlgorithmOID`; EC P-256/P-384: `ecdsa-with-SHA256/384` oder `ecPublicKey` + `hashAlgorithmOID` |
| `SigningKey.qualified` | `signatureQualifier = eu_eidas_qes` | **nur Angabe des Dienstes**, nicht geprüft (Abschnitt 8, Punkt 6) |
| `requiresAuthorisationPerSignature` | immer `true` | eine Freigabe je Signatur (`numSignatures = 1`) |
| Freigabe | Rückruf `authorize` liefert `explicit` (Faktoren für `credentials/authorize`) oder `credential-token` (OAuth-2.0-Token mit Bereich `credential`, als SAD übergeben) | wie der Nutzer gefragt wird, bestimmt die Anwendung, nicht der Kern |
| `signDigest()` | `signatures/signHash` | ECDSA-Werte als DER **oder** r‖s angenommen (die Spezifikation legt die Kodierung nicht fest); der Wert wird **vor** der Verwendung mit dem Zertifikat über `SignedInfo` geprüft |

**Was der Dienst sieht** (Protokoll des Testdoppels in [01-mock-csc.txt](belege/P10/01-mock-csc.txt)):
Methodennamen, Credential-Kennung, einen Base64-SHA-256-Hash, Algorithmus-OIDs und als
`description` den Text „hpro: “ plus den **Dokumenttitel** (die Spezifikation sieht das Feld für die
Anzeige beim Freigeben vor). Inhalt, Dateinamen und Werte des Dokuments gehen nicht hinaus. Ob der
Titel gesendet werden soll, ist eine Datenschutzentscheidung (Abschnitt 8, Punkt 10).

### 4.3 Was das Testdoppel durchsetzt

| Regel | Fundstelle (CSC 2.0.0.2) | Testfall |
|---|---|---|
| ohne `Authorization: Bearer …` keine Methode außer `info` und `auth/login`; abgelaufenes Token → 401 | 11.4 ff. Fehlertabellen | `CSC: info without token …`, SAD-Test |
| `auth/login` nur mit richtigem Benutzer und Passwort (HTTP Basic) | 11.2 | dto. |
| `credentials/authorize`: PIN **und** OTP (`expression = "PIN AND OTP"`), OTP nur nach `getChallenge` und nur einmal gültig; dreimal falsch → „Credential locked“ | 11.6, 11.8, Note 29 | `wrong PIN …` |
| SCAL 2: `hashes` Pflicht, SAD an diese Hashes gebunden; anderer Hash → „Hash is not authorized by the SAD.“ | 11.6, 11.10 | `CSC SCAL 2 …` |
| SAD einmal verwendbar (`numSignatures`), Ablauf nach 300 s → „SAD expired“ | 11.9, 11.10 | dto. |
| `signAlgo` muss in `key/algo` stehen; Hashlänge passend zur OID | 11.10 | dto. |
| `signatures/timestamp` mit Nonce | 11.13 | `B-T via the CSC method …` |
| Fehlverhalten auf Wunsch: Wert über anderen Hash, ECDSA roh statt DER | – | `RemoteCscSigner accepts raw …` |

Der Mock signiert echt: RSA PKCS#1 v1.5 über `DigestInfo` (Node `privateEncrypt`) und ECDSA P-256 über
einen vorab berechneten Hash (eigene BigInt-Rechnung, weil WebCrypto und Node keine Hashes
signieren). Ein Selbsttest prüft die ECDSA-Werte mit WebCrypto.

---

## 5. Zeitstempel im Container

- Ort: `xades:QualifyingProperties/xades:UnsignedProperties/xades:UnsignedSignatureProperties/xades:SignatureTimeStamp`
  mit `ds:CanonicalizationMethod` (exklusive C14N) und `xades:EncapsulatedTimeStamp` (DER-Token,
  Base64). Gestempelt wird SHA-256 über das kanonische `ds:SignatureValue`-Element
  (EN 319 132-1, Signaturzeitstempel).
- Der unsignierte Teil liegt hinter `xades:SignedProperties`; der signierte Teil bleibt Byte für Byte
  gleich (Test `addSignatureTimestamp …`: alles vor der Einfügestelle identisch, alle anderen
  Einträge byteidentisch). Signaturen mit bereits vorhandenen unsignierten Eigenschaften werden nicht
  erweitert (Abschnitt 8, Punkt 9).
- **Urteil:** Ein Zeitstempel wird einzeln bewertet (`PASSED`, `FAILED`, `INDETERMINATE`). Ein
  fehlerhafter Zeitstempel ändert das Urteil der Signatur **nicht**, erscheint aber als Warnung an
  der Signatur. Genau so urteilt DSS 6.5 (Fall „Zeitstempel getauscht“ in
  [05-dss.txt](belege/P10/05-dss.txt): Signatur `TOTAL_PASSED`, Zeitstempel `FAILED / HASH_FAILURE`,
  Warnung „The computed message-imprint does not match …“). Liegt die behauptete Signierzeit nach
  `genTime`, warnt der Kern.
- **Vor dem Einbetten** prüft `HttpTimestampAuthority` Status, Nonce, Imprint und TSA-Signatur; ein
  Token über andere Daten wird abgewiesen (Test `B-T with a recorded public token …`).

---

## 6. Ergebnisse

### 6.1 Kriterium 1 – Signatur über den Mock-Dienst, im Kern prüfbar

Aus [01-mock-csc.txt](belege/P10/01-mock-csc.txt) und [05-dss.txt](belege/P10/05-dss.txt):

| Container | Anker | Kern | DSS 6.5 |
|---|---|---|---|
| `csc-rsa.epub` (RSA 3072) | Signaturzertifikat | `TOTAL_PASSED` | `TOTAL_PASSED` |
| `csc-ec.epub` (ECDSA P-256) | Signaturzertifikat | `TOTAL_PASSED` | `TOTAL_PASSED` |
| `csc-ec.epub` | Test-Wurzel, ohne Sperrliste | `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE` | `INDETERMINATE / CERTIFICATE_CHAIN_GENERAL_FAILURE` |
| `csc-rsa.epub`, `csc-ec.epub` | Test-Wurzel + CRL | `TOTAL_PASSED` | `TOTAL_PASSED` (Warnungen: Zertifikate des Testdoppels ohne AIA- und CRL-Verteilpunkt-Erweiterung) |
| `csc-ec.epub` | Test-Wurzel + CRL mit gesperrtem Zertifikat | `INDETERMINATE / REVOKED_NO_POE` | `INDETERMINATE / REVOKED_NO_POE` |
| `csc-ec-manipuliert.epub` | Test-Wurzel + CRL | `TOTAL_FAILED / HASH_FAILURE` | `TOTAL_FAILED / HASH_FAILURE` |
| `csc-ec-bt-mocktsa.epub` (B-T) | Test-Wurzel + CRL | `TOTAL_PASSED`, Zeitstempel `PASSED` | `TOTAL_PASSED`, Zeitstempel `PASSED` |
| `cli-csc-ec-bt.epub` (über `hpro csc sign`) | Test-Wurzel + CRL | `TOTAL_PASSED`, Zeitstempel `PASSED` | `TOTAL_PASSED`, Zeitstempel `PASSED` |

Alle signierten Container bestehen epubcheck 5.4.0 mit 0 Fehlern und 0 Warnungen
([04-epubcheck.txt](belege/P10/04-epubcheck.txt)). Negativfälle gegen den Dienst (falsche PIN, anderer
Hash mit derselben SAD, fremder Algorithmus, zweite Verwendung der SAD, Dienst signiert einen anderen
Hash) enden jeweils mit der in Abschnitt 4.3 genannten Meldung.

### 6.2 Kriterium 2 – Zeitstempel gegen öffentliche RFC-3161-Dienste

Aus [03-oeffentliche-tsa.txt](belege/P10/03-oeffentliche-tsa.txt); gesendet wurde jeweils nur der
SHA-256-Hash von `unsigniert.epub`. Anker von den Webseiten der Anbieter, Sperrlisten aus den
Verteilpunkten der Zertifikate.

| Dienst | TSA-Signatur (Digest; ESS-Bindung) | Kern | OpenSSL `ts -verify` | B-T-Container, DSS 6.5 |
|---|---|---|---|---|
| FreeTSA (`https://freetsa.org/tsr`) | ECDSA mit SHA-512; ESS v1 | `PASSED` (Kette 2, CRL) | `Verification: OK` | `csc-ec-bt-freetsa.epub`: `TOTAL_PASSED`, Zeitstempel `PASSED` |
| DigiCert (`http://timestamp.digicert.com`) | RSA mit SHA-256; ESS v2 | `PASSED` (Kette 3, 2 CRLs) | `Verification: OK` | – |
| DFN (`http://zeitstempel.dfn.de`) | sha256WithRSAEncryption; ESS v2 | `PASSED` (Kette 3, 2 CRLs) | `Verification: OK` | – |
| Sectigo qualifiziert (`http://timestamp.sectigo.com/qualified`), Policy `0.4.0.2023.1.1` | RSA mit SHA-384; ESS v1 | `PASSED` (Kette 3, 2 CRLs) | `Verification: OK` | `csc-ec-bt-sectigo-q.epub`: `TOTAL_PASSED`, Zeitstempel `PASSED` |

ESS v1 heißt: der Token bindet das TSA-Zertifikat über einen SHA-1-Hash (`signingCertificate`,
RFC 2634); RFC 5816 erlaubt das weiter, der Kern akzeptiert beide Formen.

Gegenproben: dieselben Token mit anderen Daten → Kern `FAILED / HASH_FAILURE`, OpenSSL
`Verification: FAILED`. Ohne TSA-Anker bleibt der Zeitstempel `INDETERMINATE /
NO_CERTIFICATE_CHAIN_FOUND`, die Signatur selbst `TOTAL_PASSED`. Eine mit `hpro timestamp`
nachträglich auf B-T erweiterte Fernsignatur besteht Kern und DSS ([02](belege/P10/02-csc-kommandozeile.txt),
[05](belege/P10/05-dss.txt)).

Die vier Antworten liegen außerdem als Fixtures unter
[`kern/test/fixtures/tsp/`](../kern/test/fixtures/tsp/README.md); `npm test` prüft sie bei jedem Lauf
offline (Zeitpunkt `genTime`), ohne Netz.

### 6.3 Messungen

Siehe [06-messung.txt](belege/P10/06-messung.txt) (Takt des Testrechners steht in der Datei).

Lauf vom 13.10.2026 bei vollem Takt (3,4 GHz, Turbo an), Beispielcontainer 4 549 Bytes:

| Messung | Median | Min | Max | n |
|---|---|---|---|---|
| `signContainer` über Mock-RSSP per HTTP (127.0.0.1), RSA 3072: Lesen, XAdES, C14N, `getChallenge` + `authorize` + `signHash`, Prüfung des Werts, ZIP, Rückleseprüfung | 26,5 ms | 21,8 ms | 37,1 ms | 20 |
| dasselbe, ECDSA P-256 | 16,3 ms | 15,2 ms | 28,1 ms | 20 |
| Mock-TSA per HTTP (Anfrage, Antwort, Prüfung) | 2,7 ms | 2,3 ms | 3,2 ms | 20 |
| FreeTSA, Rundreise inkl. Prüfung | 190,8 ms | 187,9 ms | 572,6 ms | 5 |
| DigiCert | 632,5 ms | 183,9 ms | 3 165,4 ms | 5 |
| DFN | 2 065,0 ms | 165,7 ms | 2 065,3 ms | 5 |
| Sectigo qualifiziert | 1 992,0 ms | 643,9 ms | 3 193,0 ms | 5 |
| Offline-Prüfung eines FreeTSA-Tokens (Hash, ECDSA-SHA512, Kette, CRL) | 2,3 ms | 2,0 ms | 3,4 ms | 50 |

Die Rechenzeit im Kern ist klein gegen die Netzlaufzeit: Die öffentlichen Dienste brauchen 0,2 bis
3,2 s je Zeitstempel und schwanken stark (fünf Anfragen sind keine Statistik). Ein echter
Fernsignaturdienst kommt mit Netz und Freigabe durch den Menschen (PIN, App, SMS) dazu; diese Zeit
misst das Testdoppel nicht.

---

## 7. Nicht geprüft

| Was | Warum nicht | Nachholen |
|---|---|---|
| Echter Fernsignaturdienst (A-Trust oder anderer QTSP) | keine Zugangsdaten, kein Vertrag | Testzugang, dann `hpro csc sign` gegen die Testumgebung (Abschnitt 8) |
| OAuth-2.0-Ablauf (`oauth2/authorize`, `oauth2/token`, PKCE, Redirect im Reader) | kein Autorisierungsserver; der Kern nimmt ein Token entgegen (`useAccessToken`, `credential-token`), holt es aber nicht | mit Testzugang, im Reader (P4) und in der Desktop-Hülle (P11) |
| Asynchrone Freigabe (HTTP 202, `credentials/authorizeCheck`), `operationMode = A`, `signPolling` | im Testdoppel nicht nachgebildet; der Client meldet 202 als nicht unterstützt | sobald bekannt ist, ob A-Trust/ID Austria asynchron freigibt |
| Qualifikation von Zertifikat und Zeitstempeldienst | weder QC-Statements (EN 319 412-5) noch EU-Vertrauenslisten im Kern | Vertrauenslisten-Paket (Abschnitt 8, Punkt 6) |
| OCSP | nicht umgesetzt; alle vier öffentlichen Ketten ließen sich über CRLs prüfen | OCSP-Client im Kern, für B-LT nötig |
| CORS der öffentlichen Zeitstempeldienste im Browser | nur aus Node geprüft | Reader (P4) im Browser gegen die Dienste; ohne CORS über den hpro-Dienst |
| RTR-Prüfdienst und DSS-Demo online | Upload an externe Dienste ohne Freigabe (wie in docs/05) | mit Freigabe des Auftraggebers |

---

## 8. Offene Punkte für den echten Anbieter (A-Trust)

Abnahmekriterium 3. A-Trust bewirbt eine CSC-Schnittstelle für Integrationspartner
([A-Trust](https://www.a-trust.at/en/products/signature_solutions_for_companies/cooperation/),
zitiert in [06](06-plattform-und-funktionsmatrix.md)); öffentliche technische Unterlagen dazu wurden
nicht gefunden (Websuche am 13.10.2026 ohne Treffer zu einer A-Trust-CSC-Dokumentation). Alles
Folgende ist deshalb **offen** und vor einer Anbindung zu klären.

1. **Zugang und Vertrag:** Integrationspartnerschaft, Konditionen, Testumgebung mit
   Testidentitäten, Basis-URL (`…/csc/v2` oder `…/csc/v1`). Welche CSC-Version A-Trust anbietet
   (v1 oder v2), ist unbekannt; der Client spricht v2.
2. **Dienstautorisierung:** Welche `authType` (`oauth2code`, `oauth2client`, `basic`)? Für OAuth 2.0
   braucht hpro eine Client-Registrierung (`client_id`, Redirect-URIs für Web, Desktop, mobil, ggf.
   PKCE). Der Redirect-Ablauf im Reader ist nicht gebaut; der Kern nimmt nur ein fertiges Token an.
3. **Credential-Freigabe:** `auth/mode` `explicit` (hpro fragt PIN/OTP ab) oder `oauth2code`
   (Freigabe beim Anbieter, z. B. in der App „Digitales Amt“ bei ID Austria, siehe
   [06](06-plattform-und-funktionsmatrix.md))? Wird asynchron freigegeben (HTTP 202,
   `authorizeCheck`)? SCAL 1 oder 2? Davon hängt ab, ob der Rückruf `authorize` reicht oder ein
   Wartedialog nötig ist.
4. **Schlüssel und Algorithmen:** `key/algo`, Kurve bzw. Schlüssellänge der A-Trust-Credentials
   sind unbekannt. Gebaut sind RSA PKCS#1 v1.5 mit SHA-256 und ECDSA P-256/P-384; RSASSA-PSS
   (`1.2.840.113549.1.1.10` mit `signAlgoParams`) fehlt im Signierer **und** in der Prüfung.
5. **Kodierung des Signaturwerts:** Die CSC-Spezifikation sagt nur „Base64-encoded signed hash“.
   Der Kern nimmt bei ECDSA DER und r‖s an und prüft den Wert vor der Verwendung; mit A-Trust nicht
   geprüft.
6. **Qualifizierte Signatur nachweisen:** `qualified` beruht heute nur auf `signatureQualifier`. Für
   eine QES muss der Prüfer QC-Statements im Zertifikat lesen (QcCompliance, QcSSCD,
   EN 319 412-5) und die Kette gegen die **österreichische Vertrauensliste (RTR)** bzw. die
   EU-Liste der Listen prüfen. Beides fehlt im Kern; ohne das zeigt hpro „gültig“, aber nicht
   „qualifiziert“.
7. **Sperrinformation und Langzeitprüfung:** A-Trust-Zertifikate werden voraussichtlich über OCSP
   geprüft (nicht verifiziert). Der Kern kann nur CRLs. Für Archiv-Fassungen verlangt HP-SIG-011
   Niveau B-LT (`xades:CertificateValues`, `xades:RevocationValues`) und empfiehlt LTA
   (`xades:ArchiveTimeStamp`); beides ist nicht gebaut.
8. **Qualifizierter Zeitstempel:** Welcher Dienst? A-Trust-eigener Zeitstempel, `signatures/timestamp`
   des RSSP (im Client vorhanden) oder ein anderer qualifizierter Dienst? Dass der getestete Sectigo-
   Dienst qualifiziert ist, steht nur in seinem Namen und seiner Policy-OID (`0.4.0.2023.1.1`, ETSI
   EN 319 421); gegen die Vertrauensliste geprüft ist es nicht.
9. **Mehrere Signaturen und Erweiterung:** `multisign > 1`, `credentials/extendTransaction` und das
   Erweitern von Signaturen mit vorhandenen unsignierten Eigenschaften (etwa ein zweiter Zeitstempel,
   B-LT nach B-T) sind nicht gebaut; jede Signatur braucht eine eigene Freigabe.
10. **Datenschutz:** Der Dokumenttitel geht als `description` an den Dienst (Abschnitt 4.2). Ob er
    gesendet, gekürzt oder durch einen neutralen Text ersetzt wird, ist zu entscheiden; ebenso die
    Aufbewahrung des Protokolls beim Anbieter.
11. **Web-Reader:** CORS oder Redirect-Ablauf der A-Trust-Schnittstelle für eine Web-App
    ([06, Anmerkung 13](06-plattform-und-funktionsmatrix.md)); dasselbe für Zeitstempeldienste.
12. **Prüfdienste Dritter:** Wie RTR-Prüfdienst und DSS-Demo einen QES-Container mit
    `application/epub+zip` bewerten (Warnung zum mimetype, [05, 5.1](05-prototyp-ergebnisse.md)),
    ist mit einer echten QES zu prüfen.
13. **Barrierefreiheit des Freigabeablaufs** (EAA Anhang I, [03, 5.1](03-konzept.md)): PIN- und
    OTP-Dialoge bzw. der Redirect müssen mit Tastatur und Screenreader bedienbar sein; nicht geprüft.
14. **Rechtliches:** Kosten je Signatur, Haftung, Nutzungsbedingungen für eine offene
    Referenzimplementierung; später EUDI-Wallet (Art. 5a eIDAS) als zweiter Weg.

---

## 9. Grenzen dieser Arbeit

- Die Test-PKI ist selbst erzeugt und **nicht qualifiziert**. Ein Urteil `TOTAL_PASSED` heißt hier:
  Format, Hashes, Signaturwert, Kette zum angegebenen Anker und Sperrstatus stimmen – nicht: „rechtlich
  eine QES“.
- Die Anker der öffentlichen Zeitstempeldienste stammen von deren Webseiten (teils über HTTP geladen),
  nicht aus einer Vertrauensliste; ihre SHA-256-Werte stehen in
  [03-oeffentliche-tsa.txt](belege/P10/03-oeffentliche-tsa.txt).
- Eine CRL wird nur verwendet, wenn Aussteller und Signatur stimmen, sie `nextUpdate` hat und dieses
  nicht vor dem Prüfzeitpunkt liegt, sie keine unbekannte kritische Erweiterung trägt und ihr Bereich
  (`issuingDistributionPoint`: Verteilpunkt-URI, nur Endnutzer- bzw. nur CA-Zertifikate) das
  Zertifikat abdeckt. Ein Sperreintrag in irgendeiner verwendbaren CRL gilt. Delta-CRLs, indirekte
  CRLs und nach Sperrgründen geteilte CRLs werden nicht verwendet (Ergebnis „unbekannt“, also
  `INDETERMINATE`, nie `PASSED`).
- Ein beschädigtes Zeitstempel-Token (unsignierter Teil, von jedem änderbar) führt zu
  `FAILED / FORMAT_FAILURE` für diesen Zeitstempel; die Prüfung des Containers läuft weiter.
- Die unabhängige Code-Durchsicht nach dem ersten Commit fand sechs Fehler (u. a. CRL-Reihenfolge,
  nicht gelesene CRL-Erweiterungen, Absturz bei kaputtem Token); alle sind behoben und durch Tests in
  `kern/test/remote.test.ts` abgedeckt.
