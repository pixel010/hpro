# Belege P12 – Spike Mobil-Hüllen (Tauri 2 auf Android und iOS)

Stand: 14.10.2026. Auswertung: [docs/15](../../15-mobil-huelle.md).

Prüfumgebung: Linux-Container (Intel N100, 4 Kerne, auf 800 MHz gedrosselt, cgroup `memory.max`
2,5 GiB), **kein `/dev/kvm`, kein Mac**. Android-Emulator 37.2.12 mit Systemabbild
`android-35;google_apis;x86_64` (Android 15), Software-Emulation (QEMU TCG), 1 GiB Gast-RAM,
Android System WebView 158.0.8104.0.

Die Belege entstehen mit den Skripten unter [`mobil/scripts/`](../../../mobil/scripts/); was in
`mobil/.tmp` liegt, kopiert [`belege-p12.sh`](../../../mobil/scripts/belege-p12.sh) hierher
(logcat nur als gefilterter Auszug, AABs nur als Prüfsummen).

| Verzeichnis / Datei | Kriterium | Inhalt |
|---|---|---|
| [`k1-ipc-tauri/`](k1-ipc-tauri/) | 1 | Ausgabe von `e2e-android.sh ipc` mit Auswertung (`lauf.txt`), alle angenommenen Befehle (`record.jsonl`), logcat-Auszug, Bildschirmfoto. Ergebnis: **nein** |
| [`k1-ipc-capacitor/`](k1-ipc-capacitor/) | 1 | dieselbe Angriffsseite gegen Capacitor 8 (`e2e-capacitor.sh`). Ergebnis: kein Befehl aus dem Rahmen |
| [`lauf-kriterien-2-3.txt`](lauf-kriterien-2-3.txt) | 2, 3 | wörtliche Ausgabe des E2E-Laufs `launch print` vom 13.10.2026 23:09–00:31 (Intents, Start, Druck; Ende: Emulator weg) |
| [`k2-launch/`](k2-launch/) | 2 | Intent-Auflösung (`intents.txt`), Kaltstart/onNewIntent/SEND (`start*.txt`, `record.jsonl`, `nach-senden.png`), Dateimanager-Versuch (`dateimanager/`, verdeckt vom ANR-Dialog der System UI) |
| [`k3-print/`](k3-print/) | 3 | Drucken über das Kotlin-Plugin: `record.jsonl` (13 Seiten A4), `dumpsys print`, Druckdialog, logcat-Auszug ohne ANR des Readers |
| [`k5-store/`](k5-store/) | 5 | Store-Build: wörtliche Ausgabe `store-build.sh` (`lauf.txt`), Prüfsummen, Enden der Build-Protokolle, erster Versuch mit OOM-Abbruch |
| [`ios/ios-pruefung.txt`](ios/ios-pruefung.txt) | alle (iOS) | kein `xcodebuild`/`xcrun`/`swift`, Tauri-CLI unter Linux ohne `ios` |
| [`umgebung/`](umgebung/) | – | Störungen der Prüfumgebung: Renderer-Absturz der WebView 124, Abbruch der Tauri-App beim Start (wry `main_pipe.rs:398`) mit WebView 124, Kaltstart-Abbruch vom 14.10.2026 |
