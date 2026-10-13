# Echte RFC-3161-Antworten (Paket P10)

Am 13.10.2026 mit `kern/dist` (`encodeTimeStampRequest`, SHA-256 über `data.txt`, Nonce,
`certReq`) von vier öffentlichen Diensten geholt; die Tests prüfen sie offline zum Zeitpunkt
`genTime`.

| Datei | Dienst | Vertrauensanker | Sperrlisten |
|---|---|---|---|
| `freetsa.tsr` | https://freetsa.org/tsr | `freetsa-root.pem` (https://freetsa.org/files/cacert.pem) | `freetsa-1.crl` |
| `digicert.tsr` | http://timestamp.digicert.com | `digicert-root.der` (https://cacerts.digicert.com/DigiCertTrustedRootG4.crt) | `digicert-1..3.crl` |
| `dfn.tsr` | http://zeitstempel.dfn.de | `dfn-root.der` (https://pki.pca.dfn.de/dfn-verein-community-root-ca/pub/cacert/cacert.crt) | `dfn-1..2.crl` |
| `sectigo-q.tsr` | http://timestamp.sectigo.com/qualified | `sectigo-root.der` (http://crt.sectigo.com/SectigoQualifiedTimeStampingRootR45.crt) | `sectigo-q-1..2.crl` |

Die Anker stammen von den Webseiten der Anbieter, nicht aus einer Vertrauensliste; das ist für
Tests ausreichend, für eine Prüfung mit Beweiswert nicht (docs/13, offene Punkte).
