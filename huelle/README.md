# hpro Reader – Desktop-Hülle (Tauri 2, Paket P11)

Dieselbe Web-App wie [`app/`](../app/README.md), in einer Tauri-2-Hülle für Windows, macOS und Linux.
Die Hülle ergänzt nur, was ein Browser nicht überall kann: Dateizuordnung `.hpro`, Öffnen und
Speichern über native Dialoge, die lokalen Dienste als Sidecar und Signieren mit einem Schlüssel des
Systems (PKCS#11). Beschreibung, Sicherheitsmodell, Messwerte und Grenzen:
[`docs/14-desktop-huelle.md`](../docs/14-desktop-huelle.md) · Belege: [`docs/belege/P11/`](../docs/belege/P11/README.md)

## Befehle

```sh
huelle/scripts/sysroot.sh            # einmalig: Rust (rustup) und Debian-Pakete (WebKitGTK, GTK, Testwerkzeuge) nach huelle/.werkzeug
. huelle/scripts/umgebung.sh         # Pfade setzen (Rust, pkg-config); hpro_laufzeit: Bibliotheken zum Starten auf diesem Rechner
(cd huelle && npm install && npx tauri build --bundles deb)   # Release-Build: baut app/ als Desktop-Variante nach huelle/dist-web
(cd huelle/src-tauri && cargo test --release --features tauri/custom-protocol)
huelle/scripts/e2e-ipc.sh            # Dokumentrahmen erreicht keinen Befehl (Abnahme 2)
huelle/scripts/dateimanager.sh       # Thunar öffnet einen Container mit dem Release-Build (Abnahme 1)
huelle/scripts/e2e-signatur.sh       # Signieren mit PKCS#11 (SoftHSM) und PDF über den Sidecar
huelle/scripts/groessen.sh           # Paketgrößen (Abnahme 3)
scripts/belege-p11.sh                # alle Belege nach docs/belege/P11
```

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src-tauri/build.rs` | Liste aller Befehle (App-Manifest); Tauri erzeugt daraus je Befehl eine Berechtigung |
| `src-tauri/capabilities/main.json` | gewährt genau diese acht Befehle dem Fenster `main`, nichts aus Core oder Plugins |
| `src-tauri/src/lib.rs` | Befehle: `take_launch_files`, `open_dialog`, `read_document`, `save_as`, `pdf_export`, `services_status`, `system_keys`, `system_sign`; Einzelinstanz |
| `src-tauri/src/files.rs` | Dateien nur über Kennungen; Startargumente und `file://`-URIs; atomisches Schreiben |
| `src-tauri/src/dienst.rs` | Sidecar `hpro-dienst`: ein Aufruf je Auftrag, Zeitlimit, kein Server |
| `src-tauri/src/pkcs11.rs` | Zertifikate der Token, Signatur von `SignedInfo` (RSA PKCS#1 v1.5, ECDSA P-256/P-384) |
| `src-tauri/src/e2e.rs` | nur mit `--features e2e`: Canary-Befehl, Aufzeichnung, Testtreiber |
| `src-tauri/binaries/hpro-dienst-*` | Starter für den installierten hpro-Dienst (`dienst/`, P9) |
| `src-tauri/linux/hpro-mime.xml` | MIME-Typ `application/vnd.hpro+zip` für `*.hpro` (shared-mime-info) |
| `e2e/ipc-probe.js`, `e2e/signatur.js` | Testtreiber im Hauptfenster |
| `../app/src/desktop.ts` | einzige Stelle der Web-App, die mit der Hülle spricht; `Pkcs11Signer` für den Kern |
