# Belege P12 – Spike Mobil-Hüllen (Tauri 2 auf Android und iOS)

Stand: 14.10.2026. Auswertung: [docs/15](../../15-mobil-huelle.md).

Prüfumgebung: Linux-Container (Intel N100, 4 Kerne, bis 14.10. früh auf 800 MHz gedrosselt, cgroup `memory.max`
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
| [`k2-dateimanager/`](k2-dateimanager/) | 2 | Files-App (DocumentsUI) tippt „Beispiel Bericht.hpro“ an, der Reader zeigt das Dokument (`ergebnis.txt`, `2-nach-tippen.png`, `record.jsonl`); erster Versuch mit zu kurzer Wartezeit (`versuch-1-30s/`); Mail-Prüfung (`mail-pruefung.txt`, nicht geprüft) |
| [`lauf-kriterien-3-4-14-10.txt`](lauf-kriterien-3-4-14-10.txt) | 3, 4 | wörtliche Ausgabe des E2E-Laufs `talkback read` vom 14.10.2026 09:22–10:28 |
| [`k3-read/`](k3-read/) | 3 | 8 MiB über `read_document` (`record.jsonl`, `lauf.txt`), ANR-Prüfung über Drop-Box und `/data/anr` (`dropbox-anr.txt`, `anr-dateien.txt`; `anr.txt` zeigt den ungültigen Befehl der alten Skriptfassung) |
| [`k4-talkback/`](k4-talkback/) | 4 | TalkBack-Lauf 14.10.2026 15:02–15:22 (`talkback-android.sh`): Ausgabe (`lauf.txt`), Auswertung (`auswertung.txt`: 38 Äußerungen in 40 Gesten, 18 Bedienelemente, 12 von 97 Dokumentblöcken aus dem Sandbox-Rahmen; Baum 97/97 und 26/26), TalkBack-Zeilen (`sprache.txt`), logcat-Strom, Bildschirmfotos mit Fokusrahmen; `lauf-13-50-mit-uiautomator/`: früherer Lauf, der nach `uiautomator dump` beim ersten Element hängen blieb, mit Gegenprobe Einstellungen |
| [`k4-talkback-probe/`](k4-talkback-probe/) | 4 | Handprobe 13:17–13:50, die zur Messmethode führte: `input`-Ereignisse umgehen TalkBack, logd hält nur 8 KiB, Konsolen-Wischen wird erkannt, Erkundung findet keinen Knoten (`probe.txt`, logcat-Strom, Kontrollbild mit Fokusrahmen) |
| [`k4-talkback-ursache/`](k4-talkback-ursache/) | 4 | Ursachenprobe 14:48–15:01 (`talkback-ursache.sh`): Reader unverändert, ohne Sprunglink, schlichtes HTML, Seite über DevTools geändert; schon der unveränderte Reader wird gelesen (`ergebnis.txt`, Bildschirmfotos, logcat-Strom) |
| [`k3-print/`](k3-print/) | 3 | Drucken über das Kotlin-Plugin: `record.jsonl` (13 Seiten A4), `dumpsys print`, Druckdialog, logcat-Auszug ohne ANR des Readers |
| [`k5-store/`](k5-store/) | 5 | Store-Build: wörtliche Ausgaben `store-build.sh` (`lauf.txt`, `build-*-ende.txt`), Prüfsummen der vier AABs (`sha256.txt`, Läufe 3 und 4 bytegleich), Vergleiche (`lauf2-vergleich-mit-1.txt`, `lauf3-4-gleiche-web-eingaben.txt`), Ursache der Abweichung (`lauf1-2-abweichung-so.txt`, `web-build-zweimal.txt`), Prüfung von Signatur und Bundle (`pruefung-aab-*.txt`), Speicherverlauf, OOM- und Metaspace-Abbrüche |
| [`npm-test-14-10.txt`](npm-test-14-10.txt) | – | `npm test` nach den Änderungen dieses Laufs: 611 + 55 Tests bestanden, 0 fehlgeschlagen |
| [`ios/ios-pruefung.txt`](ios/ios-pruefung.txt) | alle (iOS) | kein `xcodebuild`/`xcrun`/`swift`, Tauri-CLI unter Linux ohne `ios` |
| [`umgebung/`](umgebung/) | – | Störungen der Prüfumgebung: Renderer-Absturz der WebView 124, Abbruch der Tauri-App beim Start (wry `main_pipe.rs:398`) mit WebView 124, Kaltstart-Abbruch vom 14.10.2026 |
