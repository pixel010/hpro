# 15 – Mobil-Hüllen: Spike Tauri 2 auf Android und iOS

**Projekt:** hpro · **Paket:** P12 · **Stand:** 14.10.2026
**Belege:** [`docs/belege/P12/`](belege/P12/README.md) · **Code:** [`mobil/`](../mobil/README.md)
(Tauri-App [`mobil/src-tauri/`](../mobil/src-tauri/src/lib.rs), eigenes Kotlin-Plugin
[`mobil/tauri-plugin-hpro-mobil/`](../mobil/tauri-plugin-hpro-mobil/android/src/main/java/HproPlugin.kt),
Vergleichshülle [`mobil/capacitor/`](../mobil/capacitor/), Testtreiber [`mobil/e2e/`](../mobil/e2e/),
Skripte [`mobil/scripts/`](../mobil/scripts/))

---

## 1. Ergebnis

**Der Spike ist durchgefallen. Empfehlung: Capacitor für Android und iOS** (Abschnitt 4).

Nach [docs/06, Abschnitt 4.4](06-plattform-und-funktionsmatrix.md#44-abbruchkriterien-für-den-tauri-mobil-spike)
bleibt Tauri nur gesetzt, wenn **alle** fünf Kriterien erfüllt sind. Schon Kriterium 1 ist
gemessen **nicht** erfüllt: Unter Android erreicht ein Skript im Dokumentrahmen, der in einem
`sandbox`-iframe mit opaker Origin läuft, Tauri-Befehle des Reader-Fensters. Das widerspricht
[docs/10, Zusage 2](10-anspruch-und-funktionsprofil.md): Interaktive Teile laufen „in einer
abgeschotteten Sandbox“ und „dürfen nichts nach außen senden“. Mit Capacitor 8 erreicht derselbe
Angriff im selben Emulator und mit derselben WebView **keinen** Befehl.

| # | Abbruchkriterium (docs/06, 4.4) | Android (gemessen) | iOS | Ergebnis |
|---|---|---|---|---|
| 1 | Dokument-iframe erreicht **keinen** Tauri-Befehl | **nein**: der Rahmen löst `e2e_canary` aus | nicht geprüft (kein Mac) | **nein** |
| 2 | `.hpro` öffnet sich aus Mail und Dateimanager | Intents **ja** (VIEW, zweites Dokument, SEND); Dateimanager und Mail **nicht geprüft** | nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |
| 3 | Kotlin- und Swift-Plugin in ≤ 5 PT, ohne ANR | Kotlin-Plugin **ja** (Start, Lesen, Drucken, ohne ANR des Readers); Last mit großen Dateien nicht belegt | Swift: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |
| 4 | TalkBack und VoiceOver lesen Dokument und Oberfläche vollständig | K4_ANDROID | VoiceOver: nicht geprüft (kein Mac) | K4_ERGEBNIS |
| 5 | Store-Builds (AAB, IPA) reproduzierbar in CI | K5_ANDROID | IPA: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |

„Ergebnis“ beantwortet die Frage aus docs/06: Ist das Kriterium für Tauri **nachgewiesen** erfüllt?
Ein Kriterium, dessen iOS-Hälfte nicht prüfbar war, gilt nicht als erfüllt; ein „ja“ steht nur da,
wo es gemessen wurde. Das Gesamturteil hängt aber nicht an iOS: Kriterium 1 fällt bereits unter
Android, und es ist das einzige der fünf, das eine Zusage aus docs/10 unmittelbar bricht.

**Prüfumgebung.** Linux-Container (Intel N100, während der Läufe auf 800 MHz gedrosselt, 4 Kerne,
cgroup-Grenze 2,5 GiB), **kein `/dev/kvm`, kein Mac**. Android-Emulator 37.2.12 mit
`android-35;google_apis;x86_64` (Android 15) in reiner Software-Emulation (QEMU TCG), 1 GiB
Gast-RAM, Android System WebView 158.0.8104.0 (die vorinstallierte WebView 124 stürzt ohne KVM bei
jeder Seite ab, [Beleg](belege/P12/umgebung/webview-124-renderer-absturz.txt)). Tauri 2 mit
tauri-cli 2.12.2 und wry 0.57, Capacitor 8. Alle Zeitangaben aus dem Emulator sind deshalb um
Größenordnungen langsamer als auf einem Gerät und sagen über Gerätegeschwindigkeit nichts aus.

## 2. Die fünf Kriterien im Einzelnen

### 2.1 Kriterium 1 – Dokumentrahmen gegen die Brücke: **nein**

*Aufbau.* Der Reader (derselbe Web-Kern wie Desktop, `huelle/dist-web`) zeigt das Dokument in einem
`<iframe sandbox="allow-scripts">` mit opaker Origin. Im Test-Build legt der Treiber
([`mobil/e2e/android-probe.js`](../mobil/e2e/android-probe.js)) eine Angriffsseite in diesen Rahmen.
Sie versucht alles, was ein bösartiges Dokument versuchen würde: `__TAURI_INTERNALS__.invoke`,
`window.ipc.postMessage` mit gefälschten Nachrichten, `fetch` auf `ipc.localhost`, Zugriff auf
`parent`/`top`, Navigation, verschachtelte App-Rahmen. Ein Zählerbefehl `e2e_canary` (nur im
Test-Build) zählt jeden Aufruf mit Herkunft; Positivkontrolle ist ein Aufruf aus dem Hauptfenster
vorher und nachher.

*Messung Tauri* ([`k1-ipc-tauri/lauf.txt`](belege/P12/k1-ipc-tauri/lauf.txt),
[`record.jsonl`](belege/P12/k1-ipc-tauri/record.jsonl)): Im Rahmen sind `__TAURI_INTERNALS__`
(mit `invoke`) und `window.ipc.postMessage` vorhanden, obwohl der Rahmen `origin: null` hat und
`parent`/`top` gesperrt sind. Der Zähler verzeichnet `['1 shell', '2 frame-internals',
'3 shell-after']`: **Der Aufruf aus dem Rahmen wurde in Rust ausgeführt.** Die Antwort kommt im Rahmen
nur nicht an (Zeitüberschreitung nach 8 s), die Wirkung tritt trotzdem ein. Das ist genau die von
Tauri dokumentierte Schwäche A7 („unable to distinguish between requests from an embedded
`<iframe>` and the window itself“, [docs/06](06-plattform-und-funktionsmatrix.md)): Die Capabilities
gelten je Fenster, nicht je Rahmen. Jeder Befehl, den das Reader-Fenster braucht (Dokument lesen,
Speichern unter, Drucken), ist damit auch für Dokumentskript erreichbar.

*Messung Capacitor* ([`k1-ipc-capacitor/lauf.txt`](belege/P12/k1-ipc-capacitor/lauf.txt)):
dieselbe Angriffsseite, derselbe Emulator, dieselbe WebView 158. Im Rahmen gibt es weder
`Capacitor` noch `androidBridge`; der Zähler verzeichnet nur die beiden Aufrufe des Hauptfensters
(`['1 shell', '2 shell-after']`). Capacitor injiziert seine Brücke nur in den Hauptrahmen.

### 2.2 Kriterium 2 – Öffnen aus Mail und Dateimanager: **nein** (nicht nachgewiesen)

*Aufbau.* Die Tauri-Dateizuordnung erzeugt einen Intent-Filter für `application/vnd.hpro+zip`
und `*.hpro`; dazu kommt ein zweiter für `content://` mit `application/octet-stream`, weil
Dateimanager und Mail-Programme eine unbekannte Endung so übergeben und `pathPattern` für
`content://`-Adressen nicht greift ([`AndroidManifest.xml`](../mobil/src-tauri/gen/android/app/src/main/AndroidManifest.xml)).
Das Kotlin-Plugin nimmt `ACTION_VIEW` und `ACTION_SEND` beim Start und in `onNewIntent` an und
liest die Datei über den `ContentResolver`; die Web-Seite sieht nur eine Kennung, nie einen Pfad.

*Gemessen* ([`k2-launch/`](belege/P12/k2-launch/), Lauf
[`lauf-kriterien-2-3.txt`](belege/P12/lauf-kriterien-2-3.txt), 13.10.2026 23:09–00:31):

| Weg | Ergebnis | Beleg |
|---|---|---|
| Wer nimmt `VIEW` mit `application/vnd.hpro+zip` an? | nur `org.hpro.reader/.MainActivity` | [`intents.txt`](belege/P12/k2-launch/intents.txt) |
| Kaltstart mit `VIEW` (`content://`, Typ `application/vnd.hpro+zip`) | Dokument „Sanierung Schulhaus Mühlau – Projektbericht“ angezeigt (`TotalTime` 41,7 s unter TCG) | [`start1.txt`](belege/P12/k2-launch/start1.txt), [`record.jsonl`](belege/P12/k2-launch/record.jsonl) |
| zweites Dokument an die laufende App (`onNewIntent`, Typ `application/octet-stream`) | „Aufmaß und Kostenschätzung Dachsanierung Haus Nr. 12“ angezeigt | `record.jsonl` |
| Teilen (`SEND` mit `EXTRA_STREAM`) | Druckprobe „Dachsanierung Haus Nr. 12 – …“ im Reader geöffnet (Titelleiste); im Protokoll fehlt die Meldung `shown`, weil der Treiber nach 20 s beendet wurde | [`nach-senden.png`](belege/P12/k2-launch/nach-senden.png) |
| Dateimanager (DocumentsUI, Ordner Download, Eintrag antippen) | **nicht geprüft**: Die Dateien sind in „Files“ sichtbar, aber der Dialog „System UI isn't responding“ des Emulators verdeckte die Liste, der Eintrag war im UI-Baum nicht zu finden, getippt wurde nicht | [`dateimanager/`](belege/P12/k2-launch/dateimanager/) |
| Mail-Programm | **nicht geprüft**: kein Mailkonto im Emulator | – |

Einschränkung: Die `content://`-Adressen der Intents stammen aus dem FileProvider der App selbst,
nicht aus einem fremden Anbieter, denn die adb-Shell hat keine Leseberechtigung für
MediaStore-Dateien, die sie weitergeben könnte. Der Code-Weg (Intent → `ContentResolver`) ist
derselbe wie bei einer Mail-App; das Bedienen von Mail-App und Dateimanager selbst ist es nicht.
Ein zweiter Versuch für den Dateimanager (mit Wegtippen des ANR-Dialogs, `anr_wait` in
[`umgebung.sh`](../mobil/scripts/umgebung.sh)) scheiterte am 14.10.2026: Der Emulator kam ohne
Snapshot nach 35 min nicht aus dem Kaltstart ([`umgebung/lauf-14-10-kaltstart.txt`](belege/P12/umgebung/lauf-14-10-kaltstart.txt)).

### 2.3 Kriterium 3 – eigenes Kotlin- und Swift-Plugin in ≤ 5 PT ohne ANR: **nein** (nicht nachgewiesen)

*Aufbau.* Eigenes Plugin [`tauri-plugin-hpro-mobil`](../mobil/tauri-plugin-hpro-mobil/): Kotlin-Teil
[`HproPlugin.kt`](../mobil/tauri-plugin-hpro-mobil/android/src/main/java/HproPlugin.kt) (288 Zeilen)
mit fünf Befehlen – Start-Intents (`takeLaunchDocuments`), Öffnen über das Storage Access Framework
(`ACTION_OPEN_DOCUMENT`), Lesen über den `ContentResolver`, „Speichern unter“
(`ACTION_CREATE_DOCUMENT`) und Drucken: Die abgeleitete A4-Fassung des Kerns (P18) wird in einer
unsichtbaren WebView gesetzt und an den `PrintManager` gegeben. Dazu rund 150 Zeilen Rust
(Plugin-Hülle, Modelle). Alle Befehle der App sind `async`, damit kein Aufruf den UI-Thread hält.

*Gemessen* (Lauf vom 13.10.2026):

- **Start und Lesen** über Kotlin: `take_launch_files` und `read_document` angenommen, drei
  Dokumente angezeigt ([`k2-launch/record.jsonl`](belege/P12/k2-launch/record.jsonl)).
- **Drucken** über Kotlin ([`k3-print/`](belege/P12/k3-print/)): `window.print()` und der Knopf
  „Drucken“ führen über `print_html` zum System-Druckdialog; der Reader meldet „Druckfassung:
  13 Seiten A4, mit Verzeichnis, 3 lebendige Elemente als Standbild“
  ([`record.jsonl`](belege/P12/k3-print/record.jsonl)), `dumpsys print` zeigt den Auftrag mit
  `ISO_A4` hochkant ([`dumpsys-print-2.txt`](belege/P12/k3-print/dumpsys-print-2.txt)), das
  Bildschirmfoto die Vorschau 1/13 ([`druckdialog.png`](belege/P12/k3-print/druckdialog.png)).
- **ANR:** In den logcat-Aufzeichnungen beider Läufe gibt es kein `ANR in org.hpro.reader`
  ([`k2-launch/logcat-auszug.txt`](belege/P12/k2-launch/logcat-auszug.txt),
  [`k3-print/logcat-auszug.txt`](belege/P12/k3-print/logcat-auszug.txt)). Die sichtbaren
  ANR-Dialoge betreffen die System UI des Emulators, nicht den Reader.
- **Aufwand Kotlin:** Gerüst, Plugin und erste lauffähige APK entstanden im ersten Lauf
  (13.10.2026 13:54 bis Commit `b402861` um 15:11). Für eine Entwicklerin oder einen Entwickler
  ohne die Emulator-Wartezeiten schätzen wir 2 bis 3 PT: **≤ 5 PT für Kotlin ja** (Schätzung, kein
  gemessener Personenaufwand).

*Nicht belegt:* Lesen großer Dateien. Das Plugin gibt den Inhalt als Base64 in JSON zurück; ein
Versuch mit 24 MiB kam am 13.10.2026 unter Software-Emulation in 15 min nicht durch (ART-GC-Pausen,
Kommentar in [`e2e-android.sh`](../mobil/scripts/e2e-android.sh)), ein Lauf mit 8 MiB am 14.10.
scheiterte am Kaltstart des Emulators. Ob das auf einem Gerät zu einem ANR führt, ist offen. Das
**Swift-Plugin** ist nicht geprüft (kein Mac). Damit ist Kriterium 3 nicht nachgewiesen.

### 2.4 Kriterium 4 – TalkBack und VoiceOver: K4_KURZ

K4_DETAILS

### 2.5 Kriterium 5 – Store-Builds reproduzierbar in CI: K5_KURZ

K5_DETAILS

## 3. iOS: nicht geprüft

Auf dem Prüfrechner gibt es weder macOS noch Xcode, `xcrun` oder `swift`; die Tauri-CLI für Linux
kennt den Unterbefehl `ios` gar nicht ([`ios/ios-pruefung.txt`](belege/P12/ios/ios-pruefung.txt)).
Die iOS-Hälften der Kriterien 1 bis 5 (WKWebView-Rahmen gegen `webkit.messageHandlers`, „Öffnen in“
über `CFBundleDocumentTypes`/UTI, Swift-Plugin, VoiceOver, IPA-Build) sind deshalb **nicht geprüft**.
Für das Gesamturteil ist das unerheblich (Kriterium 1 fällt unter Android), für die Empfehlung nicht:
Capacitor muss seine iOS-Seite in P-Folgearbeit auf einem Mac nachweisen (Abschnitt 4.3).

## 4. Empfehlung: Capacitor

### 4.1 Begründung

1. **Sandbox (K1, gemessen).** Capacitor gibt dem Dokumentrahmen keine Brücke; Tauri gibt sie ihm.
   Die Zusage 2 aus docs/10 (abgeschottete Sandbox, nichts nach außen) ist mit Tauri unter Android
   nur mit Eingriffen in wry zu halten, etwa einer Prüfung der Rahmenherkunft vor jedem Befehl, die
   Tauri heute nicht hat. Ein eigener Fork der Brücke wäre ein dauerhaftes Sicherheitsrisiko in einer
   Schicht, die das Projekt nicht pflegt.
2. **Gleicher Web-Kern.** Die Capacitor-Hülle lädt unverändert `huelle/dist-web`, denselben Build wie
   Desktop und Tauri-Android ([`capacitor.config.json`](../mobil/capacitor/capacitor.config.json)).
   Im K1-Lauf wurde das Beispieldokument dargestellt (`ready: true`). Nichts an der Web-App hängt an
   Tauri, außer der Erkennung `window.__TAURI_INTERNALS__` für die Desktop-Brücke
   ([`app/src/desktop.ts`](../app/src/desktop.ts)), die um eine Capacitor-Erkennung ergänzt wird.
3. **Plugin-Code ist übertragbar.** Was das Kotlin-Plugin tut (Start-Intents, Storage Access
   Framework, `PrintManager`), sind Android-APIs ohne Tauri-Bezug. Capacitor-Plugins haben dieselbe
   Form (`@PluginMethod`, `call.resolve`), auf iOS Swift mit `CAPPlugin`. Der Teil, der in Tauri am
   meisten Arbeit machte (Rust-Seite, Berechtigungsdateien, `tauri android init`-Gerüst), entfällt.
4. **Barrierefreiheit hängt an der WebView, nicht an der Hülle.** Beide Hüllen nutzen die Android
   System WebView und WKWebView; was TalkBack aus dem Dokumentrahmen liest (Abschnitt 2.4), gilt für
   Capacitor genauso.
5. **Desktop bleibt bei Tauri** (P11). Unter Linux ist A7 dort durch einen eigenen Rahmen ohne
   Tauri-Objekte gemessen beherrscht ([docs/14, 3.2](14-desktop-huelle.md)); unter Android fehlt
   genau dieser Hebel, weil wry die Brücke in alle Rahmen einspielt.

### 4.2 Was vorbereitet ist

- [`mobil/capacitor/`](../mobil/capacitor/): Android-Projekt (Capacitor 8, `org.hpro.reader.capacitor`),
  gebaut als Debug-APK (4,5 MB) und im Emulator gestartet; Testtreiber
  [`mobil/e2e/capacitor-probe.js`](../mobil/e2e/capacitor-probe.js) und Skript
  [`mobil/scripts/e2e-capacitor.sh`](../mobil/scripts/e2e-capacitor.sh) für Kriterium 1.
- Die Prüfskripte für die Kriterien 2 bis 5 (Intents, Dateimanager, TalkBack, Store-Build) sind
  nicht an Tauri gebunden; sie brauchen nur Paketnamen und Build-Befehl.

### 4.3 Was für Capacitor noch nachzuweisen ist

Die Kriterien 2 bis 5 wurden für Capacitor **nicht** gemessen, und iOS für keine der beiden Hüllen.
Vor dem Mobil-Ausbau mit Capacitor: Intent-Filter und `HproPlugin` portieren und die Skripte der
Kriterien 2 bis 4 gegen `org.hpro.reader.capacitor` laufen lassen; auf einem Mac
WKWebView-Rahmen gegen `webkit.messageHandlers` (K1-iOS), „Öffnen in“, VoiceOver und IPA-Build.

## 5. Aufwand gegen die Schätzung 0,5 bis 1 PM

AUFWAND

## 6. Bauen und prüfen

```sh
mobil/scripts/android-sdk.sh                      # SDK, NDK, Emulator, Systemabbild, Rust-Ziele (alles unter mobil/.werkzeug)
(cd mobil && npm install)                         # Tauri-CLI
mobil/scripts/e2e-android.sh ipc launch read print talkback   # Kriterien 1–4 (Android) im Emulator
mobil/scripts/e2e-capacitor.sh                    # Kriterium 1 für Capacitor
mobil/scripts/store-build.sh                      # Kriterium 5: signiertes AAB zweimal, Vergleich
mobil/scripts/belege-p12.sh LAUF.log [STORE.log]  # Ergebnisse nach docs/belege/P12
```

Die Skripte beenden den Emulator am Ende (`emu_stop`); ein verwaister Emulator belegt sonst
1,2 GiB und macht den Bestandstest des Läufers zu langsam.
