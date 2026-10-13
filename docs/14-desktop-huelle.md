# 14 – Desktop-Hülle (Tauri 2)

**Projekt:** hpro · **Paket:** P11 · **Stand:** 13.10.2026
**Belege:** [`docs/belege/P11/`](belege/P11/README.md) · **Code:** [`huelle/`](../huelle/README.md)
(Rust: [`huelle/src-tauri/src/`](../huelle/src-tauri/src/lib.rs)), Brücke in der Web-App
[`app/src/desktop.ts`](../app/src/desktop.ts), Unit-Test der Brücke
[`app/test/desktop.test.ts`](../app/test/desktop.test.ts)

---

## 1. Ergebnis in fünf Sätzen

1. **Derselbe Kern:** Die Desktop-App ist die Reader-Web-App aus [`app/`](../app/) in einer
   Tauri-2-Hülle (Tauri 2.12.3, WebKitGTK 2.52 unter Linux). Der Desktop-Build unterscheidet sich vom
   PWA-Build nur in einer CSP-Zeile (`connect-src` für den Tauri-IPC) und ohne Quellkarten; die Hülle
   ergänzt Dateizuordnung, native Dialoge zum Öffnen und Speichern, den lokalen Dienst als Sidecar
   und das Signieren mit einem Schlüssel des Systems (PKCS#11).
2. **Release-Build für Linux läuft:** Das Debian-Paket `hpro-reader_0.1.0_amd64.deb` (2,22 MiB)
   registriert den MIME-Typ `application/vnd.hpro+zip` für `*.hpro`; ein Doppelklick in Thunar öffnet
   den Container im Reader, eine zweite Datei geht an die laufende Instanz.
3. **Acht Befehle, nur für das Reader-Fenster:** Die Hülle bietet genau acht eigene Befehle und gibt
   dem Fenster keinen Befehl aus Tauri-Core oder Plugins. Dateipfade gehen nie über die Brücke; die
   Web-Seite sieht nur Kennungen von Dateien, die der Nutzer selbst gewählt hat.
4. **Das Dokument erreicht keinen Befehl:** Unter Linux kann Tauri Anfragen aus einem iframe nicht von
   denen des Fensters unterscheiden (docs/06, A7). Gemessen: Eine Angriffsseite mit Skript im
   Dokumentrahmen sieht keine Tauri-Objekte, kommt an das Fenster nicht heran, ihre 15 gefälschten
   Nachrichten an den WebKit-Handler verwirft Tauri (falscher Aufrufschlüssel), alle Abrufe der
   IPC-Adressen scheitern; der Zählerbefehl bleibt bei den zwei Aufrufen des Reader-Fensters.
5. **Signieren und PDF:** Mit zwei Schlüsseln auf einem PKCS#11-Token (SoftHSM als Ersatz für Chipkarte
   oder Systemspeicher; RSA 3072 und ECDSA P-256) signiert die Hülle über die normale Oberfläche, nach
   einer nativen Rückfrage; Kern und EU DSS 6.5 urteilen `TOTAL_PASSED`, nach Manipulation
   `TOTAL_FAILED`. Der PDF-Export läuft über den Sidecar `hpro-dienst` (WeasyPrint, veraPDF, P9).
   Windows und macOS sind konfiguriert, aber **nicht gebaut und nicht geprüft** (Abschnitt 9).

## 2. Aufbau

```
huelle/
├── package.json                 @tauri-apps/cli; build:web = Desktop-Build von app/ nach dist-web/
├── scripts/                     Werkzeuge, Build-Umgebung und Prüfskripte (Abschnitt 8)
├── e2e/                         Testtreiber, laufen nur im Test-Build im Hauptfenster
└── src-tauri/
    ├── tauri.conf.json          Fenster, Dateizuordnung, Sidecar, Paket (deb, AppImage)
    ├── build.rs                 Befehlsliste (App-Manifest) → je Befehl eine Berechtigung
    ├── capabilities/main.json   gewährt die acht Befehle dem Fenster „main“
    ├── binaries/hpro-dienst-*   Starter des lokalen Dienstes (Sidecar)
    ├── linux/                   MIME-Typ (shared-mime-info) und Desktop-Eintrag mit %F
    └── src/
        ├── lib.rs               Befehle, Einzelinstanz, Start
        ├── files.rs             Dateikennungen, Startargumente, atomisches Schreiben
        ├── dienst.rs            Sidecar: ein Aufruf je Auftrag, Zeitlimit
        ├── pkcs11.rs            Zertifikate der Token, Signatur von SignedInfo
        └── e2e.rs               nur mit --features e2e (Testbefehle, Aufzeichnung)
```

Die Web-App erkennt die Hülle an `window.__TAURI_INTERNALS__` im obersten Fenster
([`desktop()`](../app/src/desktop.ts)); fehlt es, bleiben Dateiauswahl, Download und Service Worker
wie im Browser. Mit Hülle ersetzt der Reader die Dateiauswahl durch den nativen Dialog, Speichern und
jeder Export (Bearbeiten, Tabellen, Anmerkungen, Barrierefreiheitsbericht) gehen über `save_as`, und
die Knöpfe „Signieren“ und „PDF“ werden sichtbar.

## 3. Befehle und Sicherheitsmodell

### 3.1 Die acht Befehle

| Befehl | Zweck | Eingabe von der Web-Seite | Schutz im Rust-Teil |
|---|---|---|---|
| `take_launch_files` | Dateien aus Dateimanager, Kommandozeile oder zweiter Instanz | – | nur existierende Dateien aus den Startargumenten |
| `open_dialog` | nativer Öffnen-Dialog | – | der Nutzer wählt; Ergebnis ist eine Kennung |
| `read_document` | Bytes einer geöffneten Datei | Kennung | nur Kennungen aus Start oder Dialog; Grenze 256 MiB |
| `save_as` | Speichern unter | Bytes, Namensvorschlag, Kennung des Nachbardokuments | immer mit nativem Dialog; vom Vorschlag bleibt nur der Dateiname; atomisch (temporäre Datei + Umbenennen) |
| `pdf_export` | PDF über den Sidecar | Container-Bytes, Konformitätsstufe | Stufe gegen feste Liste geprüft; temporäres Verzeichnis, nach dem Aufruf gelöscht; Zeitlimit 600 s |
| `services_status` | welche lokalen Dienste es gibt | – | Zeitlimit 120 s |
| `system_keys` | Zertifikate der PKCS#11-Token | – | nur öffentliche Objekte, keine Anmeldung |
| `system_sign` | Signatur des kanonischen `SignedInfo` | Daten, Schlüsselkennung, Algorithmus, PIN, Beschreibung | native Rückfrage nennt Schlüssel und Dokument; Algorithmen RSA PKCS#1 v1.5 SHA-256, ECDSA P-256/P-384; der private Schlüssel verlässt das Token nicht |

Es gibt **keinen** Befehl, der einen Pfad annimmt, ohne Dialog schreibt, Programme startet oder das
Netz benutzt. Das Plugin `dialog` wird nur aus Rust benutzt; seine JavaScript-Befehle sind nicht
freigegeben, ebenso keiner aus `core:` (Fenster, Ereignisse, Webview, App). Der Einheitstest
`capability_grants_only_the_shell_commands` prüft, dass `capabilities/main.json` genau die Liste aus
`build.rs` gewährt, nichts mit `:` (Plugin oder Core) und keine entfernte Herkunft (`remote`).

### 3.2 Der Dokumentrahmen

Dokumente laufen wie in der PWA im Dokumentrahmen unter `frame.html`: `sandbox` ohne
`allow-same-origin`, also opake Herkunft, eigene CSP mit `connect-src 'none'` (P4, P15). Unter
Windows und macOS unterscheidet Tauri Anfragen aus iframes; unter Linux (WebKitGTK) nicht (docs/06,
A7 und Abschnitt 3.3). Diese offene Frage aus docs/06 ist für Linux jetzt **gemessen**
([`huelle/scripts/e2e-ipc.sh`](../huelle/scripts/e2e-ipc.sh),
Beleg [03-ipc-isolation.txt](belege/P11/03-ipc-isolation.txt)):

Der Test baut die Hülle mit `--features e2e`. Dieser Build hat drei Zusatzbefehle (`e2e_canary`
zählt seine Aufrufe, `e2e_report`, `e2e_exit`) und zeichnet jeden angenommenen Befehl auf. Ein
Treiber im Hauptfenster ruft den Zähler einmal auf (Positivkontrolle), probiert zehn nicht
freigegebene Befehle (alle abgelehnt), wartet, bis das per Startargument übergebene Dokument
dargestellt ist, und lädt dann eine **Angriffsseite** in den Dokumentrahmen: gleicher Rahmen, gleiche
Sandbox, aber mit erlaubtem Inline-Skript (ein echtes Dokument darf das nicht). Sie versucht:

| Weg | Ergebnis |
|---|---|
| `window.__TAURI_INTERNALS__`, `window.__TAURI__`, `window.ipc` im Rahmen | `undefined` – Tauri injiziert seine Skripte nur ins oberste Dokument |
| `parent`/`top.__TAURI_INTERNALS__`, `top.document`, verschachteltes `tauri://localhost/index.html` | `SecurityError` (opake Herkunft) |
| `window.webkit.messageHandlers.ipc.postMessage(…)` mit 3 geratenen Schlüsseln × 5 Befehlen | Handler ist erreichbar (`object`), aber Tauri verwirft alle 15 Nachrichten: „`__TAURI_INVOKE_KEY__` expected“ (der Schlüssel steht nur in der Closure des Hauptfensters) |
| `fetch`/`XMLHttpRequest` auf `ipc://localhost/…`, `http://ipc.localhost/…`, `tauri://localhost/…`, `https://example.org/` | `TypeError`/Fehler (CSP des Rahmens) |
| `window.open`, `top.location = …` | `null` bzw. `SecurityError`; das Hauptfenster bleibt auf `tauri://localhost` |

Danach ruft der Treiber den Zähler ein zweites Mal auf: Aufzeichnung `1 shell`, `2 shell-after`, kein
Aufruf aus dem Rahmen. Angenommen wurden nur `take_launch_files`, `read_document` und die drei
Testbefehle des Treibers.

**Einordnung.** Die Abwehr unter Linux ruht auf drei Schichten: (1) opake Herkunft und CSP des
Rahmens, (2) Tauri injiziert die Brücke nicht in Unterrahmen, (3) der Aufrufschlüssel. Der
WebKit-Nachrichtenkanal selbst ist aus dem Rahmen erreichbar; fiele (3) weg, gälte docs/06 A7
wieder. Deshalb bleiben die gefährlichen Befehle zusätzlich an native Dialoge gebunden: Schreiben nur
über „Speichern unter“, Signieren nur nach „Signieren?“, beides außerhalb der Webview.

### 3.3 Weitere Härtung

- `withGlobalTauri: false`; `dragDropEnabled: false` (Ablegen bleibt das HTML-Ereignis der Web-App,
  keine Pfade).
- `freezePrototype: false`: Tauris Einfrieren von `Object.prototype` bricht die XML-Bibliothek des
  Kerns (xmldom); die Brücke wird nur über die gekapselte Klasse `DesktopShell` benutzt.
- Die Seiten-CSP setzt die Web-App selbst (Meta-Element des Desktop-Builds, `connect-src 'self' ipc:
  http://ipc.localhost`), `tauri.conf.json` setzt keine zweite.
- Einzelinstanz (`tauri-plugin-single-instance`): eine zweite Datei startet keinen zweiten Prozess.
- Release-Profil: LTO, `opt-level = "s"`, `panic = "abort"`, Symbole entfernt. Der Test-Build
  (`--features e2e`) liegt in einem eigenen Zielverzeichnis; seine Befehle und die Aufzeichnung
  existieren im Release-Build nicht (`build.rs` registriert sie nur mit der Funktion).

## 4. Dateizuordnung, Öffnen und Speichern

- `tauri.conf.json` → `fileAssociations`: Endung `hpro`, MIME-Typ `application/vnd.hpro+zip`, Rolle
  Editor. Für Linux liefert das Paket zusätzlich die shared-mime-info-Datei
  [`hpro-mime.xml`](../huelle/src-tauri/linux/hpro-mime.xml) (Unterklasse von `application/zip`,
  Glob `*.hpro`) und einen eigenen Desktop-Eintrag mit `Exec=hpro-reader %F`; die Vorlage von Tauri
  nimmt keine Dateien entgegen.
- Startargumente: Pfade (relativ zum Arbeitsverzeichnis) und `file://`-URIs; Optionen und
  Nicht-Dateien werden ignoriert (Einheitstest `launch_paths_accepts_paths_and_file_uris_only`).
- Speichern schreibt eine temporäre Datei neben das Ziel und benennt sie um; der Dialog schlägt den
  Ordner des geöffneten Dokuments vor. Eine signierte Fassung entsteht immer als neue Datei
  (`…-signiert.hpro`), das Original bleibt unverändert.

**Beleg Dateimanager** ([`huelle/scripts/dateimanager.sh`](../huelle/scripts/dateimanager.sh),
[04-dateimanager.txt](belege/P11/04-dateimanager.txt), Bildschirmfotos unter
[bilder/](belege/P11/bilder/)): Der Inhalt des gebauten `.deb` wird in ein privates XDG-Verzeichnis
entpackt und so registriert, wie es die Paketauslöser tun (`update-mime-database`,
`update-desktop-database`). `gio` meldet für die Datei `application/vnd.hpro+zip` und als
Standardanwendung `hpro-reader.desktop`. Thunar 4.20 zeigt den Ordner unter Xvfb, `xdotool` wählt die
Datei und doppelklickt. Ergebnis: Fenster „Beispiel aus dem Dateimanager.hpro – hpro Reader“ mit dem
dargestellten Projektbericht. `gio open` mit einer zweiten Datei ändert den Titel auf
„Kostenschätzung.hpro – hpro Reader“, es läuft weiter genau ein `hpro-reader`-Prozess.

## 5. Sidecar für die lokalen Dienste

`hpro-dienst` steht im Paket neben dem Programm (`externalBin`) und ist ein Starter
([Quelle](../huelle/src-tauri/binaries/hpro-dienst-x86_64-unknown-linux-gnu)) für den lokalen
hpro-Dienst aus P9 (WeasyPrint, veraPDF, Docling, Tesseract; docs/11). Je Auftrag ein Aufruf über die
Kommandozeile des Dienstes, Ein- und Ausgabe über ein temporäres Verzeichnis, Abbruch nach dem
Zeitlimit; **kein Server, kein Port**, nach dem Auftrag läuft nichts weiter. Der Dienst selbst ist
groß (Abschnitt 7) und wird getrennt installiert; der Starter sucht ihn unter `$HPRO_DIENST_HOME`,
`~/.local/share/hpro/dienst` und `/opt/hpro/dienst`. Fehlt er, meldet `pdf_export` den Grund, alles
andere arbeitet weiter (Druck über die Engine bleibt, docs/10 Zusage 6).

Beleg: Der PDF-Knopf des Readers exportiert den signierten Bericht über den Sidecar; veraPDF 1.30.3
prüft die Datei unabhängig vom Dienstbericht ([06-gegenpruefung.txt](belege/P11/06-gegenpruefung.txt)).

## 6. Signatur über Systemschlüssel

`Pkcs11Signer` ([`app/src/desktop.ts`](../app/src/desktop.ts)) implementiert die Signer-Schnittstelle
des Kerns (docs/06, 4.1). Der Kern baut die XAdES-Signatur wie bei Software- und Fernsignatur (P3,
P10); die Hülle signiert nur das kanonische `SignedInfo` mit dem Schlüssel auf dem Token
([`pkcs11.rs`](../huelle/src-tauri/src/pkcs11.rs), Crate `cryptoki` 0.12). Modul:
`HPRO_PKCS11_MODULE` oder das erste gefundene aus p11-kit-proxy (System-Modulliste) und OpenSC.
Vor jeder Signatur fragt die Hülle in einem nativen Dialog („Mit dem Schlüssel „…“ signieren?“ und
Dokumenttitel); ohne Bestätigung keine Signatur.

Beleg ([`huelle/scripts/e2e-signatur.sh`](../huelle/scripts/e2e-signatur.sh),
[05-signatur-sidecar.txt](belege/P11/05-signatur-sidecar.txt),
[06-gegenpruefung.txt](belege/P11/06-gegenpruefung.txt)): SoftHSM 2 mit einem RSA-3072- und einem
ECDSA-P-256-Schlüssel samt Zertifikat. Der Treiber bedient nur die Oberfläche (Knopf, Schlüsselauswahl,
PIN); die nativen Dialoge „Signieren“ und „Speichern unter“ sind echt und werden von außen mit
`xdotool` bestätigt. Ergebnis: zwei Container (einfach signiert mit RSA, dann zusätzlich mit EC) und
ein PDF. Gegenprüfung außerhalb der Hülle: Kern `hpro validate`, EU DSS 6.5 und epubcheck 5.4.0;
nach Änderung eines Bytes im Inhalt lehnen Kern und DSS ab.

## 7. Paketgröße

Gemessen mit [`huelle/scripts/groessen.sh`](../huelle/scripts/groessen.sh)
([07-groessen.txt](belege/P11/07-groessen.txt)), Linux x86_64, Release-Build:

| Teil | Größe |
|---|---:|
| Debian-Paket `hpro-reader_0.1.0_amd64.deb` (Download) | **2,22 MiB** (2 327 752 Bytes) |
| installiert laut Paket (`Installed-Size`) | 4 909 KiB |
| davon Programmdatei `hpro-reader` (Web-Kern eingebettet) | 4,77 MiB |
| davon Web-Kern `dist-web/` (ohne Quellkarten, inkl. 9 Beispieldokumente 0,13 MiB) | 0,85 MiB |
| Sidecar-Starter `hpro-dienst` | 864 Bytes |
| zum Vergleich: PWA-Build `app/dist/` (mit Quellkarten) | 3,19 MiB |

Das Paket hängt von `libwebkit2gtk-4.1-0` und `libgtk-3-0` ab. Auf einem GNOME- oder Xfce-Desktop sind
sie meist schon da; sonst kommen aus Debian 13 rund 33 MiB Download (136 MiB installiert) hinzu.
Die Quellkarten (2,34 MiB) bettet der Desktop-Build nicht mehr ein: Das verkleinerte das Paket von
2,79 auf 2,22 MiB. Die lokalen Dienste sind **nicht** im Paket: `dienst/.venv` und `dienst/tools`
belegen hier zusammen rund 3,3 GiB (Docling-Modelle, PyTorch, Tesseract), veraPDF und JDK weitere
377 MiB. docs/06 nannte die Sidecar-Größe „nicht gemessen“; damit ist klar, dass der Dienst ein
eigenes, optionales Paket sein muss und nicht in den Reader gehört.

Zum Vergleich mit docs/06: Die dort zitierte Sekundärquelle nennt ≈ 4 MB für eine Tauri-App unter
Linux; die hpro-Hülle liegt mit 2,22 MiB Paket und 4,77 MiB Programm in dieser Größenordnung.

## 8. Bauen und prüfen auf diesem Rechner

Der Prüfrechner hat weder root noch WebKitGTK. Deshalb:

- Rust 1.99 über rustup in `huelle/.werkzeug` (`RUSTUP_HOME`, `CARGO_HOME`), nichts außerhalb des
  Arbeitsverzeichnisses.
- Die Debian-13-Pakete für Bauen und Testen (WebKitGTK 2.52.6, GTK 3.24.49, libsoup 3.6.5, Thunar,
  xdotool, SoftHSM, ImageMagick, D-Bus) werden mit `apt-get download` geholt und nach
  `huelle/.werkzeug/sysroot` entpackt ([`sysroot.sh`](../huelle/scripts/sysroot.sh)); `umgebung.sh`
  setzt `PKG_CONFIG_PATH`, `rpath-link` und zur Laufzeit `LD_LIBRARY_PATH`.
- Nur für diesen Rechner: WebKit startet seine Hilfsprozesse aus einem einkompilierten Pfad, die
  Bibliothek im Sysroot wird darauf umgebogen; `bwrap` fehlt, deshalb läuft WebKit hier mit
  `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`. Auf einem normalen System zieht `libwebkit2gtk-4.1-0`
  `bubblewrap` als Abhängigkeit mit, das Paket selbst setzt die Variable nicht. Die gemessene
  Isolation in 3.2 hängt nicht an WebKits Prozess-Sandbox (sie ist Teil der Webview, nicht des
  Prozesses), wurde aber nur ohne sie gemessen.

Befehle und Dauer (N100, 4 Kerne, 3,4 GHz): Release-Build `npx tauri build --bundles deb` 2,5 bis 3,5 min
(davon 2 bis 3 min Rust mit LTO), Test-Build mit `--features e2e` ebenso; IPC-Test 10 s Laufzeit,
Dateimanager-Test 40 s, Signatur- und PDF-Test 90 s. Alle Belege: `scripts/belege-p11.sh`.

## 9. Grenzen und nicht geprüft

| Punkt | Stand |
|---|---|
| **Windows** (WebView2, MSI/NSIS) | **nicht geprüft:** kein Windows-Rechner, keine MSVC-Werkzeuge; Konfiguration (Dateizuordnung, Symbole) ist plattformneutral, der Sidecar-Starter ist ein Shell-Skript und braucht unter Windows eine `.exe` (`hpro-dienst-x86_64-pc-windows-msvc.exe`) |
| **macOS** (WKWebView, `.app`/`.dmg`) | **nicht geprüft:** kein Mac, kein Xcode-SDK; Signierung und Notarisierung offen; Sidecars in der App-Sandbox des Mac App Store bleiben OFFENE FRAGE (docs/06) |
| IPC-Isolation unter Windows und macOS | **nicht gemessen;** laut Tauri trennen beide Plattformen iframe-Anfragen, der Test `e2e-ipc.sh` ist darauf übertragbar |
| AppImage | konfiguriert, **nicht gebaut:** `linuxdeploy` bündelt die System-Bibliotheken, die auf diesem Rechner nur im Sysroot liegen |
| Echte Chipkarte, Windows-Zertifikatspeicher, macOS-Schlüsselbund | **nicht geprüft:** nur SoftHSM. PKCS#11 deckt Chipkarten über OpenSC/Herstellermodul ab; CNG (Windows) und Keychain (macOS) bräuchten eigene Wege. PIN-Eingabe am Kartenleser (geschützter Pfad) fehlt, die PIN geht aus dem Reader-Fenster an die Hülle |
| Wayland, GNOME Files/Dolphin | **nicht geprüft:** nur X11 (Xvfb) und Thunar; die Zuordnung läuft über freedesktop-Standards (shared-mime-info, Desktop-Eintrag) und gilt für alle, die sie befolgen |
| Barrierefreiheit unter WebKitGTK (Orca) | **nicht geprüft:** kein Bildschirmleser auf dem Rechner (docs/06, A13; P8 prüfte die Web-App) |
| Aktualisierung (Plugin `updater`) | nicht eingebaut; Debian-Paket über die Paketverwaltung |
| Installation des Dienstes | der Starter findet einen getrennt installierten Dienst; ein eigenes Paket für den Dienst fehlt |

## 10. Bezug zu den Zusagen (docs/10)

| Zusage | In der Hülle |
|---|---|
| Bildschirm zuerst | dieselbe Oberfläche wie die PWA, Fenster ab 360 px Breite |
| Lebendige Inhalte in der Sandbox | unverändert Dokumentrahmen der PWA; gemessen, dass er auch unter Linux keinen Befehl erreicht |
| Verschachtelte Information | unverändert (Web-Kern) |
| Leichtes Bearbeiten | Speichern über den nativen Dialog statt Download |
| Sperren und Signieren | zusätzlich Signatur mit Systemschlüssel; Signaturen sind dieselben XAdES-Signaturen wie im Kern, von DSS bestätigt |
| Abgeleiteter A4-Druck | Engine-Druck wie in der PWA, PDF/A und PDF/UA über den lokalen Dienst |
