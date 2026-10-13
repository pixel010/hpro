# Belege P12 – Spike Mobil-Hüllen (Tauri 2 auf Android und iOS)

Stand: 13.10.2026 (Zwischenstand, wird mit jedem Lauf ergänzt). Auswertung: [docs/15](../../15-mobil-huelle.md).

Prüfumgebung: Linux-Container (Intel N100, 4 Kerne, cgroup `memory.max` 2,5 GiB), **kein
`/dev/kvm`, kein Mac**. Android-Emulator 37.2.12 mit Systemabbild `android-35;google_apis;x86_64`
(Android 15), Software-Emulation (QEMU TCG), 1 GiB Gast-RAM.

| Verzeichnis | Inhalt |
|---|---|
| [`k1-ipc-tauri/`](k1-ipc-tauri/) | Kriterium 1, Tauri: Ausgabe von `mobil/scripts/e2e-android.sh ipc` mit Auswertung (`lauf.txt`), Aufzeichnung aller angenommenen Befehle (`record.jsonl`), logcat-Auszug |
| [`umgebung/`](umgebung/) | Störungen der Prüfumgebung: Renderer-Absturz der vorinstallierten WebView 124 (jede Seite, auch die System-App HTMLViewer), Abbruch der Tauri-App beim Start (wry `main_pipe.rs:398`) |
