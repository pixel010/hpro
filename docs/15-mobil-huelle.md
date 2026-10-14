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
| 4 | TalkBack und VoiceOver lesen Dokument und Oberfläche vollständig | TalkBack **nicht geprüft** (Emulator in beiden Anläufen vorher ausgefallen) | VoiceOver: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |
| 5 | Store-Builds (AAB, IPA) reproduzierbar in CI | ein signiertes AAB gebaut und geprüft; Reproduzierbarkeit **nicht geprüft** (zweiter Build vom OOM-Killer beendet) | IPA: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |

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

### 2.4 Kriterium 4 – TalkBack und VoiceOver: **nein** (nicht nachgewiesen)

*Aufbau.* [`talkback-android.sh`](../mobil/scripts/talkback-android.sh) startet den Reader mit dem
Beispielbericht, schaltet TalkBack über die Secure Settings ein (derselbe Schalter wie unter
Einstellungen › Bedienungshilfen), schreibt den Accessibility-Baum (`uiautomator dump`) und schickt
60-mal „nächstes Element“ (Alt+Rechts), während `uiautomator events` aufzeichnet, welcher Knoten
den Accessibility-Fokus bekommt. [`talkback-check.py`](../mobil/scripts/talkback-check.py) vergleicht
das mit den Textblöcken des Dokuments (`h1`–`h4`, `p`, `li`, Tabellenzellen …) und den Knöpfen des
Readers. Entscheidend ist, ob TalkBack in den `sandbox`-Rahmen mit opaker Origin hineinkommt.

*Nicht geprüft.* Am 13.10.2026 erreichte der E2E-Lauf den TalkBack-Schritt erst, als der Emulator
bereits verschwunden war (`adb: device 'emulator-5560' not found`, Ende von
[`lauf-kriterien-2-3.txt`](belege/P12/lauf-kriterien-2-3.txt)); am 14.10.2026 kam der Emulator
nicht aus dem Kaltstart ([`umgebung/lauf-14-10-kaltstart.txt`](belege/P12/umgebung/lauf-14-10-kaltstart.txt)).
VoiceOver ist ohne Mac nicht prüfbar. Die Barrierefreiheit des Web-Kerns selbst ist in P8 geprüft
(Prüflauf, docs/belege/P8); das ersetzt keinen Screenreader-Test in der Mobil-WebView.

Für die Hüllenwahl ist das Kriterium neutral: Tauri und Capacitor nutzen dieselbe Android System
WebView beziehungsweise WKWebView, und was ein Screenreader aus dem Rahmen liest, entscheidet die
WebView, nicht die Hülle.

### 2.5 Kriterium 5 – Store-Builds reproduzierbar in CI: **nein** (nicht nachgewiesen)

*Aufbau.* [`store-build.sh`](../mobil/scripts/store-build.sh) baut das signierte App Bundle
(Release, LTO, `codegen-units = 1`) zweimal aus sauberem Zustand, vergleicht beide Dateien Byte für
Byte und Eintrag für Eintrag, prüft die Signatur (`jarsigner`) und das Bundle (`bundletool validate`)
und misst die Download-Größe für ein arm64-Gerät (`bundletool get-size`). Der Upload-Schlüssel ist
ein hier erzeugter Testschlüssel. Das Skript braucht kein Gerät und läuft mit denselben
Werkzeugversionen unverändert auf einem CI-Runner ([`android-sdk.sh`](../mobil/scripts/android-sdk.sh));
ein CI-Lauf selbst (GitHub Actions) ist **nicht** gemacht, die CI-Strecke ist Paket P13.

*Gemessen* (14.10.2026, Ziel `aarch64`, [`k5-store/`](belege/P12/k5-store/)):

- Zwei Versuche mit `tauri android build` endeten mit „Gradle build daemon disappeared
  unexpectedly“: Der OOM-Killer der cgroup nahm den Gradle-Daemon (`oom_kill` 14 → 15), weil
  `tauri android build` die Rust-Bibliothek erst selbst baut und Gradles Task `rustBuild` den
  Endcrate mit LTO noch einmal übersetzt, parallel zur Kotlin-Kompilierung im Daemon
  ([`k5-store/oom-1-ende.txt`](belege/P12/k5-store/oom-1-ende.txt)). Abhilfe im Skript: nur für
  diesen Build kleiner Daemon-Heap und ein Gradle-Task zur Zeit. Das reichte für Lauf 1, nicht für
  Lauf 2; der Container mit 2,5 GiB ist für diesen Build zu klein.
- Lauf 1 danach: signiertes AAB (`bundleUniversalRelease`, nur `arm64-v8a`) in 2837 s, 4 258 616 Bytes, SHA-256
  `32ba215fb873d39a7698f4c00b6ee11f8be07e641435eabc772891d7f6ca46e5`
  ([`k5-store/lauf.txt`](belege/P12/k5-store/lauf.txt)).
- Prüfung dieses AAB ([`k5-store/pruefung-aab-1.txt`](belege/P12/k5-store/pruefung-aab-1.txt)):
  `jarsigner -verify` meldet „jar verified.“ (mit Testschlüssel `CN=hpro Testschluessel (P12)`),
  `bundletool validate` liest das Bundle (Modul `base` mit `lib/arm64-v8a/libhpro_mobil_lib.so`,
  4 427 704 Bytes).
- Lauf 2 für den Vergleich: wieder „Gradle build daemon disappeared unexpectedly“, `oom_kill` 15 → 16
  ([`k5-store/lauf2-oom-ende.txt`](belege/P12/k5-store/lauf2-oom-ende.txt)). Für einen weiteren
  Build von rund 47 min reichte die Laufzeit nicht mehr. **Die Reproduzierbarkeit (zwei Builds,
  bytegleich oder nur in `META-INF/` verschieden) ist damit nicht geprüft.** Das Skript enthält den
  Vergleich; auf einem CI-Runner mit 7 GiB und mehr fällt die Speichergrenze weg.

IPA: nicht geprüft (kein Mac). Damit ist Kriterium 5 nicht nachgewiesen.

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

**Schätzung aus docs/06:** 0,5 bis 1 PM für den Spike, also 10 bis 20 Personentage (PT), bei
20 PT je Monat.

**Gemessen ist nur die Wandzeit des Agenten**, kein Personenaufwand. P12 lief in vier Läufen
(Läuferprotokolle `/opt/data/html-pro-lauf/*-P12.log`, Commit-Zeiten):

| Lauf | Zeitraum | Ergebnis |
|---|---|---|
| 1 | 13.10. 13:54–17:21 | Android-SDK und NDK, `tauri android init`, Kotlin-Plugin, Capacitor-Hülle, Testtreiber (`b402861`) |
| 2 | 13.10. 18:09 bis höchstens 21:43 | Kriterium 1 Tauri gemessen, WebView 158 statt der abstürzenden 124 (`22d316d`), Kriterium 1 Capacitor |
| 3 | 13.10. 22:44–23:30 | Skripte Dateimanager, TalkBack, Store-Build; E2E-Lauf Start und Druck (lief bis 00:31 weiter) |
| 4 | 14.10. 00:49–04:25 | Auswertung K2/K3; Emulator-Neuversuch (Kaltstart hing 35 min); Store-Build: drei OOM-Abbrüche, ein signiertes AAB; dieser Bericht |

Zusammen rund 11 bis 12 h Wandzeit (Lauf 2 ohne genaues Ende). Davon war der größte Teil Warten auf die Software-Emulation:
ein Emulator-Start 83 s bis über 35 min, ein Kaltstart der App 28–118 s, ein Szenario 15–80 min.

**Personenaufwand (Schätzung)** für eine Entwicklerin oder einen Entwickler mit Linux-Rechner mit KVM,
einem Android-Gerät und einem Mac:

| Arbeitsschritt | erledigt | Schätzung PT |
|---|---|---|
| Werkzeugkette Android (SDK, NDK, Emulator), `tauri android init`, Gradle-Anpassungen | ja | 1 |
| Kotlin-Plugin (288 Zeilen) mit Rust-Hülle, Intent-Filter | ja | 2–3 |
| Angriffsseite, Testbefehle, Treiber und Auswertung für Kriterium 1 | ja | 2 |
| Capacitor-Vergleichshülle und Kriterium-1-Lauf | ja | 1 |
| Prüfskripte Kriterien 2–5 (Intents, Dateimanager, TalkBack, Store-Build) | ja | 1,5 |
| Auswertung und Bericht | ja | 1 |
| **Summe Android-Hälfte** | | **8,5–9,5** |
| iOS: Werkzeugkette auf dem Mac, Swift-Plugin, K1 mit WKWebView, „Öffnen in“, VoiceOver, IPA in CI | nein (kein Mac) | 6–9 |
| **Summe Spike vollständig** | | **15–18** |

**Einordnung.** Der vollständige Spike läge mit 15 bis 18 PT (0,75 bis 0,9 PM) **innerhalb der
Schätzung** von 0,5 bis 1 PM; die Android-Hälfte allein mit 8,5 bis 9,5 PT knapp unter der
Untergrenze. Entscheidend ist aber, dass das Ergebnis schon nach Kriterium 1 feststand, nach rund
4 bis 5 PT (Werkzeugkette, App-Gerüst, Angriffsseite, Messung, Capacitor-Gegenprobe). Die
Abbruchregel aus docs/06 hat damit ihren Zweck erfüllt: Der Rest der Schätzung geht nicht in
Tauri-Mobil, sondern in die Capacitor-Nachweise aus Abschnitt 4.3. Die Software-Emulation ohne KVM
hat die Wandzeit vervielfacht. Für die Folgearbeit braucht es einen Rechner mit `/dev/kvm` oder ein
Gerät und einen Mac (oder einen macOS-Runner in CI).

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
