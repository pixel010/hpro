# mobil – Spike Mobil-Hüllen (P12)

Spike nach docs/06, Abschnitt 4.4: Tauri 2 auf Android (und iOS) gegen fünf Abbruchkriterien,
Capacitor als Vergleich. Ergebnis und Einordnung: [docs/15](../docs/15-mobil-huelle.md),
Belege: [docs/belege/P12](../docs/belege/P12/README.md).

```
mobil/
├── src-tauri/                  Tauri-2-App „hpro-reader“ für Android (Web-Kern = huelle/dist-web)
│   ├── src/lib.rs              fünf Befehle, Namen wie in der Desktop-Hülle (take_launch_files, open_dialog,
│   │                           read_document, save_as) plus print_html; alle async
│   ├── src/e2e.rs              nur mit --features e2e: Zähler, Aufzeichnung, Treiber
│   ├── capabilities/main.json  gewährt die fünf Befehle nur dem Hauptfenster
│   └── gen/android/            Android-Projekt (von `tauri android init`, angepasst: SDK 36,
│                               Gradle-Speicher, Upload-Signatur aus keystore.properties)
├── tauri-plugin-hpro-mobil/    eigenes Plugin: Kotlin-Teil (android/src/main/java/HproPlugin.kt) für
│                               Start-Intents, Storage Access Framework und Druck über PrintManager
├── capacitor/                  Vergleichshülle Capacitor 8 mit demselben Web-Kern (nur Kriterium 1)
├── e2e/                        Testtreiber (Angriffsseite im Dokumentrahmen, Start, Lesen, Drucken)
└── scripts/                    Umgebung, SDK, Emulator, Tests, Store-Build
```

Bauen und prüfen (alles im Repository, nichts außerhalb):

```sh
mobil/scripts/android-sdk.sh          # Android-SDK, NDK, Emulator, Systemabbild, Rust-Ziele
(cd mobil && npm install)             # Tauri-CLI
mobil/scripts/e2e-android.sh          # Kriterien 1–3 im Emulator (ipc, launch, read, print)
mobil/scripts/e2e-capacitor.sh        # Kriterium 1 für Capacitor
mobil/scripts/store-build.sh          # Kriterium 5: signiertes AAB zweimal, Vergleich
```

Auf dem Prüfrechner gibt es weder `/dev/kvm` noch einen Mac: Der Emulator läuft ohne
Beschleunigung auf einem Kern, und der Container hat insgesamt 2,5 GiB Speicher (daher 1 GiB
Gast-RAM, `-lowram`, kleiner Bildschirm). iOS lässt sich hier weder bauen noch starten.
