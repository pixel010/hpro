# Belege P11 – Desktop-Hülle (Tauri 2)

**Stand:** 13.10.2026 · **Erzeugt mit:** [`scripts/belege-p11.sh`](../../../scripts/belege-p11.sh)
(wörtliche Ausgaben mit Exit-Code; jeder Lauf erzeugt neue Testschlüssel und Signaturen, die Befunde
bleiben gleich) · **Beschreibung:** [docs/14](../../14-desktop-huelle.md) · **Code:**
[`huelle/`](../../../huelle/README.md), Brücke [`app/src/desktop.ts`](../../../app/src/desktop.ts)

Werkzeuge ([00-werkzeuge.txt](00-werkzeuge.txt)): Rust 1.99.0 (rustup in `huelle/.werkzeug`),
tauri-cli 2.12.2, Crate `tauri` 2.12.3, `wry` 0.57.0, WebKitGTK 2.52.6 und GTK 3.24.49 aus Debian 13
(entpackt nach `huelle/.werkzeug/sysroot`, kein root), Node 26.5.1, Temurin JDK 21.0.12.1+1,
epubcheck 5.4.0, EU DSS 6.5 ([`prototyp/dss`](../../../prototyp/dss/)), veraPDF 1.30.3, Thunar 4.20.2,
SoftHSM 2. Alles unter Xvfb (X11, 1280 × 860/900), ohne Fenstermanager.

## Abnahmekriterien

| # | Kriterium | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Release-Build für Linux läuft und öffnet einen Container aus dem Dateimanager | **erfüllt:** `npx tauri build --bundles deb` baut `hpro-reader_0.1.0_amd64.deb` (Release-Profil, LTO). Dessen Inhalt wird in ein privates XDG-Verzeichnis installiert und registriert (`update-mime-database`, `update-desktop-database`); `gio` meldet `application/vnd.hpro+zip` mit Standardanwendung `hpro-reader.desktop`. Doppelklick in Thunar 4.20.2 auf `Beispiel aus dem Dateimanager.hpro` → Fenster „Beispiel aus dem Dateimanager.hpro – hpro Reader“, Prozess `hpro-reader` mit dem Dateipfad als Argument, Dokument dargestellt (Bild 04-3). `gio open` einer zweiten Datei → dieselbe Instanz zeigt „Kostenschätzung.hpro“, 1 Prozess | [02-release-build.txt](02-release-build.txt), [04-dateimanager.txt](04-dateimanager.txt), [bilder/04-1-thunar.png](bilder/04-1-thunar.png), [bilder/04-2-ausgewaehlt.png](bilder/04-2-ausgewaehlt.png), [bilder/04-3-reader.png](bilder/04-3-reader.png), [bilder/04-4-zweite-datei.png](bilder/04-4-zweite-datei.png) |
| 2 | Tauri-Befehle sind auf das Nötige beschränkt; das Dokument-iframe erreicht keinen Befehl (Test) | **erfüllt:** acht eigene Befehle, kein Core- oder Plugin-Befehl freigegeben (Einheitstest `capability_grants_only_the_shell_commands`; im laufenden Programm zehn nicht freigegebene Befehle abgelehnt). IPC-Test unter Linux/WebKitGTK, wo Tauri iframe und Fenster nicht unterscheidet: eine Angriffsseite mit Skript im Dokumentrahmen findet keine Tauri-Objekte, wird beim Zugriff auf Eltern- und Hauptfenster gesperrt, alle Abrufe der IPC-Adressen scheitern, 15 gefälschte Nachrichten an den WebKit-Handler verwirft Tauri; der Zählerbefehl zählt nur die 2 Aufrufe des Reader-Fensters. 23 von 23 Prüfungen `ok` | [01-cargo-test.txt](01-cargo-test.txt), [03-ipc-isolation.txt](03-ipc-isolation.txt), [bilder/03-ipc-angriffsseite.png](bilder/03-ipc-angriffsseite.png) |
| 3 | Paketgröße gemessen und in docs/ dokumentiert | **erfüllt:** Debian-Paket 2,22 MiB, installiert 4 909 KiB, Programmdatei 4,77 MiB (Web-Kern 0,85 MiB eingebettet), Sidecar-Starter 864 Bytes; Abhängigkeiten WebKitGTK/GTK aus Debian 13 rund 33 MiB Download; lokale Dienste getrennt, rund 3,3 GiB | [07-groessen.txt](07-groessen.txt), [docs/14, Abschnitt 7](../../14-desktop-huelle.md#7-paketgröße) |

Zusätzlich zum Paketziel (nicht Abnahmekriterium, aber Teil von „Ziel des Pakets“):

- **Signatur über Systemschlüssel:** SoftHSM-Token mit RSA 3072 und ECDSA P-256. Die Hülle signiert
  über die Oberfläche des Readers, nach der nativen Rückfrage „Signieren“; Speichern über den
  nativen Dialog. Kern und EU DSS 6.5 (`validate-ts`, beide Anker): `TOTAL_PASSED` für beide
  Signaturen; epubcheck 0 Fehler, 0 Warnungen; nach Änderung des Inhalts Kern und DSS
  `TOTAL_FAILED / HASH_FAILURE` ([05-signatur-sidecar.txt](05-signatur-sidecar.txt),
  [06-gegenpruefung.txt](06-gegenpruefung.txt), [bilder/05-dialog-1.png](bilder/05-dialog-1.png)).
  DSS warnt bei jedem hpro-Container „The mimetype file content does not correspond to the expected
  value(s)“: DSS erwartet den ASiC-MIME-Typ, hpro schreibt `application/epub+zip`; bekannt seit P2.
- **Sidecar:** PDF-Export über `hpro-dienst` aus dem Reader; veraPDF 1.30.3 urteilt unabhängig
  `PASS` für PDF/A-2a und PDF/UA-1 ([06-gegenpruefung.txt](06-gegenpruefung.txt)).
- **Repository-Tests:** `npm ci` und `npm test` ([08-npm-test.txt](08-npm-test.txt)). Der erste Lauf scheiterte an einem
  Zeittest aus P19 (10 000 Formelzellen, 6,5 s gegen 5 s), während ein fremder Prozess den Rechner auslastete (Load 13 bis 15);
  die Wiederholung bei geringerer Last: `[exit 0]`, alle Tests bestanden. Darin
  `app/test/desktop.test.ts` (Brücke: Erkennung, Header-Kodierung, PDF-Antwort, Signatur mit
  Prüfung durch den Kern).

## Dateien

| Datei | Inhalt |
|---|---|
| [00-werkzeuge.txt](00-werkzeuge.txt) | Versionen von Rust, Tauri, Crates, WebKitGTK/GTK, Node, Java |
| [01-cargo-test.txt](01-cargo-test.txt) | 6 Einheitstests der Hülle (Capability = Befehlsliste, Dateinamen, Startargumente, Kennungen statt Pfaden, Konformitätsliste, Schlüsselkennungen) |
| [02-release-build.txt](02-release-build.txt) | Release-Build `tauri build --bundles deb`, Dauer, Ausgabe ohne Kompilierzeilen |
| [03-ipc-isolation.txt](03-ipc-isolation.txt) | IPC-Test mit Aufzeichnung jedes angenommenen Befehls und stderr der Hülle |
| [04-dateimanager.txt](04-dateimanager.txt) | Registrierung (Desktop-Eintrag, MIME, Standardanwendung), Fenster und Prozesse nach Doppelklick und nach zweiter Datei |
| [05-signatur-sidecar.txt](05-signatur-sidecar.txt) | Signieren mit zwei Token-Schlüsseln und PDF über den Sidecar; bestätigte Dialoge, Token-Inhalt, Aufzeichnung |
| [06-gegenpruefung.txt](06-gegenpruefung.txt) | Kern, DSS, epubcheck je signiertem Container; Manipulation; veraPDF |
| [07-groessen.txt](07-groessen.txt) | Paketgrößen, Paketinhalt, Abhängigkeiten, Größe der lokalen Dienste |
| [08-npm-test.txt](08-npm-test.txt) | `npm ci` und `npm test` des ganzen Repos |
| [bilder/](bilder/) | Bildschirmfotos (Xvfb) |
| [container/](container/) | die in der Hülle signierten Container, das PDF, die Testzertifikate (nur öffentlich; die privaten Schlüssel liegen nur im Token unter `huelle/.tmp`) |

## Nicht geprüft

Windows- und macOS-Build, IPC-Isolation dort, AppImage, echte Chipkarte, Wayland und andere
Dateimanager, Orca unter WebKitGTK – Gründe in [docs/14, Abschnitt 9](../../14-desktop-huelle.md#9-grenzen-und-nicht-geprüft).
