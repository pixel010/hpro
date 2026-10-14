# Demo-Dokumente von hpro 0.1.0

Drei Dokumente, die zeigen, was das Format kann. Alle Angaben darin sind erfunden.
**Lizenz: CC0-1.0** ([`LICENSES/CC0-1.0.txt`](../LICENSES/CC0-1.0.txt)): frei kopieren, ändern,
in eigene Testsuiten übernehmen, ohne Namensnennung.

| Datei | Was sie zeigt | Profil, Stufen | Zusagen ([docs/10](../docs/10-anspruch-und-funktionsprofil.md)) |
|---|---|---|---|
| [`hpro-demo-bericht.hpro`](hpro-demo-bericht.hpro) | Jahresbericht einer Wasserversorgung: Kurzfassung, aufklappbare Einzelheiten (auch verschachtelt), stabile Adressen je Abschnitt, Balkendiagramm (SVG) mit Werten als Tabelle, rechnende Kostentabelle (7 Formeln nach OpenFormula, Text verweist auf Ergebniszellen), zweites Inhaltsdokument als Anhang | `static`, Basis | 1, 3, 6, 7 |
| [`hpro-demo-formular.hpro`](hpro-demo-formular.hpro) | Reisekostenabrechnung: Felder mit Beschriftung, Tagesgeld, Kilometergeld, Summe und Auszahlung rechnen beim Ausfüllen, Abschnitt „Eigenes Fahrzeug“ erscheint nur bei dieser Wahl, Prüfregeln, Formulardaten `data/abrechnung.json` mit JSON-Schema; kein Skript im Dokument | `interactive`, Basis + Lebendig | 1, 2, 4, 7 |
| [`hpro-demo-nachweis.hpro`](hpro-demo-nachweis.hpro) | Prüfnachweis einer Hausinstallation: statischer Text mit sichtbarem Signaturhinweis, XAdES-BASELINE-B-Signatur über alle Dateien (`META-INF/signatures.xml`); jede Änderung macht die Signatur ungültig | `signed`, Basis + Signiert | 5 |

Prüfsummen (SHA-256), gleich dem Bau aus `demo/quellen/` mit `scripts/release-bauen.sh`:

```text
e1e0e91c9e14166b4db00e04de564cc356b52f16599a298b022c0ca8a4023e2c  hpro-demo-bericht.hpro
54dbaa6512a19039050a15abec01f5274c2ac860feedc3a5fa426e1c4d9ae619  hpro-demo-formular.hpro
bbf2bd57d7e70d2683f5885e7229d1f750939fc9fed5900728424f44b9e512ec  hpro-demo-nachweis.hpro
```

## Prüfergebnisse

Wörtlich in [`docs/belege/P14/`](../docs/belege/P14/README.md):

- epubcheck 5.4.0: alle drei `0 fatals / 0 errors / 0 warnings / 0 infos`.
- Eigene Prüfung (`hpro check`, 164 Regeln aus Teil 1): alle drei `0 fatal, 0 Fehler`. Bericht und
  Formular haben 0 Warnungen. Der Nachweis hat eine Warnung, `HPR-SIG-012`: kein
  Signaturzeitstempel, Niveau B statt dem empfohlenen T. Vier Regeln bleiben „nicht geprüft“, weil
  sie eine Browser-Engine bzw. eine Begriffsliste brauchen.
- Signatur des Nachweises (`hpro validate`, Vertrauensanker = Demo-Zertifikat): `TOTAL_PASSED`.
  Die Gegenprobe mit EU DSS 6.5 ergibt dasselbe; eine manipulierte Kopie wird erkannt.
- Rechnen: `hpro calc check` zeigt beim Bericht 7 Formeln und 0 Abweichungen. Das Formular wurde im
  Reader und mit `hpro form submit` ausgefüllt: 22,50 + 43,00 + 7,50 = 73,00 €, abzüglich
  20,00 € Vorschuss ergibt 53,00 €.

## Warum der Nachweis keinen Zeitstempel hat

Ein qualifizierter Zeitstempel (`hpro sign --tsa URL`, XAdES-BASELINE-T) kommt von einem
Zeitstempeldienst im Netz. Er ändert sich bei jedem Aufruf, dann wäre die Datei nicht mehr aus den
Quellen reproduzierbar. Die Demo bleibt deshalb bei Niveau B mit fester Signierzeit
`2026-10-14T08:30:00Z`. Wie ein Zeitstempel ergänzt wird, zeigt
[docs/13](../docs/13-fernsignatur-und-zeitstempel.md).

## Testschlüssel

`schluessel/demo-pruefstelle.key.pem` ist ein **absichtlich veröffentlichter Testschlüssel**
(RSA 3072, selbstsigniert, `CN=hpro Demo-Pruefstelle (TEST, nicht vertrauenswuerdig)`). Er liegt im
Repository, damit jeder den signierten Nachweis bytegleich nachbauen kann: RSA-Signaturen nach
PKCS#1 v1.5 enthalten keinen Zufall. Dieser Schlüssel beweist nichts über einen Unterzeichner. Ein
Lesesystem darf ihm nur vertrauen, wenn man ihn ausdrücklich als Vertrauensanker angibt (`--trust`).

## Neu bauen

```sh
npm run build -w kern
node scripts/demo-bauen.mjs                 # schreibt demo/*.hpro
node scripts/demo-bauen.mjs --vergleichen   # baut im Speicher und vergleicht mit demo/*.hpro
```

Quellen: `quellen/<name>/dokument.json` (Metadaten, Lesereihenfolge, Inhaltsverzeichnis,
Barrierefreiheit) und die Inhaltsdateien darunter. Das Verfahren ist der „CMS-Weg“ aus dem
Umsetzer-Handbuch, Kapitel 9.
