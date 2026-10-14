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
| 2 | `.hpro` öffnet sich aus Mail und Dateimanager | Intents **ja** (VIEW, zweites Dokument, SEND); Dateimanager **ja** (Files, Eintrag angetippt, Dokument angezeigt); Mail **nicht geprüft** (Gmail ohne Konto und Netz) | nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |
| 3 | Kotlin- und Swift-Plugin in ≤ 5 PT, ohne ANR | Kotlin-Plugin **ja** (Start, Lesen, Drucken; 8 MiB gelesen ohne ANR des Readers, 24 MiB nicht durchgekommen) | Swift: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |
| 4 | TalkBack und VoiceOver lesen Dokument und Oberfläche vollständig | Accessibility-Baum **ja** (97 von 97 Textblöcken aus dem Sandbox-Rahmen, 26 von 26 Bedienelementen benannt); TalkBack selbst **nein**: Wischnavigation bleibt beim Sprunglink „Zum Inhalt springen“ stehen, 0 Äußerungen in 24 Schritten (Gegenprobe Einstellungen: 6 Äußerungen in 4 Schritten) | VoiceOver: nicht geprüft (kein Mac) | **nein** (unter Android gemessen) |
| 5 | Store-Builds (AAB, IPA) reproduzierbar in CI | signiertes AAB **ja, bytegleich** bei gleichen Web-Eingaben (Läufe 3 und 4); der Web-Build selbst ist nicht reproduzierbar (neu signierte Beispieldokumente); CI-Lauf nicht geprüft (P13) | IPA: nicht geprüft (kein Mac) | **nein** (nicht nachgewiesen) |

„Ergebnis“ beantwortet die Frage aus docs/06: Ist das Kriterium für Tauri **nachgewiesen** erfüllt?
Ein Kriterium, dessen iOS-Hälfte nicht prüfbar war, gilt nicht als erfüllt; ein „ja“ steht nur da,
wo es gemessen wurde. Das Gesamturteil hängt aber nicht an iOS: Kriterium 1 fällt bereits unter
Android, und es ist das einzige der fünf, das an der Hülle selbst liegt und eine Zusage aus docs/10
unmittelbar bricht. Kriterium 4 fällt unter Android ebenfalls, liegt aber an WebView oder Web-Kern
und trifft Capacitor voraussichtlich genauso (Abschnitt 2.4).

**Prüfumgebung.** Linux-Container (Intel N100, 4 Kerne, bis 14.10. früh auf 800 MHz gedrosselt,
ab dem fünften Lauf am 14.10. um 06:29 mit vollem Takt bis 3,4 GHz, cgroup-Grenze 2,5 GiB), **kein `/dev/kvm`, kein Mac**. Android-Emulator 37.2.12 mit
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

### 2.2 Kriterium 2 – Öffnen aus Mail und Dateimanager: **nein** (nicht nachgewiesen; Android-Dateimanager ja)

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
| Dateimanager (DocumentsUI „Files“, Ordner Download, Eintrag „Beispiel Bericht.hpro“ antippen) | **ja** (14.10.2026, 08:17): Files schickt `VIEW` mit `content://com.android.externalstorage.documents/…` und Typ `application/octet-stream` an `org.hpro.reader/.MainActivity` (uid 10096 = DocumentsUI); der Reader liest über den fremden Anbieter und meldet `shown` „Sanierung Schulhaus Mühlau – Projektbericht“, 127 s nach dem Tippen unter TCG | [`k2-dateimanager/`](belege/P12/k2-dateimanager/) (`ergebnis.txt`, `2-nach-tippen.png`, `lauf.txt`) |
| Mail-Programm | **nicht geprüft**: Gmail ist im Systemabbild installiert (`com.google.android.gm`, einziges Ziel für `mailto:`), aber ohne Google-Konto und ohne Netz im Emulator gibt es keine Mail mit Anhang, die sich öffnen ließe | [`mail-pruefung.txt`](belege/P12/k2-dateimanager/mail-pruefung.txt) |

Zum Dateimanager: Der erste Anlauf am 13.10. scheiterte am ANR-Dialog der System UI, der zweite am
14.10. um 00:49 am Kaltstart des Emulators ([`umgebung/lauf-14-10-kaltstart.txt`](belege/P12/umgebung/lauf-14-10-kaltstart.txt)).
Am 14.10. um 07:45 (Prüfrechner wieder mit vollem Takt) kam der Tipp an, das Skript wartete aber
nur 30 s auf den Reader und sah noch dessen Startseite
([`k2-dateimanager/versuch-1-30s/`](belege/P12/k2-dateimanager/versuch-1-30s/)). Seitdem wartet
[`dateimanager-android.sh`](../mobil/scripts/dateimanager-android.sh) bis zu 600 s auf den
Dokumenttitel; der Lauf um 08:17 (`e2e-android.sh talkback files`) ist der Beleg oben.

Einschränkung der Intent-Zeilen: Deren `content://`-Adressen stammen aus dem FileProvider der App
selbst, denn die adb-Shell hat keine Leseberechtigung für MediaStore-Dateien, die sie weitergeben
könnte. Der Dateimanager-Lauf schließt diese Lücke für einen fremden Anbieter. Eine Mail-App
übergibt Anhänge auf demselben Weg (`VIEW` mit `content://` ihres eigenen Providers und
Lesefreigabe), bedient wurde eine aber nicht.

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

*Große Dateien.* Das Plugin gibt den Inhalt als Base64 in JSON zurück. Ein Versuch mit 24 MiB kam
am 13.10.2026 unter Software-Emulation in 15 min nicht durch (ART-GC-Pausen, Kommentar in
[`e2e-android.sh`](../mobil/scripts/e2e-android.sh)). Am 14.10.2026 (10:13–10:27, [`k3-read/`](belege/P12/k3-read/),
Lauf [`lauf-kriterien-3-4-14-10.txt`](belege/P12/lauf-kriterien-3-4-14-10.txt)) las der Reader eine
Datei mit **8 MiB** über `read_document` vollständig: 8 388 608 Bytes in 712 s unter TCG. Dabei
gab es **keinen ANR des Readers**: kein „ANR in org.hpro.reader“ im logcat, keine Einträge unter
`data_app_anr` in der Drop-Box des Systems ([`dropbox-anr.txt`](belege/P12/k3-read/dropbox-anr.txt)),
keine neue Datei unter `/data/anr` ([`anr-dateien.txt`](belege/P12/k3-read/anr-dateien.txt), die
jüngste stammt von 07:27 und gehört zur System UI). Die WebView zeichnete weiter (12 976 Frames),
die längste Pause zwischen zwei Frames betrug aber 7,5 s (ohne Last 0,2 s); auf einem Gerät
schätzungsweise ein bis zwei Größenordnungen kürzer, gemessen ist das nicht. Die Prüfzeile
„dumpsys activity anr“ in `lauf.txt` ist ungültig, weil es diesen Befehl nicht gibt
([`anr.txt`](belege/P12/k3-read/anr.txt)); das Skript fragt seitdem die Drop-Box ab. Für Dateien
weit über 8 MiB ist die Übergabe als Base64-JSON der Engpass (eine Datei-Kennung mit
Stückweise-Lesen wäre die Abhilfe, in Capacitor wie in Tauri).

Das **Swift-Plugin** ist nicht geprüft (kein Mac). Damit ist Kriterium 3 nicht nachgewiesen.

### 2.4 Kriterium 4 – TalkBack und VoiceOver: **nein** (Android gemessen: Baum vollständig, TalkBack-Navigation bleibt hängen)

*Aufbau.* [`talkback-android.sh`](../mobil/scripts/talkback-android.sh) startet den Reader mit dem
Beispielbericht, schaltet TalkBack über die Secure Settings ein (derselbe Schalter wie unter
Einstellungen › Bedienungshilfen), schreibt den Accessibility-Baum (`uiautomator dump`), also das,
was jeder Bedienungshilfe-Dienst von der App bekommt, und navigiert dann mit TalkBacks eigener
Geste „nächstes Element“ (Wischen nach rechts) durch den Reader. Das Systemabbild hat keine
Sprachausgabe; TalkBack protokolliert aber jede Äußerung („TTS is not ready. Attempted to speak …
text:…“). Mit TalkBacks Protokollstufe VERBOSE (Entwickleroption, per Root im Google-APIs-Abbild
gesetzt) steht dort zusätzlich, auf welchem Knoten jeder Navigationsschritt ausgeführt wird. Das
logcat wird als Strom mitgeschnitten, weil logd im Emulator nur wenige KiB lesbar hält. Als
Gegenprobe läuft dieselbe Geste in den Einstellungen (native Ansichten).
[`talkback-check.py`](../mobil/scripts/talkback-check.py) vergleicht Baum und Äußerungen mit den
Textblöcken des Dokuments (`h1`–`h4`, `p`, `li`, Tabellenzellen …) und den Knöpfen des Readers.

*Gemessen* (14.10.2026, 13:50–14:13, TalkBack 60138361, WebView 158, [`k4-talkback/`](belege/P12/k4-talkback/),
Auswertung [`auswertung.txt`](belege/P12/k4-talkback/auswertung.txt), Ausgabe [`lauf.txt`](belege/P12/k4-talkback/lauf.txt)):

- **Accessibility-Baum: vollständig.** Bei eingeschaltetem TalkBack enthält der Baum der App 212
  Knoten, darunter **alle 97 Textblöcke** von `bericht.xhtml` aus dem Sandbox-Rahmen (Überschriften,
  Absätze, Listen, Tabellenzellen). Die drei Blöcke in zugeklappten `<details>` fehlen, wie es
  sein soll, bis sie aufgeklappt werden. Alle **26 Bedienelemente** des Readers haben einen Namen
  („Zum Inhalt springen“, „Drucken“, „Zoom 100 %, auf 100 % zurücksetzen“ …). Die opake Origin des
  Rahmens trennt also die Skripte, nicht die Barrierefreiheit: Die WebView hängt den Rahmeninhalt
  in denselben Baum. (Gleiches Ergebnis im Lauf von 09:48.)
- **TalkBack liest den Reader nicht.** 12 Wischgesten im Reader: TalkBack erkennt jede als
  `GESTURE_SWIPE_RIGHT` und führt `ACTION_NEXT_HTML_ELEMENT` auf der WebView aus (Rückgabe `true`).
  Der Fokus landet auf dem ersten Element, dem Sprunglink „Zum Inhalt springen“, und **bleibt
  dort**: 8 der 12 Schritte setzen auf diesem Knoten an, die WebView meldet keinen neuen Fokus, und
  TalkBack spricht **nichts** ([`sprache.txt`](belege/P12/k4-talkback/sprache.txt),
  [`navigation.txt`](belege/P12/k4-talkback/navigation.txt)). Weitere 12 Schritte mit Alt+Rechts
  über die Hardware-Tastatur des Emulators erreichen TalkBack gar nicht.
- **Gegenprobe Einstellungen: TalkBack funktioniert.** Dieselbe Geste, direkt danach: 4 Gesten,
  6 Äußerungen („Settings“, „Search settings“, „Network & internet, … 1 of 17“, „Connected devices …“,
  „Apps …“), grüner Fokusrahmen auf „Apps“ ([`bildschirm-kontrolle.png`](belege/P12/k4-talkback/bildschirm-kontrolle.png)).
  Die Automatisierung ist also nicht die Ursache.
- **Berührungserkundung** (Handprobe 13:17–13:50, [`k4-talkback-probe/probe.txt`](belege/P12/k4-talkback-probe/probe.txt)):
  Berühren und Halten über den Touchscreen des Emulators startet die Erkundung
  (`STATE_TOUCH_EXPLORING`), TalkBack findet unter dem Finger aber in keinem Fall einen Knoten
  (`touchedFocusableNode=null`), auch nicht auf der Überschrift des Dokuments. Dieselbe Probe hat
  gezeigt, warum die früheren Läufe nichts maßen: `input tap`/`input swipe`/`input keycombination`
  gehen an TalkBacks Eingabefilter vorbei (ein `input tap` klickte „Öffnen“, statt zu erkunden),
  und `logcat -d` hielt nur rund 8 KiB.

*Einordnung.* Der Inhalt ist für Bedienungshilfen vorhanden, aber die beiden Wege, auf denen
TalkBack in einer WebView navigiert (nächstes HTML-Element, Erkunden per Berührung), liefern im
Reader keinen Fokuswechsel. Ob das am Markup des Readers liegt (der Sprunglink ist ein gewöhnliches
`<a href="#main">`, [`app/index.html`](../app/index.html)), an der WebView 158 (Entwicklerfassung,
nötig wegen des Absturzes der 124) oder an der Software-Emulation, ist **nicht getrennt**; dafür
braucht es ein Gerät mit Release-WebView. Ohne diese Trennung ist das ein Befund gegen die
Zusage „barrierefrei“ aus docs/10 für die Mobil-Hülle und kein Messfehler.
Die früheren Anläufe: [`frueher-uiautomator-events-dienste.txt`](belege/P12/k4-talkback/frueher-uiautomator-events-dienste.txt)
zeigt, dass `uiautomator events` TalkBack während der Navigation abmeldet (`Bound services:{}`).

Vorher scheiterte der Schritt an der Umgebung: Am 13.10.2026 war der Emulator schon verschwunden
(Ende von [`lauf-kriterien-2-3.txt`](belege/P12/lauf-kriterien-2-3.txt)), am 14.10.2026 um 00:49
kam er nicht aus dem Kaltstart ([`umgebung/lauf-14-10-kaltstart.txt`](belege/P12/umgebung/lauf-14-10-kaltstart.txt)).
VoiceOver ist ohne Mac nicht prüfbar. Die Barrierefreiheit des Web-Kerns selbst ist in P8 geprüft
(Prüflauf, docs/belege/P8); das ersetzt keinen Screenreader-Test in der Mobil-WebView.

Für die Hüllenwahl ist das Kriterium voraussichtlich neutral: Tauri und Capacitor nutzen dieselbe
Android System WebView beziehungsweise WKWebView mit demselben Web-Kern, und was ein Screenreader
im Rahmen findet, entscheiden WebView und Markup, nicht die Hülle. Gemessen ist das für Capacitor
nicht: Die vorbereitete Capacitor-APK enthält nur den Testtreiber für Kriterium 1, der sich nach
dem Angriff beendet.

### 2.5 Kriterium 5 – Store-Builds reproduzierbar in CI: **nein** (nicht nachgewiesen; Android-AAB ja)

*Aufbau.* [`store-build.sh`](../mobil/scripts/store-build.sh) baut das signierte App Bundle
(Release, LTO, `codegen-units = 1`) aus sauberem Zustand mehrmals (`HPRO_STORE_RUNS`), vergleicht
die Dateien Byte für Byte und Eintrag für Eintrag, prüft die Signatur (`jarsigner`) und das Bundle
(`bundletool validate`) und misst die Download-Größe für ein arm64-Gerät (`bundletool get-size`).
Vor jedem Vergleich schreibt es die Prüfsummen aller Web-Eingaben (`huelle/dist-web`) mit. Der
Upload-Schlüssel ist ein hier erzeugter Testschlüssel. Das Skript braucht kein Gerät und läuft mit
denselben Werkzeugversionen unverändert auf einem CI-Runner ([`android-sdk.sh`](../mobil/scripts/android-sdk.sh));
ein CI-Lauf selbst (GitHub Actions) ist **nicht** gemacht, die CI-Strecke ist Paket P13.

*Gemessen* (14.10.2026, Ziel `aarch64`, [`k5-store/`](belege/P12/k5-store/)):

| Lauf | Zeit | Web-Build | Ergebnis | Beleg |
|---|---|---|---|---|
| OOM 1, 2 | 01:58, 02:36 | ja | „Gradle build daemon disappeared unexpectedly“, OOM-Killer der cgroup (`oom_kill` 14 → 15) | [`oom-1-ende.txt`](belege/P12/k5-store/oom-1-ende.txt) |
| 1 | 03:31 | ja | AAB 4 258 616 Bytes, SHA-256 `32ba215f…`, 2837 s (CPU auf 800 MHz gedrosselt) | [`lauf.txt`](belege/P12/k5-store/lauf.txt), [`pruefung-aab-1.txt`](belege/P12/k5-store/pruefung-aab-1.txt) |
| 2, Versuch 1 und 2 | 04:18, 08:24 | ja | wieder OOM (`oom_kill` 15 → 16, 16 → 17) | [`lauf2-oom-ende.txt`](belege/P12/k5-store/lauf2-oom-ende.txt), [`lauf2-14-10-0824-oom.txt`](belege/P12/k5-store/lauf2-14-10-0824-oom.txt) |
| 2, Versuch 3 | 08:36 | ja | kein OOM mehr, aber `packageUniversalReleaseBundle`: „Metaspace“ (Grenze 384 MiB) | [`lauf2-14-10-0836-metaspace.txt`](belege/P12/k5-store/lauf2-14-10-0836-metaspace.txt) |
| 2 | 08:58 | ja | AAB 4 258 620 Bytes, SHA-256 `58adb930…`, 671 s; gegen Lauf 1: 4 von 686 Einträgen verschieden (`META-INF/` und `libhpro_mobil_lib.so`) | [`lauf2-vergleich-mit-1.txt`](belege/P12/k5-store/lauf2-vergleich-mit-1.txt) |
| 3 und 4 | 09:11, 09:21 | nein, dieselben 21 Web-Dateien | **bytegleich**: beide SHA-256 `c62d524971a837417efb3eb32ae5ac65e61ae7f83294c8796920f92cf9b309bc`, 4 258 576 Bytes, je 638–639 s; `jar verified.`, `bundletool validate` liest beide | [`lauf3-4-gleiche-web-eingaben.txt`](belege/P12/k5-store/lauf3-4-gleiche-web-eingaben.txt), [`pruefung-aab-3-4.txt`](belege/P12/k5-store/pruefung-aab-3-4.txt), [`sha256.txt`](belege/P12/k5-store/sha256.txt) |

*Die OOM-Abbrüche* hatten zwei Ursachen. `tauri android build` übersetzt die Rust-Bibliothek
zuerst selbst, Gradles Task `rustBuild` den Endcrate mit LTO dann noch einmal, während der
Gradle-Daemon im Speicher liegt. Dazu kam ein Kotlin-Compile-Daemon als dritte JVM, denn
`kotlin.compiler.execution.strategy=in-process` aus der `gradle.properties` des Projekts gilt
nicht für den eigenständigen `buildSrc`-Build (nach dem Abbruch um 08:30 lief er noch). Seitdem
setzt `store-build.sh` die Strategie in der nutzerweiten `gradle.properties`, gibt dem Daemon 768 MiB
Heap und 512 MiB Metaspace mit SerialGC und schreibt den Speicher alle 10 s mit
([`speicher-lauf3.txt`](belege/P12/k5-store/speicher-lauf3.txt)). So liefen drei Builds
hintereinander ohne Abbruch; die cgroup stand dabei an ihrer Grenze von 2 560 MiB (überwiegend
Seitencache).

*Warum Lauf 1 und Lauf 2 verschieden sind.* Die Abweichung in `libhpro_mobil_lib.so` beginnt in
`.rodata` genau beim eingebetteten Web-Asset `kostenschaetzung.hpro`
([`lauf1-2-abweichung-so.txt`](belege/P12/k5-store/lauf1-2-abweichung-so.txt)); alles danach ist
verschoben. Zwei Web-Builds hintereinander (`npm run build:web`) liefern verschiedene
`kostenschaetzung.hpro`, `sperren.hpro` und `sw.js` ([`web-build-zweimal.txt`](belege/P12/k5-store/web-build-zweimal.txt)):
Der Kern signiert diese Beispieldokumente bei jedem Build mit einem neu erzeugten Testschlüssel
(`buildCalcSample`, `buildLockSample` in [`app/scripts/sample.ts`](../app/scripts/sample.ts)),
versiegelt `sperren.hpro` mit zufälligem Salt, und der Service Worker führt ihre Prüfsummen. Ohne
Web-Build (`HPRO_STORE_WEB=keep`, Tauris `beforeBuildCommand` abgeschaltet) sind zwei Builds
derselben Web-Eingaben bytegleich, einschließlich Signatur. **Die Hüllen-Kette
(Tauri-CLI, Rust, NDK, Gradle, Kotlin, Signatur) ist damit unter Android reproduzierbar**; das
Gesamtartefakt ist es erst, wenn die Beispieldokumente nicht mehr bei jedem Build neu signiert
werden, sondern einmal erzeugt und als Eingabe eingecheckt sind (Aufgabe für P13).

Nicht geprüft: ein Lauf auf einem CI-Runner (P13), ein Bundle mit den anderen drei Android-ABIs
(`armv7`, `i686`, `x86_64`; aus Zeitgründen nur `aarch64` gebaut, das für Google Plays
64-Bit-Regel genügt) und die IPA (kein Mac). Damit ist
Kriterium 5 nicht nachgewiesen.

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
4. **Barrierefreiheit hängt an WebView und Web-Kern, nicht an der Hülle.** Beide Hüllen nutzen die
   Android System WebView und WKWebView; der vollständige Accessibility-Baum und das Hängenbleiben
   der TalkBack-Navigation (Abschnitt 2.4) sind deshalb für Capacitor genauso zu erwarten (nicht
   gemessen) und kein Argument für Tauri.
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
Kriterien 2 bis 4 gegen `org.hpro.reader.capacitor` laufen lassen; die TalkBack-Navigation auf
einem Gerät mit Release-WebView klären (Abschnitt 2.4) und, falls sie dort ebenfalls hängt, im
Web-Kern beheben (P8-Nacharbeit); auf einem Mac
WKWebView-Rahmen gegen `webkit.messageHandlers` (K1-iOS), „Öffnen in“, VoiceOver und IPA-Build.

## 5. Aufwand gegen die Schätzung 0,5 bis 1 PM

**Schätzung aus docs/06:** 0,5 bis 1 PM für den Spike, also 10 bis 20 Personentage (PT), bei
20 PT je Monat.

**Gemessen ist nur die Wandzeit des Agenten**, kein Personenaufwand. P12 lief in sechs Läufen
(Läuferprotokolle `/opt/data/html-pro-lauf/*-P12.log`, Commit-Zeiten):

| Lauf | Zeitraum | Ergebnis |
|---|---|---|
| 1 | 13.10. 13:54–17:21 | Android-SDK und NDK, `tauri android init`, Kotlin-Plugin, Capacitor-Hülle, Testtreiber (`b402861`) |
| 2 | 13.10. 18:09 bis höchstens 21:43 | Kriterium 1 Tauri gemessen, WebView 158 statt der abstürzenden 124 (`22d316d`), Kriterium 1 Capacitor |
| 3 | 13.10. 22:44–23:30 | Skripte Dateimanager, TalkBack, Store-Build; E2E-Lauf Start und Druck (lief bis 00:31 weiter) |
| 4 | 14.10. 00:49–04:25 | Auswertung K2/K3; Emulator-Neuversuch (Kaltstart hing 35 min); Store-Build: drei OOM-Abbrüche, ein signiertes AAB; dieser Bericht |
| 5 | 14.10. 06:29 bis etwa 10:30 | Dateimanager (K2 Android ja), TalkBack-Läufe (Baum vollständig, Navigation kam nicht an), 8 MiB lesen ohne ANR, Store-Build: zwei weitere OOM- und ein Metaspace-Abbruch, dann drei AABs, zwei davon bytegleich (nicht committet) |
| 6 | 14.10. 12:27– | Belege aus Lauf 5 gesichert und ausgewertet, ANR-Prüfung korrigiert, TalkBack-Messung lauffähig gemacht (Root-Protokollstufe, Konsolen-Gesten, logcat-Strom, Gegenprobe) und gemessen |

Zusammen rund 16 bis 17 h Wandzeit (Lauf 2 und 5 ohne genaues Ende). Davon war der größte Teil Warten auf die Software-Emulation:
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
