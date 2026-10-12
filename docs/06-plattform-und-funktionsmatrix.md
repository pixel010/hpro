# 06 – Plattform und Funktionsmatrix

**Projekt:** hpro · **Phase:** 2 (Machbarkeit) · **Stand:** 11.10.2026
**Auftrag:** [`04-phase2-auftrag.md`](04-phase2-auftrag.md), Abschnitt B
**Grundlage:** [`02-acrobat-pro-funktionsumfang.md`](02-acrobat-pro-funktionsumfang.md) (Funktionsgruppen 1–13),
[`03-konzept.md`](03-konzept.md) (Abschnitte 2.1–2.4). Das Container-Experiment (EPUB vs. ASiC-E)
lief parallel; Ergebnis in [`05-prototyp-ergebnisse.md`](05-prototyp-ergebnisse.md): Eine Datei
kann zugleich gültiges EPUB und gültiger ASiC-E/XAdES-Container sein. Für diese Matrix heißt das:
Das **Format** ist auf allen Plattformen gleich; die Unterschiede liegen nur bei Erzeugen und
Prüfen der Signatur (DSS ist Java, siehe A2 und Anmerkung 10).

**Konventionen:** Belegte Aussagen tragen eine URL (Abrufdatum aller Quellen: 11.10.2026).
Blogs, Vergleichsseiten und Suchauszüge sind als **Sekundärquelle** markiert. Unbelegtes ist
**OFFENE FRAGE** oder „nicht belegt“. Bewertungen und Aufwände sind **eigene Einschätzungen ohne
externe Quelle** und als Bandbreite angegeben. Kompatibilitätsangaben zu Web-APIs stammen, wenn
nicht anders angegeben, aus den MDN-Kompatibilitätsdaten
([@mdn/browser-compat-data 8.1.5, Stand 08.10.2026](https://unpkg.com/@mdn/browser-compat-data/data.json)),
im Folgenden „BCD“.

---

## 0. Kurzfassung

1. **„Gleicher Funktionsumfang“ ist für den Kern erreichbar, nicht für alles.** Lesen, Bearbeiten,
   Formulare, Kommentare, Barrierefreiheitsprüfung, Verschlüsselung, Signaturprüfung (kryptografisch)
   und QES per Fernsignatur laufen als TypeScript-Kern auf allen sechs Plattformen gleich. Rund ein
   Dutzend Funktionen hängen an Plattformgrenzen; sie sind in Abschnitt 1.3 als Ausnahmen mit Beleg
   aufgeführt.
2. **Kern = Web-App (TypeScript), Hülle = Tauri 2 für Windows, macOS, Linux, iOS und Android.**
   Gleichzeitig wird dieselbe Web-App als PWA ausgeliefert. Begründung: eine Hülle für alle fünf
   nativen Ziele, sehr kleine Pakete, Rust für Desktop-Systemzugriff (PKCS#11, PC/SC, Sidecars).
   **Vorbehalt:** Tauri Mobile ist nach eigener Aussage noch nicht auf Desktop-Niveau. Deshalb gibt es
   vor dem Mobil-Ausbau einen begrenzten Spike mit Abbruchkriterien (Abschnitt 4.4). Fällt er
   durch, kommt **Capacitor** als Hülle für iOS und Android.
3. **Electron ist der ernsthafte Gegenvorschlag für den Desktop.** Es bringt eine einheitliche
   Chromium-Engine und Tagged-PDF-Export mit, deckt aber kein Mobilgerät ab und ist um
   Größenordnungen größer. Es bleibt Rückfallebene, falls die Engine-Testsuite unter WebKit oder
   WebKitGTK nicht besteht.
4. **Flutter und React Native scheiden aus.** hpro rendert HTML. Beide bräuchten für den
   Dokumentinhalt ohnehin eine WebView und damit zwei UI-Technologien. Das offizielle
   `webview_flutter` deckt Windows, Linux und Web nicht ab.
5. **Die lokalen Dienste aus dem Konzept (WeasyPrint, Docling = Python; EU DSS = Java) laufen nur auf
   dem Desktop als Sidecar.** Für Web, iOS und Android braucht es einen **selbst hostbaren
   hpro-Dienst** oder schwächere Ersatzwege (Engine-Druck-zu-PDF, Tesseract.js, eigene
   Validierung in TypeScript). Das ist die größte echte Ungleichheit.
6. **Lokale QES mit Karte und Kartenleser geht nur auf dem Desktop** sicher. Browser haben keinen
   PC/SC- oder PKCS#11-Zugang; die Web Smart Card API gibt es nur für Isolated Web Apps unter
   ChromeOS. Mobil geht NFC mit Einschränkungen. Die **Fernsignatur (CSC API)** ist deshalb der
   plattformgleiche Standardweg. A-Trust bewirbt eine CSC-Schnittstelle für Integrationspartner.
7. **Zusatzaufwand für „alle Plattformen“** gegenüber dem Desktop-MVP aus [03](03-konzept.md#62-aufwand-mvp-schätzung):
   grob **16–35 PM** (eigene Schätzung). Davon entfallen 7–15 PM auf die Mobil-Apps. Hinzu kommen der
   Server-Dienst und eine Testmatrix über sechs Plattformen.

---

## 1. Was „gleicher Funktionsumfang“ realistisch heißt

### 1.1 Definition (Vorschlag)

> **Gleicher Funktionsumfang** heißt: Ein **identischer Kern** (derselbe TypeScript-Code, dieselben
> Formate, dieselbe Testsuite) läuft auf allen sechs Plattformen. Jede Funktion, die auf einer
> Plattform fehlt oder schwächer ist, steht in einer **öffentlichen Ausnahmeliste**, und zwar **nur**
> dann, wenn die Plattform es technisch oder durch Store-Regeln nicht zulässt. Jede Ausnahme hat
> einen Beleg und einen dokumentierten Ersatzweg.

Daraus folgen drei Regeln:

1. **Kein Funktionsabbau aus Bequemlichkeit.** Muss ein Adapter nativ geschrieben werden (z. B.
   Drucken unter Android), ist das Aufwand und keine Ausnahme.
2. **Ersatzweg vor Lücke.** Wo lokal nichts geht, gibt es einen Dienst-Weg, z. B. PDF/A-Export über
   den Server statt über WeasyPrint lokal. Der Nutzer sieht, dass Daten das Gerät verlassen.
3. **Dokumente sind überall gleich gültig.** Eine Datei, die auf einer Plattform erstellt oder
   signiert wurde, öffnet und prüft sich auf allen anderen gleich. Nur die Werkzeuge dürfen sich
   unterscheiden, nie das Format.

### 1.2 Identischer Kern (auf allen sechs Plattformen)

| Bereich | Warum plattformunabhängig | Beleg |
|---|---|---|
| Container lesen/schreiben, Manifest, Hashes | reines TypeScript; SHA-256 und Signaturprüfung über WebCrypto (`SubtleCrypto.sign/verify`: Chrome 37, Firefox 34, Safari/iOS 7, Android-WebView 37) | BCD `api.SubtleCrypto.sign` |
| Rendern in Sandbox, Umfließen, Themes | jede Hülle nutzt eine Browser-Engine | [Tauri Webview-Versionen](https://v2.tauri.app/reference/webview-versions/) |
| Editor, Formulare, Kommentare, Vergleich | DOM und JSON, kein Systemzugriff | [03, Abschnitt 2.3](03-konzept.md#23-was-geht-ohne-server) |
| Barrierefreiheitsprüfung (axe-core) | läuft im DOM | [axe-core](https://github.com/dequelabs/axe-core) |
| Verschlüsselung (CMS-Umschlag) | WebCrypto + CMS-Kodierung in TypeScript | BCD; [RFC 5652](https://www.rfc-editor.org/rfc/rfc5652) |
| QES per Fernsignatur | HTTP-Protokoll (CSC API v2.2), nur Netz nötig | [CSC](https://cloudsignatureconsortium.org/resources/csc-api-v2-2/) |
| Lokale Speicherung (App-intern) | Origin Private File System, „Baseline“ seit März 2023 | [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) |

### 1.3 Ausnahmen vom gleichen Funktionsumfang

| Nr. | Ausnahme | Betroffen | Grund (Beleg) | Ersatzweg |
|---|---|---|---|---|
| A1 | **Lokale QES/AdES mit Smartcard und Kartenleser (PC/SC, PKCS#11)** | Web: nicht möglich; iOS/Android: eingeschränkt | WebCrypto „does not specifically address the provisioning of keys in particular types of key storage, such as secure elements or smart cards“ ([W3C WebCrypto L2](https://www.w3.org/TR/WebCryptoAPI/)); die Web Smart Card API ist für Isolated Web Apps gedacht ([WICG](https://github.com/WICG/web-smart-card/)), und Isolated Web Apps gibt es „in ChromeOS since 2024“ ([W3C TPAC 2025](https://www.w3.org/events/meetings/5c9ab1dc-8be0-47ff-8012-c925b553d243/)); iOS liest ISO-7816-Karten über NFC nur für vorab deklarierte AIDs ([Apple NFCISO7816Tag](https://developer.apple.com/documentation/corenfc/nfciso7816tag)) | Fernsignatur (CSC); Desktop-Hülle |
| A2 | **PDF/A- und PDF/UA-Export über WeasyPrint, PDF-Import über Docling, Validierung über EU DSS** lokal | Web, iOS, Android: nicht lokal | Docling ist Python für „macOS, Linux and Windows“ ([Docling](https://github.com/docling-project/docling)); WeasyPrint braucht Pango ([WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html)); DSS ist Java ([DSS](https://github.com/esig/dss)); Tauri-Shell (und damit Sidecars) kann mobil nur „open URLs“ ([Tauri Shell](https://v2.tauri.app/plugin/shell/)); Apple 2.5.2 verbietet nachgeladenen ausführbaren Code ([Apple](https://developer.apple.com/app-store/review/guidelines/)); weder WeasyPrint noch Docling stehen in der Pyodide-Paketliste ([Pyodide](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)) | hpro-Dienst (Server); Engine-Druck-zu-PDF (kein PDF/A garantiert) |
| A3 | **Doppelklick öffnet `.hpro`** | Web: nur Chrome/Edge Desktop, installierte PWA | File Handling: Chrome/Edge ab 102, „limited to desktop operating systems“, nicht Firefox/Safari ([Chrome](https://developer.chrome.com/docs/capabilities/web-apis/file-handling); BCD `manifests.webapp.file_handlers`) | Datei-Dialog bzw. Drag & Drop; native Hülle |
| A4 | **Dateien am Ort speichern** (öffnen–bearbeiten–speichern ohne Download) | Web: nur Chromium | `showSaveFilePicker`: Chrome/Edge 86, Chrome Android 132; nicht Firefox, Safari, iOS (BCD) | Download einer neuen Datei; OPFS als App-Bibliothek |
| A5 | **Hintergrund- und Stapelverarbeitung** | iOS: eingeschränkt; Web: eingeschränkt | `BGProcessingTask` läuft „only when the device is idle“ ([Apple](https://developer.apple.com/documentation/backgroundtasks/bgprocessingtask)); `BGContinuedProcessingTask` erst ab iOS 26 und nur nach Nutzeraktion ([Apple](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados)); Background Sync und Periodic Sync nur in Chromium (BCD) | Stapel im Vordergrund; Desktop-CLI; Server |
| A6 | **Engine-Einheitlichkeit** (gleiche Darstellung bis ins Detail) | alle außer Electron | Tauri: WebView2 (Chromium), WebKit (macOS/iOS), WebKitGTK (Linux, Version der Distribution), Android System WebView ([Tauri](https://v2.tauri.app/reference/webview-versions/)); iOS-Apps müssen WebKit nutzen, die EU-Ausnahme gilt nur für Browser- und In-App-Browsing-Apps, nicht für „content embedded within or only obtainable via the app“ ([Apple 2.5.6](https://developer.apple.com/app-store/review/guidelines/); [Apple EU](https://developer.apple.com/support/alternative-browser-engines/)) | konservatives CSS-Profil + Cross-Engine-Testsuite; Signaturprofil ohne engine-abhängige Darstellung |
| A7 | **Dokument-Sandbox per iframe** ohne Zusatzmaßnahmen | Linux, Android (Tauri) | „On Linux and Android, Tauri is unable to distinguish between requests from an embedded `<iframe>` and the window itself.“ ([Tauri](https://v2.tauri.app/security/capabilities/)); getrennte Webviews in einem Fenster nur mit Feature `unstable` ([docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html)) | Hauptfenster ohne gefährliche Capabilities; siehe Abschnitt 3.3 |
| A8 | **Kamera-Dokumentscan mit Kantenerkennung** | Web, Desktop: eingeschränkt | System-Scanner gibt es nur nativ: VisionKit ab iOS 13 ([Apple](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller)), ML Kit Document Scanner nur Android mit Google Play-Diensten und ≥ 1,7 GB RAM ([Google](https://developers.google.com/ml-kit/vision/doc-scanner/android)); im Web nur `getUserMedia` (BCD) | Foto/Bild importieren; eigene Kantenerkennung (Aufwand) |
| A9 | **Vorlesen über Web Speech API** | Android-Hülle | `SpeechSynthesis` fehlt in der Android-WebView (BCD: `webview_android` = nein) | nativer TTS-Adapter |
| A10 | **Drucken per `window.print()`** | Android-Hülle | „You cannot use JavaScript in a HTML document to trigger printing.“ ([Android](https://developer.android.com/training/printing/html-docs)). Tauri schreibt dagegen „`window.print()` works on all platforms“ ([docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)); der Widerspruch ist **ungeklärt** | nativer Druck-Adapter (`createPrintDocumentAdapter`) |
| A11 | **Rich-Text-Zwischenablage (HTML)** | iOS/Android über Tauri-Plugin | Tauri-Clipboard mobil „Only plain-text content support“ ([Tauri](https://v2.tauri.app/plugin/clipboard/)) | Async Clipboard API der WebView (`ClipboardItem` iOS 13.4, Android-WebView 84, BCD); auf Gerät prüfen |
| A12 | **Geräteschlüssel im Secure Element** nur mit eingeschränkten Algorithmen | iOS/macOS, Android | Secure Enclave „Works only with NIST P-256 elliptic curve keys“ ([Apple](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)); StrongBox: RSA 2048, ECDSA P-256 u. a. ([Android](https://developer.android.com/privacy-and-security/keystore)); im Web gar nicht (A1) | ECDSA P-256 als Signaturalgorithmus; nie qualifiziert |
| A13 | **Barrierefreiheit unter Linux** mit gleicher Qualität | Linux | WebKitGTK hat ATK durch eine eigene AT-SPI-Implementierung ersetzt ([WebKit Bug 238198](https://bugs.webkit.org/show_bug.cgi?id=238198)); bei der GTK4-Portierung blieben laut GNOME „still a couple of accessibility bugs“ ([GNOME, 04/2025](https://blogs.gnome.org/tbernard/?p=10486)); Tauri nutzt `webkit2gtk-4.1` ([Tauri](https://v2.tauri.app/start/prerequisites/)) | Orca-Test im Prototyp; ggf. Electron unter Linux |

**Nicht als Ausnahme gezählt**, weil auf allen Plattformen gleich: Netzabhängigkeit von QES,
Zeitstempel, Sync und KI-Diensten (siehe [03, Abschnitt 2.3](03-konzept.md#23-was-geht-ohne-server)).

---

## 2. Technologievergleich

### 2.1 Steckbriefe

| | **Tauri 2** | **Electron** | **Capacitor** | **PWA** | **React Native** | **Flutter** |
|---|---|---|---|---|---|---|
| Ziele | Windows, macOS, Linux, iOS, Android ([Tauri](https://v2.tauri.app/start/)) | Windows 10+, macOS Ventura+, Linux; **kein Mobil** ([README](https://github.com/electron/electron/blob/main/README.md)) | iOS 15+, Android 7+ (v8), Web ([Support-Policy](https://capacitorjs.com/docs/main/reference/support-policy)); Desktop nur über Dritt-Plattformen, das Community-Electron-Projekt ist „unmaintained“ ([GitHub](https://github.com/capacitor-community/electron)) | jeder Browser; Fähigkeiten je Engine verschieden | iOS, Android in-tree; Windows/macOS von Microsoft; Web und Linux (Skia) nur Community ([RN](https://reactnative.dev/docs/out-of-tree-platforms)) | Android, iOS, Windows, macOS, Linux, Web ([Flutter](https://docs.flutter.dev/reference/supported-platforms)) |
| Engine für Dokumentinhalt | WebView2 / WKWebView / WebKitGTK / Android WebView ([Tauri](https://v2.tauri.app/reference/webview-versions/)) | gebündeltes Chromium | WKWebView / Android WebView (Mindestversion 55, Standard 60, [Config](https://capacitorjs.com/docs/config)) | Browser des Nutzers | zusätzliche WebView nötig: `react-native-webview` für iOS, Android, Windows, macOS ([GitHub](https://github.com/react-native-webview/react-native-webview)) | zusätzliche WebView nötig: `webview_flutter` nur Android, iOS, macOS, **nicht** Windows, Linux, Web ([pub.dev](https://pub.dev/packages/webview_flutter)) |
| Paketgröße | „A minimal Tauri app can be less than 600KB“ ([Tauri](https://v2.tauri.app/start/)); Benchmark: ≈ 3 MB Windows, ≈ 4 MB Linux, ≈ 5 MB macOS (**Sekundärquelle**, Messmethode nicht offengelegt, [Elanis](https://github.com/Elanis/web-to-desktop-framework-comparison)) | Benchmark: ≈ 385 MB Windows, ≈ 296 MB Linux, ≈ 320 MB macOS arm64 (**Sekundärquelle**, ebd.); typisch „50–150MB+“ Installer (**Sekundärquelle**, [pkgpulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)) | nicht belegt | keine Installation; Speicherquote in WebKit für Nicht-Browser-Apps bis 15 % des Datenträgers je Origin ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)) | nicht belegt | Demo-App iOS 5,4 MB komprimiert, Stand Flutter 1.17 ([Flutter](https://docs.flutter.dev/perf/app-size)); Windows ≈ 25 MB (**Sekundärquelle**, [Elanis](https://github.com/Elanis/web-to-desktop-framework-comparison)) |
| Sprache der Hülle | Rust; Mobil-Plugins in Kotlin und Swift ([Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/)) | JavaScript/Node.js | TypeScript; Plugins in Swift und Kotlin | TypeScript | JavaScript/TypeScript + nativ | Dart |
| Version / Zyklus | 2.12.3 vom 10.10.2026 ([Releases](https://github.com/tauri-apps/tauri/releases)); 2.0 stabil seit 02.10.2024 ([Blog](https://v2.tauri.app/blog/tauri-20/)) | neue Hauptversion alle 8 Wochen, drei Versionen unterstützt ([Electron](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)); aktuell 44 (Chromium M152), 45 geplant für 20.10.2026 ([Schedule](https://releases.electronjs.org/schedule)) | v8 aktiv, `@capacitor/core` 8.5.3 vom 07.10.2026 ([npm](https://registry.npmjs.org/@capacitor/core)) | Browser-Zyklen | – | Flutter 3.47 (laut Plattformseite) |
| Mobil-Reife | „We are not completely happy about the developer experience“; „On mobile not all of the official plugins are supported“ ([Tauri 2.0](https://v2.tauri.app/blog/tauri-20/)) | – | Kernzweck des Projekts | auf iOS am schwächsten (siehe 2.2) | Kernzweck | Kernzweck |

### 2.2 Systemzugriff je Technologie

„Plugin“ heißt offizielles Plugin. „Eigen“ heißt: ein eigener nativer Adapter (Swift, Kotlin oder
Rust) ist zu schreiben, was in jeder Hülle außer PWA möglich ist.

| Fähigkeit | Tauri 2 | Electron | Capacitor | PWA |
|---|---|---|---|---|
| Dateisystem | Plugin `fs` auf allen 5 Zielen; mobil „restricted to Application folder by default“ ([Tauri](https://v2.tauri.app/plugin/file-system/)); Dialog mobil ohne Ordnerauswahl ([Tauri](https://v2.tauri.app/plugin/dialog/)) | voll (Node.js) | Plugin `Filesystem`: App-Ordner; Android 11+ nur selbst erstellte Dateien in Documents ([Capacitor](https://capacitorjs.com/docs/apis/filesystem)) | OPFS überall; echte Dateien nur Chromium (A4) |
| Dateizuordnung `.hpro` | `fileAssociations` für alle Plattformen, Android über Intent-Filter mit `mimeType` ([Tauri Config](https://v2.tauri.app/reference/config/)) | über Packager (nicht recherchiert) | in den nativen Projektdateien (eigene Einschätzung) | nur Chromium Desktop (A3) |
| Schlüssel/Secrets | kein offizielles Keychain-Plugin; `stronghold` (IOTA Stronghold) auf allen 5 Zielen ([README](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/stronghold/README.md)); Keychain/Keystore eigen | `safeStorage`: macOS Keychain, Windows DPAPI, Linux kwallet/libsecret; ohne Secret-Store Klartext-Rückfall `basic_text` ([Electron](https://www.electronjs.org/docs/latest/api/safe-storage)) | kein offizielles Plugin in der API-Liste ([Capacitor](https://capacitorjs.com/docs/apis)); eigen | nur nicht exportierbare `CryptoKey` in IndexedDB; kein OS-Schlüsselbund |
| Smartcard PC/SC, PKCS#11 | Desktop über Rust-Crates `pcsc` („Tested on Linux, Windows, macOS“, [GitHub](https://github.com/bluetech/pcsc-rust)) und `cryptoki` ([GitHub](https://github.com/parallaxsecond/rust-cryptoki)); mobil eigen | Node-Modul `pkcs11js` (2.1.7 vom 28.07.2026, [npm](https://registry.npmjs.org/pkcs11js)) | eigen (CryptoTokenKit / USB, siehe 2.3) | nicht möglich (A1) |
| NFC | Plugin `nfc` nur Android/iOS, NDEF und Tag-Scan; ISO-DEP/APDU nicht dokumentiert ([Tauri](https://v2.tauri.app/plugin/nfc/)) | – | kein offizielles Plugin | Web NFC nur Chrome Android 89+, **nur NDEF**, kein APDU ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API); BCD) |
| Kamera / Scan | Plugin `barcode-scanner` (nur Barcodes, mobil); Dokumentscan eigen | `getUserMedia` | Plugin `Camera`; Dokumentscan eigen | `getUserMedia` ab Safari iOS 11, Chrome 53 (BCD) |
| Drucken | `window.print()` laut Tauri überall; natives `print()` nur macOS ([docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html)); Android siehe A10 | `print()` und `printToPDF()` mit experimentellem `generateTaggedPDF` ([Electron](https://www.electronjs.org/docs/latest/api/web-contents)) | kein offizielles Druck-Plugin | `window.print()` überall (BCD); in Sandbox-iframes nur mit `allow-modals` |
| Zwischenablage | Plugin: Desktop Text/HTML/Bild, mobil nur Text (A11) | voll | Plugin `Clipboard` | Async Clipboard API; Chromium mit Berechtigung, Firefox/Safari mit Einfüge-Menü ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)) |
| Hintergrund | Desktop frei; mobil eigen | frei | `Background Runner`: iOS ca. 30 s je Aufruf, Android ≥ 15 min Intervall, kein DOM ([Capacitor](https://capacitorjs.com/docs/apis/background-runner)) | Service Worker; Background Sync nur Chromium (A5) |
| Sidecar (Python/Java-Dienste) | Desktop über `externalBin` ([Tauri](https://v2.tauri.app/develop/sidecar/)); mobil nein (A2) | `child_process` | nein | nein |
| Updates | Plugin `updater` nur Desktop ([README](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/README.md)) | `autoUpdater` (im MAS-Build deaktiviert) | Store | automatisch |

**React Native und Flutter** bekommen hier keine eigene Spalte. Ihr Systemzugriff ist mobil gut, aber
der Dokumentinhalt liefe ohnehin in einer WebView. Alle WebView-Fragen (Sandbox, Druck, Engine)
blieben also bestehen, und dazu käme eine zweite UI-Technologie (Abschnitt 2.6).

### 2.3 Signaturfähigkeit

| Weg | Rechtsqualität | Web/PWA | Desktop (Tauri/Electron) | iOS | Android |
|---|---|---|---|---|---|
| **Fernsignatur über CSC API** (QTSP hält den Schlüssel) | QES | ja (Netz; OAuth-Ablauf im Browser) | ja | ja | ja |
| **ID Austria** (QES über A-Trust) | QES | ja, als Fernsignatur. Zweiter Faktor über App „Digitales Amt“ oder FIDO-Token (**Sekundärquelle**, Suchauszug); FIDO-Token ist nur der Freigabefaktor, nicht der Signaturschlüssel (eigene Einordnung). Laut Wien: ohne Smartphone mit SMS-fähigem Telefon plus FIDO-Sicherheitsschlüssel ([wien.gv.at](https://www.wien.gv.at/spezial/foerderhandbuch/e-government/elektronische-eigenhandige-unterschriften-mit-id-austria-elektronischer-identitatsnachweis-e-id-oder-primesign/)) | ja | ja | ja |
| A-Trust als Integrationspartner | QES | A-Trust: „Through the international Cloud Signature Consortium (CSC) interface, your customers can integrate signature functions“ ([A-Trust](https://www.a-trust.at/en/products/signature_solutions_for_companies/cooperation/)); Konditionen **OFFENE FRAGE** | ← | ← | ← |
| **Deutscher Personalausweis (eID)** | **keine Signatur**, sondern Authentisierung | AusweisApp SDK für Android, iOS, Desktop; dokumentiert sind Authentisierung (`RUN_AUTH`) und PIN-Änderung ([AusweisApp SDK](https://www.ausweisapp.bund.de/sdk)) | ja (SDK) | ja (SDK) | ja (SDK) |
| eID → QES beim QTSP | QES | Beispiel D-Trust sign-me: Identifizierung per Online-Ausweis, dann Fernsignatur (**Sekundärquelle**, Suchauszug aus [D-Trust Produktblatt](https://www.d-trust.net/files/dokumente/pdf/produktblatt_sign-me.pdf)) | wie Fernsignatur | ← | ← |
| **Smartcard + Kartenleser** (PC/SC, PKCS#11) | QES möglich (QSCD) | **nein** (A1) | ja (`pcsc`, `cryptoki`, `pkcs11js`) | eingeschränkt: NFC nur für deklarierte AIDs ([Apple](https://developer.apple.com/documentation/corenfc/nfciso7816tag)); `TKSmartCardSlotManager` braucht das Entitlement `com.apple.security.smartcard` ([Apple](https://developer.apple.com/documentation/cryptotokenkit/tksmartcardslotmanager)); ob USB-Leser auf iPhone/iPad für Dritt-Apps praktisch nutzbar sind: **OFFENE FRAGE** | eingeschränkt: NFC `IsoDep` sendet APDUs ([Android](https://developer.android.com/reference/android/nfc/tech/IsoDep)); USB-Leser **OFFENE FRAGE** |
| **Geräteschlüssel** (Secure Enclave, Android Keystore/StrongBox, TPM) | AdES, **nicht qualifiziert** | nein | macOS: Secure Enclave (Apple Silicon oder Touch-ID-Macs), nur P-256 ([Apple](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)); Windows TPM/CNG: nicht recherchiert | Secure Enclave, nur P-256 | Keystore, Schlüssel „never exposed outside of secure hardware“; StrongBox ab Android 9, RSA 2048 / P-256 ([Android](https://developer.android.com/privacy-and-security/keystore)) |
| **Software-Zertifikat** (PKCS#12-Import) | AdES | ja (WebCrypto), Schlüsselschutz schwach | ja | ja | ja |
| **WebAuthn / Passkeys** | **keine Dokumentsignatur** | WebAuthn dient dazu, „strongly authenticating users“ gegenüber einer Relying Party, die Schlüssel sind auf sie beschränkt ([W3C WebAuthn L3](https://www.w3.org/TR/webauthn-3/)) | – | – | – |
| **EUDI-Wallet** | QES (Pflicht nach Art. 5a eIDAS) | Wallet bis 24.12.2026 je Mitgliedstaat; QES kostenlos für nicht-berufliche Zwecke (**Sekundärquelle**, [Garrigues](https://www.garrigues.com/en_GB/garrigues-digital/european-digital-identity-wallet-now-has-timetable-tasks-be-completed-december)); deutsche Wallet zum Start laut Presse ohne QES ([Notiz B](quellen/recherche-b-recht-vertrauen-barrierefreiheit.md)); Anbindung für Dritt-Apps **OFFENE FRAGE** | ← | ← | ← |
| Web eID (Erweiterung + nativer Host) | AdES/QES mit eID-Karten | nur Desktop-Browser: Windows, macOS 14+, Ubuntu; mobil nicht erwähnt ([web-eid.eu](https://web-eid.eu/)) | – | – | – |

**Folgerung:** Der Standardweg für QES ist auf allen Plattformen die **Fernsignatur**. Lokale
Kartensignatur ist eine Desktop-Zusatzfunktion. Geräteschlüssel eignen sich für AdES (z. B.
Freigaben im Unternehmen) und für den Schutz lokaler Geheimnisse, nicht für QES.

### 2.4 Auslieferung über Stores

| Store | Regel | Folge für hpro |
|---|---|---|
| **Apple App Store (iOS)** | 4.2: App muss mehr sein als „a repackaged website“; 2.5.6: Web-Inhalte nur mit WebKit; 2.5.2: kein Laden oder Ausführen von Code, „which introduces or changes features or functionality“; 4.7: HTML5/JS-„mini apps“ sind erlaubt, aber 4.7.2 verbietet, ihnen native APIs ohne Erlaubnis zugänglich zu machen ([Apple](https://developer.apple.com/app-store/review/guidelines/)) | 4.2 ist mit lokalen Dateien, Scan, Signatur und Offline-Betrieb nach eigener Einschätzung unkritisch. Die Komponentenbibliothek wird **im App-Paket ausgeliefert**. Komponenten aus Dokumenten laufen nur, wenn ihr Hash einer mitgelieferten Version entspricht, sonst greift der Fallback (passt zu [03, 2.4](03-konzept.md#24-sicherheit-wie-verhindert-man-dass-dokumente-schadsoftware-werden)). Ob signierte Komponenten-Updates **außerhalb** eines App-Updates zulässig sind: **OFFENE FRAGE** (2.5.2 vs. 4.7) |
| **Apple, EU (DMA)** | alternative Engines nur für Browser-Apps und In-App-Browsing; ausdrücklich nicht für „content embedded within or only obtainable via the app“ ([Apple](https://developer.apple.com/support/alternative-browser-engines/)) | Chromium auf iOS bleibt für hpro ausgeschlossen; A6 bleibt bestehen |
| **Mac App Store** | Tauri: App Sandbox nötig ([Tauri](https://v2.tauri.app/distribute/app-store/)); Electron-MAS: `autoUpdater` deaktiviert, „certain accessibility features may not work“ ([Electron](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)) | Sidecars in der Sandbox: **OFFENE FRAGE**; Direktvertrieb (notarisiert) als Alternative |
| **Google Play** | verboten sind Apps, die „a webview of a website without permission“ zeigen ([Google](https://support.google.com/googleplay/android-developer/answer/9899034)) | trifft hpro nicht. Tauri baut AAB, Mindest-SDK 24 ([Tauri](https://v2.tauri.app/distribute/google-play/)) |
| **Google Play, PWA** | Trusted Web Activity: Inhalt wird vom installierten Browser gerendert ([Chrome](https://developer.chrome.com/docs/android/trusted-web-activity)) | möglich, aber ohne native Adapter (Scanner, Druck, NFC) |
| **Microsoft Store, PWA** | Paket mit PWABuilder ohne Codeänderung; Manifeständerungen (z. B. `file_handlers`) verlangen ein neues Paket ([Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store)) | günstiger Einstieg für Windows |
| **Microsoft Store, Tauri** | nur EXE/MSI, Store-Eintrag verlinkt den Installer; WebView2 als Offline-Installer, stille Installation `/S` ([Tauri](https://v2.tauri.app/distribute/microsoft-store/)) | machbar |

### 2.5 Barrierefreiheit der Hülle

| Hülle/Plattform | Zugang für Hilfstechnik | Beleg / Status |
|---|---|---|
| Electron (alle Desktops) | Chromium-Accessibility-Baum, automatisch aktiv bei Hilfstechnik | [Electron](https://www.electronjs.org/docs/latest/tutorial/accessibility) |
| WebView2 (Windows, Tauri) | UI-Automation-Provider der WebView2 (**Sekundärquelle**, Suchauszug Microsoft Learn); offene Tauri-Fehler: NVDA liest nicht in rahmenlosen Fenstern ([#12901](https://github.com/tauri-apps/tauri/issues/12901)); eine Regression nach Fensterwechsel wurde 2026 geschlossen ([#15624](https://github.com/tauri-apps/tauri/issues/15624)) | Tracking-Issue seit 2019 offen ([#207](https://github.com/tauri-apps/tauri/issues/207)) |
| WKWebView (macOS, iOS) | VoiceOver über WebKit. Ein blinder Entwickler schreibt, Tauri sei „basically as accessible as the underlying web view“ (**Sekundärquelle**, [#207](https://github.com/tauri-apps/tauri/issues/207)) | Prüfung im Prototyp |
| WebKitGTK (Linux, Tauri) | AT-SPI statt ATK; Orca-Qualität offen (A13) | [WebKit](https://bugs.webkit.org/show_bug.cgi?id=238198); [GNOME](https://blogs.gnome.org/tbernard/?p=10486) |
| Android WebView (Tauri, Capacitor) | Chromium bildet den Web-Baum über `AccessibilityNodeProvider` als virtuelle Views für TalkBack ab | [Chromium](https://chromium.googlesource.com/chromium/src/+/4b55a94de2b88d079652b5bc369868ccea532957/docs/accessibility/browser/android.md) |
| PWA | Accessibility des jeweiligen Browsers | – |
| Flutter (Web) | Semantics-Baum; im Web **standardmäßig aus**, Aktivierung über unsichtbaren Button oder `ensureSemantics()` | [Flutter](https://docs.flutter.dev/ui/accessibility/web-accessibility) |

Für hpro zählt vor allem, dass der **Dokumentinhalt** über den nativen Accessibility-Baum der
Engine erreichbar bleibt. Das ist bei allen WebView-Hüllen grundsätzlich der Fall. Bei Flutter und
React Native käme eine zweite Accessibility-Welt für die Bedienoberfläche hinzu.

### 2.6 Bewertung

Die Bewertung ist eine **eigene Einschätzung** auf Basis der Belege oben
(++ sehr gut, + gut, o neutral, – schwach, –– ungeeignet).

| Kriterium (Gewicht) | Tauri 2 | Electron | Capacitor | PWA | React Native | Flutter |
|---|---|---|---|---|---|---|
| Eine Hülle für alle 5 nativen Ziele (hoch) | ++ | –– (kein Mobil) | – (kein Desktop) | o (keine Hülle) | o (kein Linux) | + |
| TS-Web-Kern unverändert nutzbar (hoch) | ++ | ++ | ++ | ++ | – (UI neu, Doku in WebView) | –– (Dart, Doku in WebView) |
| Einheitliche Engine (hoch) | – | ++ | – | – | – | – |
| Paketgröße (mittel) | ++ | –– | o (nicht belegt) | ++ | o | o |
| Systemzugriff Desktop (hoch) | ++ | ++ | –– | – | o | + |
| Systemzugriff Mobil (hoch) | o (Plugins lückenhaft) | –– | + | – | + | + |
| Signatur lokal (mittel) | + | + | o | –– | o | o |
| Reife/Wartbarkeit (hoch) | o (Mobil jung) | + (aber 8-Wochen-Takt) | + | ++ | + | + |
| Store-Auslieferung (mittel) | + | + (Desktop) | + | o | + | + |
| Barrierefreiheit der Hülle (hoch) | o (Linux offen) | + | + | ++ | + | o (Web opt-in) |

### 2.7 Empfehlung

1. **Kern:** eine TypeScript-Web-App wie im Konzept. Container, Signaturprüfung, Editor und
   Prüfungen liegen vollständig im Kern. Native Teile sind nur **Adapter** hinter Schnittstellen
   (Abschnitt 4.1).
2. **Web/PWA:** dieselbe App als PWA. Sie ist der Referenz-Reader ohne Installation und die
   Rückfallebene für alle Plattformen, mit den Ausnahmen A1–A5 und A8.
3. **Desktop: Tauri 2.** Kleine Pakete, Rust für PC/SC und PKCS#11, Sidecars für WeasyPrint,
   Docling und DSS, Dateizuordnung auf allen drei Systemen.
4. **Mobil: Tauri 2, mit Capacitor als vorbereiteter Alternative.** Für Tauri spricht eine
   Konfiguration, ein Rust-Teil und ein Capability-Modell für alle nativen Ziele. Die eigentliche
   Mobilarbeit (Scanner, OCR, Druck, Vorlesen, Keystore, NFC) ist **in beiden Hüllen** eigener
   Swift- und Kotlin-Code; Capacitors Vorsprung liegt nur bei Kamera, Dateisystem und
   Hintergrund-Plugins. Dagegen spricht die von Tauri selbst eingeräumte Mobil-Unreife (A7, fehlende
   stabile Multi-Webview). **Entscheidung nach einem Spike** (Abschnitt 4.4).
5. **Electron als Gegenvorschlag, fair:** Wenn die Engine-Testsuite zeigt, dass WebKit oder
   WebKitGTK die Darstellungs- oder Barrierefreiheitsanforderungen nicht erfüllt, ist Electron auf
   dem Desktop die bessere Wahl. Es bietet dann eine Engine auf drei Systemen, Tagged-PDF-Export über
   `printToPDF` und den Chromium-Accessibility-Baum. Der Preis: Pakete im Bereich hunderter MB, ein
   Update-Takt von 8 Wochen und eine zweite Hülle für Mobil. Für iOS ändert Electron ohnehin nichts,
   weil dort WebKit Pflicht ist (A6).

---

## 3. Funktionsmatrix

### 3.1 Legende und Annahmen

- **V** verfügbar · **E** eingeschränkt · **N** nicht möglich · **V(N)** verfügbar mit Netz/Dienst,
  auf allen Plattformen gleich · Ziffern = Anmerkung in 3.2.
- **Web/PWA** = aktuelle Browser; wo Chromium und Safari/Firefox sich unterscheiden, gilt die
  schwächere Variante (E) und die Anmerkung nennt den Unterschied.
- **Windows, macOS, Linux, iOS, Android** = native Hülle nach Empfehlung (Tauri 2) mit eigenen
  Adaptern. „V“ kann also Adapteraufwand bedeuten (Abschnitt 4).
- Gruppen nach [02](02-acrobat-pro-funktionsumfang.md).

| Gruppe / Funktion | Web/PWA | Windows | macOS | Linux | iOS | Android |
|---|---|---|---|---|---|---|
| **1 Anzeigen und Lesen** | | | | | | |
| 1a Rendern, Umfließen, Suche, Themes | V ¹ | V ¹ | V ¹ | V ¹ | V ¹ | V ¹ |
| 1b Vorlesen (Systemstimmen) | V ² | V ² | V ² | E ² | V ² | E ² |
| 1c `.hpro` per Doppelklick/Teilen öffnen | E ³ | V ³ | V ³ | V ³ | V ³ | E ³ |
| **2 Bearbeiten** | | | | | | |
| 2a Semantischer Editor, Bilder, Tabellen | V | V | V | V | V ⁴ | V ⁴ |
| 2b Am Ort speichern | E ⁵ | V | V | V | V ⁵ | V ⁵ |
| 2c Zwischenablage mit Formatierung | E ⁶ | V | V | V | E ⁶ | E ⁶ |
| **3 Scannen und OCR** | | | | | | |
| 3a Kamera-Dokumentscan (Kanten, Entzerrung) | E ⁷ | E ⁷ | E ⁷ | E ⁷ | V ⁷ | V/E ⁷ |
| 3b OCR lokal (Text) | E ⁸ | V ⁸ | V ⁸ | E ⁸ | V ⁸ | V ⁸ |
| 3c Strukturerkennung (Docling) lokal | N → V(N) ⁹ | V ⁹ | V ⁹ | V ⁹ | N → V(N) ⁹ | N → V(N) ⁹ |
| **4 Kommentieren und Review** | | | | | | |
| 4a Kommentare, Markierungen, Vorschläge | V | V | V | V | V | V |
| 4b Vergleich auf Textebene | V | V | V | V | V | V |
| 4c Review-Tracking, gemeinsamer Stand | V(N) | V(N) | V(N) | V(N) | V(N) | V(N) |
| **5 Formulare** | | | | | | |
| 5a Ausfüllen, Berechnung, Validierung | V | V | V | V | V | V |
| 5b Datensammlung, CSV-Export | V ⁵ | V | V | V | V | V |
| **6 Signaturen** | | | | | | |
| 6a Einfache Signatur (Bild + Name + Zeit) | V | V | V | V | V | V |
| 6b Signaturprüfung kryptografisch | V | V | V | V | V | V |
| 6c Volle Validierung (LOTL, OCSP/CRL, Bericht wie DSS) | E ¹⁰ | V ¹⁰ | V ¹⁰ | V ¹⁰ | E ¹⁰ | E ¹⁰ |
| 6d AdES mit Software-Zertifikat | E ¹¹ | V | V | V | V | V |
| 6e AdES mit Geräteschlüssel (SE, Keystore, TPM) | N ¹² | E ¹² | V ¹² | N ¹² | V ¹² | V ¹² |
| 6f QES Fernsignatur (CSC, ID Austria, sign-me) | V(N) ¹³ | V(N) | V(N) | V(N) | V(N) | V(N) |
| 6g QES lokal mit Karte und Leser | N ¹⁴ | V ¹⁴ | V ¹⁴ | V ¹⁴ | E ¹⁴ | E ¹⁴ |
| 6h eID-Authentisierung (Personalausweis) | **OFFEN** ¹⁵ | V ¹⁵ | V ¹⁵ | V ¹⁵ | V ¹⁵ | V ¹⁵ |
| 6i QES über EUDI-Wallet | E ¹⁶ | E ¹⁶ | E ¹⁶ | E ¹⁶ | E ¹⁶ | E ¹⁶ |
| 6j Qualifizierter Zeitstempel | V(N) | V(N) | V(N) | V(N) | V(N) | V(N) |
| **7 Sicherheit** | | | | | | |
| 7a Verschlüsselung (Passwort, Zertifikat) | V | V | V | V | V | V |
| 7b Schwärzen, Bereinigen | V | V | V | V | V | V |
| 7c Dokument-Sandbox (iframe, CSP, keine Brücke) | V ¹⁷ | V ¹⁷ | V ¹⁷ | E ¹⁷ | V ¹⁷ | E ¹⁷ |
| 7d Geheimnisse im Systemspeicher | E ¹⁸ | V ¹⁸ | V ¹⁸ | E ¹⁸ | V ¹⁸ | V ¹⁸ |
| **8 Zusammenführen, Export, Konvertierung** | | | | | | |
| 8a Zusammenführen, Aufteilen, EPUB/HTML-Export | V | V | V | V | V | V |
| 8b Schneller PDF-Export (Engine) | E ¹⁹ | V ¹⁹ | V ¹⁹ | **OFFEN** ¹⁹ | V ¹⁹ | E ¹⁹ |
| 8c PDF/A + PDF/UA (WeasyPrint + veraPDF) | N → V(N) ⁹ | V ⁹ | V ⁹ | V ⁹ | N → V(N) ⁹ | N → V(N) ⁹ |
| 8d DOCX/ODT-Export | **OFFEN** | **OFFEN** | **OFFEN** | **OFFEN** | **OFFEN** | **OFFEN** |
| **9 Barrierefreiheit** | | | | | | |
| 9a Prüfung mit Bericht (axe-core + geführt) | V | V | V | V | V | V |
| 9b Screenreader-Zugang zu Hülle und Dokument | V ²⁰ | V ²⁰ | V ²⁰ | E ²⁰ | V ²⁰ | V ²⁰ |
| **10 Zusammenarbeit und Cloud** | | | | | | |
| 10a Teilen als Datei (Teilen-Dialog, Mail) | V ²¹ | V | V | V | V ²¹ | E ²¹ |
| 10b Sync, Echtzeit (CRDT) | V(N) | V(N) | V(N) | V(N) | V(N) | V(N) |
| **11 KI** | | | | | | |
| 11a KI über Dienst | V(N) | V(N) | V(N) | V(N) | V(N) | V(N) |
| 11b KI lokal | **OFFEN** ²² | E ²² | E ²² | E ²² | **OFFEN** ²² | **OFFEN** ²² |
| **12 Automatisierung** | | | | | | |
| 12a CLI, Stapel über Ordner | N ²³ | V ²³ | V ²³ | V ²³ | N ²³ | N ²³ |
| 12b Stapel in der App (Vordergrund) | V ²³ | V | V | V | V | V |
| 12c Hintergrundverarbeitung | E ²⁴ | V | V | V | E ²⁴ | E ²⁴ |
| **13 Druck und Druckvorstufe** | | | | | | |
| 13a Drucken (Bürodruck) | V ²⁵ | V ²⁵ | V ²⁵ | V ²⁵ | V ²⁵ | E ²⁵ |
| 13b PDF/X, Druckvorstufe | N → V(N) ²⁶ | E ²⁶ | E ²⁶ | E ²⁶ | N → V(N) ²⁶ | N → V(N) ²⁶ |

### 3.2 Anmerkungen zur Matrix

1. **Engine je Plattform verschieden** (A6): Chromium unter Windows und Android, WebKit unter macOS
   und iOS, WebKitGTK unter Linux in der Version der Distribution. WebView2 aktualisiert sich selbst,
   WebKit auf macOS nur mit OS-Updates ([Tauri](https://v2.tauri.app/reference/webview-versions/)).
   Im Web entscheidet der Browser. Folge: konservatives CSS-Profil und dieselbe Testsuite auf allen
   Engines.
2. `SpeechSynthesis`: Chrome 33, Firefox 49, Safari/iOS 7, iOS-WebView 7, **Android-WebView nein**
   (BCD). Android braucht einen nativen TTS-Adapter. Für WebKitGTK gibt es keine BCD-Angabe; daher
   E. Die Qualität deutscher Stimmen ist offen (siehe [02, Offene Fragen 7](02-acrobat-pro-funktionsumfang.md#offene-fragen)).
3. Web: File Handling nur Chrome/Edge Desktop ab 102 und nur installiert (A3). Native Hüllen:
   Tauri `fileAssociations` mit macOS/iOS-UTType und Android-Intent-Filter
   ([Tauri Config](https://v2.tauri.app/reference/config/); [Apple UTType](https://developer.apple.com/documentation/uniformtypeidentifiers/defining-file-and-data-types-for-your-app)).
   Android: Die Zuordnung läuft über `mimeType`. Ob eine eigene Endung `.hpro` aus Mail oder
   Dateimanager zuverlässig ankommt, ist **nicht belegt** (Prototyp).
4. Touch-Bedienung des Editors ist UX-Aufwand und keine Plattformgrenze.
5. Web: `showSaveFilePicker` nur Chrome/Edge 86+ und Chrome Android 132+; Firefox und Safari laden
   eine neue Datei herunter (BCD). iOS: Dokumentauswahl, Tauri-Dialog ohne Ordnerauswahl
   ([Tauri](https://v2.tauri.app/plugin/dialog/)). Android: Storage Access Framework mit dauerhaften
   URI-Rechten; seit Android 11 ist die Ordnerwahl für Download und Speicherwurzel gesperrt
   ([Android](https://developer.android.com/training/data-storage/shared/documents-files)).
6. Async Clipboard: Chromium verlangt für Lesen die Berechtigung `clipboard-read`, Firefox und
   Safari zeigen ein Einfüge-Menü ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)).
   In iframes braucht es die Permissions-Policy (ebd.). Das betrifft die Sandbox: Kopieren muss die
   Reader-Oberfläche erledigen, nicht das Dokument. Tauri-Plugin mobil nur Text (A11); die
   WebView-API (`ClipboardItem` iOS 13.4, Android-WebView 84) ist auf Geräten zu prüfen.
7. Nativer Dokumentscan: iOS VisionKit `VNDocumentCameraViewController` ab iOS 13
   ([Apple](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller));
   Android ML Kit Document Scanner, läuft auf dem Gerät, braucht Google Play-Dienste, API 21+ und
   ≥ 1,7 GB RAM, liefert JPEG und PDF ([Google](https://developers.google.com/ml-kit/vision/doc-scanner);
   [Android-Seite](https://developers.google.com/ml-kit/vision/doc-scanner/android)). Geräte ohne
   Play-Dienste: E. Web und Desktop: nur `getUserMedia` bzw. Bildimport; Kantenerkennung wäre eigener
   Code. Flachbettscanner am Desktop über System-Scan-Apps (TWAIN/WIA/ICA/SANE nicht recherchiert).
8. Tesseract.js: WASM, über 100 Sprachen, Apache-2.0, **keine PDF-Eingabe, keine Layoutanalyse**
   ([GitHub](https://github.com/naptha/tesseract.js)). Windows: `Windows.Media.Ocr` ab Windows 10,
   Sprachen nach installierten Sprachpaketen ([Microsoft](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine)).
   macOS/iOS: Vision `VNRecognizeTextRequest` ab macOS 10.15 / iOS 13
   ([Apple](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)); ob Deutsch
   unterstützt wird, ist hier **nicht belegt** (zur Laufzeit abfragbar). Android/iOS: ML Kit Text
   Recognition v2 mit lateinischer Schrift ([Google](https://developers.google.com/ml-kit/vision/text-recognition/v2)).
   Linux: Tesseract nativ oder als WASM, daher E. Speicherbedarf der Modelle: **nicht belegt**.
9. Python- und Java-Dienste (A2): lokal nur am Desktop als Sidecar
   ([Tauri Sidecar](https://v2.tauri.app/develop/sidecar/)). Web, iOS und Android nutzen den
   hpro-Dienst (selbst hostbar). Der Nutzer muss zustimmen, dass das Dokument das Gerät verlässt.
   Mobil verbietet Apple 2.5.2 nachgeladenen Code; mitgelieferte Python-Laufzeiten auf iOS wurden
   nicht untersucht (**OFFENE FRAGE**, eigene Einschätzung: unverhältnismäßig).
10. Volle Validierung braucht EU-Vertrauenslisten und Sperrinformationen, also Netz oder Cache
    ([03, 2.3](03-konzept.md#23-was-geht-ohne-server)). DSS ist Java und läuft als Sidecar am Desktop.
    Web und Mobil: entweder eigene Validierung in TypeScript (Aufwand, Konformität offen) oder
    DSS-Dienst. **OFFENE FRAGE** aus 03 bleibt.
    **Stand P2 (11.10.2026):** Die eigene TypeScript-Prüfung für Niveau B liegt im Kern vor
    (`TsValidator`) und urteilt in 39 von 39 Testfällen wie DSS 6.5
    ([Belege P2](belege/P2/README.md)); offen bleiben Vertrauenslisten, Sperrinformationen und
    Zeitstempel (Frage 12 in Abschnitt 5).
11. **Stand P3 (11.10.2026):** `SoftwareKeySigner` im Kern signiert mit einem WebCrypto-Schlüssel
    (RSA PKCS#1 v1.5 SHA-256, ECDSA P-256/P-384), DSS 6.5 bestätigt die Signaturen
    ([Belege P3](belege/P3/README.md)). **Befund:** WebCrypto kann **kein PKCS#12** importieren,
    nur PKCS#8. Der Weg „Software-Zertifikat (PKCS#12-Import)“ aus 2.3 braucht deshalb einen
    eigenen PKCS#12-Leser (PBES2/AES und für ältere Dateien 3DES/RC2), sonst muss der Nutzer den
    Schlüssel vorher umwandeln. Nicht umgesetzt.
    Web: Schlüssel als nicht exportierbarer `CryptoKey` in IndexedDB, ohne OS-Schutz. Safari löscht
    skriptbeschreibbaren Speicher nach 7 Tagen ohne Nutzung, installierte Home-Screen-Apps haben
    einen eigenen Zähler ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
    Ein so gespeicherter Schlüssel kann also verschwinden; Backup ist Pflicht.
12. Web: WebCrypto deckt Secure Elements nicht ab ([W3C](https://www.w3.org/TR/WebCryptoAPI/)).
    Secure Enclave: nur P-256 und nur auf passender Hardware ([Apple](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)).
    Android Keystore/StrongBox mit Attestierung ([Android](https://developer.android.com/privacy-and-security/keystore)).
    Windows TPM über CNG und Linux (TPM2/PKCS#11): nicht recherchiert, daher E bzw. N. Immer AdES,
    nie QES.
13. Fernsignatur ist plattformgleich. Im Web braucht der QTSP CORS oder einen Redirect-Ablauf
    (**OFFENE FRAGE** je Anbieter). Für A-Trust ist eine CSC-Schnittstelle beworben
    ([A-Trust](https://www.a-trust.at/en/products/signature_solutions_for_companies/cooperation/)).
14. Desktop: PC/SC und PKCS#11 über Rust oder Node, dazu die Middleware des Kartenherstellers. Web:
    nicht möglich (A1). iOS: NFC mit deklarierten AIDs; USB-Leser mit Entitlement, praktisch
    **offen**. Android: NFC `IsoDep`; das Tauri-NFC-Plugin dokumentiert nur NDEF, ein eigener
    Adapter ist nötig ([Tauri](https://v2.tauri.app/plugin/nfc/)).
15. eID ist **Authentisierung**, keine Signatur. AusweisApp SDK für Android, iOS und Desktop
    ([AusweisApp](https://www.ausweisapp.bund.de/sdk)). Für QES dient die eID nur zur Identifizierung
    beim QTSP (Zeile 6f). Im Web wäre der Weg über eine installierte AusweisApp denkbar, wurde aber
    **nicht geprüft**.
16. Wallets bis 24.12.2026 (**Sekundärquelle**, [Garrigues](https://www.garrigues.com/en_GB/garrigues-digital/european-digital-identity-wallet-now-has-timetable-tasks-be-completed-december)).
    Wie Dritt-Apps eine QES aus der Wallet anfordern, ist **OFFEN**. E bis dahin.
17. Web: iframe mit `sandbox="allow-scripts"` ohne `allow-same-origin` und eigene CSP
    ([03, 2.4](03-konzept.md#24-sicherheit-wie-verhindert-man-dass-dokumente-schadsoftware-werden)).
    Linux und Android unter Tauri: iframe-Anfragen sind vom Fenster nicht unterscheidbar (A7).
    Siehe 3.3.
18. Web: kein Systemschlüsselbund. Linux: Electron-Doku zeigt, dass ein Secret-Store fehlen kann
    (Rückfall auf Klartext `basic_text`, [Electron](https://www.electronjs.org/docs/latest/api/safe-storage)).
    Das gilt sinngemäß für jede Hülle unter Linux.
19. Windows: WebView2 `PrintToPdfAsync` ([Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/overview-features-apis));
    macOS/iOS: `WKWebView.createPDF` ab macOS 11 / iOS 14 ([Apple](https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:)));
    Electron: `printToPDF` mit experimentellem Tagged PDF. Android: nur über den Druckdialog
    (`createPrintDocumentAdapter`). Web: nur über den Druckdialog des Browsers, kein
    programmatischer Export. Linux (WebKitGTK): **nicht recherchiert**. Kein Weg garantiert PDF/A
    oder PDF/UA (**OFFENE FRAGE** aus 03).
20. Siehe 2.5. Linux E wegen offener Orca-Qualität (A13).
21. Web Share: Safari/iOS 12.2+, Chrome Android 61+, **nicht in der Android-WebView** (BCD). Die
    Android-Hülle braucht einen nativen Teilen-Adapter (in Capacitor als Plugin `Share` vorhanden,
    [Capacitor](https://capacitorjs.com/docs/apis); in Tauri nicht als offizielles Plugin gefunden).
22. Lokale Modelle (WebGPU/WASM im Browser, Sidecar am Desktop, Core ML/ML Kit mobil) wurden nicht
    recherchiert. Capacitor führt ein „Local LLM (experimental)“-Plugin ([Capacitor](https://capacitorjs.com/docs/apis)).
    Nicht im MVP.
23. CLI und Ordner-Stapel gibt es nur am Desktop (Rust- oder Node-Binärdatei mit dem Kern). Web und
    mobil: Stapel nur über ausgewählte Dateien in der laufenden App, im Web in Web Workers.
24. Web: Background Sync (Chrome 49) und Periodic Sync (Chrome 80) nur Chromium, nicht Firefox,
    Safari oder Android-WebView (BCD). iOS: `BGProcessingTask` nur im Leerlauf
    ([Apple](https://developer.apple.com/documentation/backgroundtasks/bgprocessingtask));
    `BGContinuedProcessingTask` ab iOS 26 für vom Nutzer gestartete Aufgaben mit
    Fortschrittsanzeige, vom System abbrechbar
    ([Apple](https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask)).
    Android: WorkManager für zuverlässige, auch lange Arbeit mit Vordergrund-Benachrichtigung
    ([Android](https://developer.android.com/develop/background-work/background-tasks/persistent)).
    Capacitor Background Runner: iOS ca. 30 s, kein DOM. Folge: Mobil sind Stapel wie
    „100 Dokumente signieren“ nur im Vordergrund verlässlich (A5).
25. `window.print()` in Browsern überall; in iframes seit Chrome 46 nur mit `allow-modals` (BCD).
    Die Sandbox darf das nicht erlauben, gedruckt wird aus der Reader-Oberfläche. iOS:
    `UIPrintInteractionController` ([Apple](https://developer.apple.com/documentation/uikit/uiprintinteractioncontroller)).
    Android-WebView: JavaScript löst keinen Druck aus (A10), nativer Adapter nötig.
26. PDF/X über Vivliostyle oder Prince ([02, Abschnitt 13](02-acrobat-pro-funktionsumfang.md#13-druckvorstufe-und-produktion)):
    Paketierung als Sidecar nicht recherchiert, daher E am Desktop; sonst Dienst.

### 3.3 Sandbox-Isolation je Plattform

| Plattform | Befund | Konsequenz (Vorschlag) |
|---|---|---|
| Web/PWA | Browser trennen opake Origins; die PWA hat keine native Brücke | iframe-Sandbox + CSP reicht |
| Windows, macOS, iOS (Tauri) | Tauri kann iframe-Anfragen unterscheiden (Umkehrschluss aus [Tauri](https://v2.tauri.app/security/capabilities/)) | iframe-Sandbox; Capabilities nur für das Hauptfenster |
| Linux, Android (Tauri) | „unable to distinguish between requests from an embedded `<iframe>` and the window itself“ ([Tauri](https://v2.tauri.app/security/capabilities/)); zusätzliche Webviews nur mit `unstable`, `on_new_window` mobil „Not supported“ ([docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html)) | (a) Hauptfenster bekommt **nur ungefährliche Befehle**; Datei- und Signaturbefehle prüfen im Rust-Teil zusätzlich eine Nutzerbestätigung. (b) Ob der Tauri-IPC aus einem `sandbox`-iframe mit opaker Origin praktisch erreichbar ist, muss der Prototyp **messen** (**OFFENE FRAGE**). (c) Wenn ja: unter Linux Electron oder eigenes Dokumentfenster; unter Android eigene Activity mit eigener WebView ohne Brücke (nativer Adapter) |
| Electron | `contextIsolation` und getrennte `WebContents` möglich (nicht vertieft recherchiert) | – |

---

## 4. Konsequenzen für Architektur und Roadmap

### 4.1 Kern und Adapter

Der Kern spricht ausschließlich mit **Schnittstellen**. Jede Plattform liefert Implementierungen.
Fehlt eine Implementierung, zeigt die Oberfläche die dokumentierte Ausnahme mit Ersatzweg.

| Schnittstelle | Web/PWA | Desktop (Tauri) | iOS | Android |
|---|---|---|---|---|
| `Storage` (öffnen, speichern, Bibliothek) | FS Access (Chromium), sonst Upload/Download; OPFS | `fs` + `dialog` | Dokumentauswahl, App-Container | SAF mit dauerhaften URI-Rechten |
| `Launch` (Dateizuordnung, Teilen-Empfang) | File Handling (Chromium Desktop), Share Target (Chromium) | `fileAssociations`, Single-Instance | UTType, „Öffnen in“ | Intent-Filter |
| `Signer` | `RemoteCscSigner`, `SoftwareKeySigner` | + `Pkcs11Signer`, `PcscSigner`, ggf. `PlatformKeySigner` (Secure Enclave/TPM) | + `PlatformKeySigner` (SE, P-256), `NfcCardSigner` (optional) | + `PlatformKeySigner` (Keystore/StrongBox), `NfcCardSigner` (optional) |
| `Validator` | `TsValidator` (Basis) oder `RemoteDssValidator` | `DssSidecarValidator` | wie Web | wie Web |
| `Scanner` | `CameraCapture` (getUserMedia) | Bildimport | `VisionKitScanner` | `MlKitScanner` |
| `Ocr` | `TesseractWasmOcr` | `WindowsOcr` / `VisionOcr` / `TesseractOcr` | `VisionOcr` | `MlKitOcr` |
| `PdfImport` | `RemoteDocling` | `DoclingSidecar` | `RemoteDocling` | `RemoteDocling` |
| `PdfExport` | `BrowserPrintPdf`, `RemoteWeasyPrint` | `WeasyPrintSidecar`, `EnginePdf` | `WkCreatePdf`, `RemoteWeasyPrint` | `AndroidPrintPdf`, `RemoteWeasyPrint` |
| `Print` | `window.print` | `window.print` | `UIPrintInteractionController` / `window.print` | `PrintManager` |
| `Speech` | Web Speech | Web Speech (Linux prüfen) | Web Speech | `TextToSpeech` |
| `Clipboard` | Async Clipboard | Plugin (HTML) | WebView-API, sonst Text | WebView-API, sonst Text |
| `Share` | Web Share | System-Teilen (eigen) | Web Share / Share Sheet | nativer Adapter |
| `SecretStore` | IndexedDB (`CryptoKey`) | Keychain/DPAPI/libsecret (eigen) | Keychain | Keystore |
| `Jobs` (Stapel, Hintergrund) | Web Worker, Vordergrund | CLI + Worker | Vordergrund, `BGContinuedProcessingTask` ab iOS 26 | WorkManager |

**Server-Komponente „hpro-Dienst“** (selbst hostbar, Vorschlag): PDF-Export (WeasyPrint +
veraPDF), PDF-Import (Docling), Validierung (DSS), optional Sync und KI. Sie ist die Bedingung dafür,
dass Web und Mobil bei Export, Import und Validierung **funktional gleich** sind, wenn auch nicht
offline. Dieselben Container-Images können am Desktop als Sidecar dienen (eigene Einschätzung;
Paketgröße der Python/Java-Sidecars **nicht gemessen**).

### 4.2 Aufwand (eigene Schätzung, Personenmonate)

Zusätzlich zum MVP aus [03, 6.2](03-konzept.md#62-aufwand-mvp-schätzung) (33–68 PM, Desktop + Web).
Überschneidungen mit den MVP-Paketen „Reader inkl. Hülle“ und „PDF-Export/-Import“ sind abgezogen,
soweit erkennbar.

| Paket | PM | Haupt-Unsicherheit |
|---|---|---|
| Desktop-Feinschliff: Dateizuordnung auf 3 OS, Signierung/Notarisierung, Store-Pakete, Sidecar-Paketierung | 2–4 | Größe und Sandbox-Verträglichkeit der Sidecars (Mac App Store) |
| Lokale Kartensignatur Desktop (PC/SC, PKCS#11, Middleware-Tests) | 1–3 | Kartenvielfalt |
| PWA-Spezifika (Service Worker, OPFS-Bibliothek, Chromium/Safari-Weichen, Store-Pakete MS/Play) | 1–2 | Safari-Speicherregeln |
| Mobil-Hüllen iOS + Android (Tauri-Spike, Grundgerüst, Speicher, Launch, Share, Store-Auslieferung) | 3–6 | Tauri-Mobil-Reife, Sandbox unter Android (A7) |
| Mobile Native Adapter: Scanner, OCR, Druck Android, TTS Android, Keystore/SE-Signer | 3–6 | Plugin-Qualität, Gerätevielfalt |
| NFC-Kartensignatur oder eID mobil (optional) | 1–3 | Entitlements, AIDs, Kartenprofile |
| hpro-Dienst (gehärteter Betrieb, Mandantentrennung, Datenschutz) | 2–4 | Betriebsmodell, DSGVO |
| Cross-Engine-Testsuite + Gerätelabor (6 Plattformen in CI) | 2–4 | Flakiness, Gerätekosten |
| Screenreader-Tests je Plattform (NVDA, VoiceOver macOS/iOS, Orca, TalkBack) | 1–3 | Linux-Befunde |
| **Summe** | **16–35** | davon Mobil (Hüllen + Adapter + NFC) **7–15** |

Zum Vergleich: [03, 6.3](03-konzept.md#63-aufwandsklassen-jenseits-des-mvp-richtung-acrobat-pro-umfang)
setzt „Mobile Apps“ in Klasse L (6–12 PM). Die Schätzung hier liegt etwas darüber, weil sie
Scanner, OCR, Druck und Vorlesen als native Adapter für **gleichen Funktionsumfang** mitzählt.

### 4.3 Roadmap (Vorschlag)

1. **MVP:** Web/PWA + Desktop (Tauri) mit Sidecars; Fernsignatur (ein QTSP), AdES mit
   Software- und Kartenschlüssel. Engine-Testsuite läuft von Anfang an in WebView2, WKWebView,
   WebKitGTK **und** Chromium (Electron als Messlatte).
2. **Spike Mobil (0,5–1 PM):** Tauri 2 auf iOS und Android mit Abbruchkriterien (4.4).
3. **Mobil-Ausbau:** Hüllen, native Adapter, hpro-Dienst für Export, Import und Validierung.
4. **Später:** NFC/eID mobil, EUDI-Wallet, lokale KI.

### 4.4 Abbruchkriterien für den Tauri-Mobil-Spike

Tauri bleibt für Mobil gesetzt, wenn **alle** Punkte erfüllt sind, sonst Capacitor:

1. Der Dokument-iframe unter Android erreicht nachweislich **keinen** Tauri-Befehl (A7).
2. `.hpro` öffnet sich aus Mail und Dateimanager (iOS „Öffnen in“, Android-Intent).
3. Ein eigenes Kotlin- und Swift-Plugin (z. B. Drucken, Scanner) lässt sich in ≤ 5 Personentagen
   anbinden, ohne ANR unter Android ([Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/)).
4. TalkBack und VoiceOver lesen Dokument und Oberfläche vollständig.
5. Store-Builds (AAB, IPA) bauen reproduzierbar in CI.

### 4.5 Risiken

| Risiko | Wirkung | Gegenmaßnahme | Rest |
|---|---|---|---|
| Engine-Unterschiede (WebKit Pflicht auf iOS, WebKitGTK-Versionen) | gleiche Datei sieht verschieden aus; Vertrauen in WYSIWYS | konservatives CSS-Profil, Testsuite, Signaturprofil mit linearer Zusammenfassung ([03, 5.2](03-konzept.md#52-what-you-see-is-what-you-sign--signaturprofil)) | mittel |
| Tauri Mobil unreif | Verzögerung, Eigenbau von Plugins | Spike mit Kriterien; Capacitor als Plan B | mittel |
| Sandbox unter Linux/Android | Dokument erreicht native Befehle | Messung, minimale Capabilities, eigene WebView | mittel bis hoch bis zur Messung |
| Server-Abhängigkeit bei Web/Mobil | Offline-Lücke bei Export/Import/Validierung; Datenschutz | selbst hostbar, ausdrückliche Zustimmung, TS-Validierung als Basis | mittel |
| Store-Regeln (Apple 2.5.2, 4.7) | Komponenten-Updates nur mit App-Update | Bibliothek im Paket, Hash-Bindung | gering bis mittel |
| QTSP-Zugang (CSC) | QES nicht plattformgleich verfügbar | früh mit A-Trust sprechen (03, 6.4) | mittel |
| Linux-Barrierefreiheit | EAA-Konformität der Linux-Version fraglich | Orca-Tests; Electron-Option | mittel |
| Testmatrix 6 Plattformen × Engines | Kosten, langsame Releases | CI mit Emulatoren + kleines Gerätelabor | mittel |

---

## 5. Offene Fragen

1. Erreicht ein `sandbox`-iframe mit opaker Origin unter Tauri/Linux und Tauri/Android den IPC? (A7, Prototyp)
2. Funktioniert `window.print()` in der Android-WebView unter Tauri, wie die Tauri-Doku sagt, oder gilt die Android-Doku? (A10)
3. Wie gut arbeitet Orca mit WebKitGTK (`webkit2gtk-4.1`) in einer Tauri-App? (A13)
4. Kommt eine eigene Endung `.hpro` unter Android zuverlässig per Intent an?
5. Darf eine iOS-App signierte Komponenten-Updates außerhalb eines App-Updates laden (Apple 2.5.2 vs. 4.7)?
6. Sind Python/Java-Sidecars im Mac App Store (App Sandbox) zulässig, und wie groß werden die Pakete?
7. Konditionen und CORS/Redirect-Fähigkeit der A-Trust-CSC-Schnittstelle für eine Web-App.
8. Wie fordern Dritt-Apps ab 2027 eine QES aus der EUDI-Wallet an (DE, AT)?
9. Sind USB-Kartenleser unter iOS/iPadOS und Android für Dritt-Apps praktisch nutzbar?
10. Windows-TPM (CNG) und Linux-TPM2 als Geräteschlüssel für AdES: Aufwand und Nutzen.
11. Unterstützt Apple Vision deutschsprachige Texterkennung, und welche Qualität liefern Windows-OCR, Vision, ML Kit und Tesseract.js im Vergleich?
12. Signaturvalidierung ohne Java im Web und mobil: eigene TypeScript-Validierung oder DSS-Dienst? (aus 03)
    **Teilweise beantwortet (P2, 11.10.2026):** Für XAdES-/CAdES-Baseline-B mit vorgegebenen
    Vertrauensankern reicht eine eigene TypeScript-Prüfung. Sie urteilt in 39 von 39 Fällen
    (47 Signaturen, darunter Manipulation, fehlende Datei, falscher Signaturwert, fremder Anker,
    ECDSA, CA-Kette) wie DSS 6.5, braucht nur WebCrypto und im Median etwa 3 ms je Container
    ([Belege P2](belege/P2/README.md)). Nicht abgedeckt sind EU-Vertrauenslisten, CRL/OCSP und
    Zeitstempel (B-T/LT/LTA). Eigene Einschätzung: **hybrid**. Integrität und Signaturwert prüft
    der Kern auf jedem Gerät und offline, den qualifizierten Status und die Langzeitprüfung bis auf
    Weiteres ein DSS-Dienst oder Sidecar. Ob sich Vertrauenslisten und OCSP in TypeScript lohnen,
    ist offen.
13. Paketgröße von Capacitor- und Tauri-Mobil-Apps (keine belastbaren Zahlen gefunden).
14. Programmatischer PDF-Export unter WebKitGTK (Linux).
15. Web eID-Weg (AusweisApp über Browser) für die PWA.

---

## 6. Quellen

Alle abgerufen am 11.10.2026. **(S)** = Sekundärquelle.

**Tauri**
- https://v2.tauri.app/start/
- https://v2.tauri.app/reference/webview-versions/
- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/reference/config/
- https://v2.tauri.app/develop/sidecar/
- https://v2.tauri.app/develop/plugins/develop-mobile/
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/blog/tauri-20/
- https://v2.tauri.app/plugin/file-system/ · https://v2.tauri.app/plugin/dialog/ · https://v2.tauri.app/plugin/clipboard/ · https://v2.tauri.app/plugin/shell/ · https://v2.tauri.app/plugin/nfc/ · https://v2.tauri.app/plugin/biometric/ · https://v2.tauri.app/plugin/barcode-scanner/
- https://github.com/tauri-apps/plugins-workspace (Plugin-READMEs, Branch v2: updater, stronghold u. a.)
- https://v2.tauri.app/distribute/microsoft-store/ · https://v2.tauri.app/distribute/app-store/ · https://v2.tauri.app/distribute/google-play/
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html · https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html
- https://github.com/tauri-apps/tauri/releases
- https://github.com/tauri-apps/tauri/issues/207 · https://github.com/tauri-apps/tauri/issues/12901 · https://github.com/tauri-apps/tauri/issues/15624

**Electron**
- https://github.com/electron/electron/blob/main/README.md
- https://www.electronjs.org/docs/latest/tutorial/electron-timelines · https://releases.electronjs.org/schedule
- https://www.electronjs.org/docs/latest/tutorial/accessibility
- https://www.electronjs.org/docs/latest/api/safe-storage
- https://www.electronjs.org/docs/latest/api/web-contents
- https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide

**Capacitor, React Native, Flutter**
- https://capacitorjs.com/docs · https://capacitorjs.com/docs/apis · https://capacitorjs.com/docs/config · https://capacitorjs.com/docs/main/reference/support-policy
- https://capacitorjs.com/docs/apis/filesystem · https://capacitorjs.com/docs/apis/background-runner
- https://github.com/capacitor-community/electron
- https://reactnative.dev/docs/out-of-tree-platforms · https://github.com/react-native-webview/react-native-webview
- https://docs.flutter.dev/reference/supported-platforms · https://docs.flutter.dev/perf/app-size · https://docs.flutter.dev/ui/accessibility/web-accessibility · https://pub.dev/packages/webview_flutter

**Größenvergleiche (S)**
- https://github.com/Elanis/web-to-desktop-framework-comparison (S)
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026 (S)

**Apple**
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/alternative-browser-engines/ · https://developer.apple.com/support/dma-and-apps-in-the-eu/
- https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave
- https://developer.apple.com/documentation/corenfc/nfciso7816tag · https://developer.apple.com/documentation/corenfc/nfctagreadersession
- https://developer.apple.com/documentation/cryptotokenkit/tksmartcard · https://developer.apple.com/documentation/cryptotokenkit/tksmartcardslotmanager
- https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller
- https://developer.apple.com/documentation/vision/vnrecognizetextrequest
- https://developer.apple.com/documentation/backgroundtasks/bgprocessingtask · https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask · https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados
- https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:)
- https://developer.apple.com/documentation/uikit/uiprintinteractioncontroller
- https://developer.apple.com/documentation/uniformtypeidentifiers/defining-file-and-data-types-for-your-app
- (Apple-Seiten über die JSON-Schnittstelle `developer.apple.com/tutorials/data/documentation/…` gelesen)

**WebKit, GNOME**
- https://webkit.org/blog/14403/updates-to-storage-policy/ · https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ · https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://bugs.webkit.org/show_bug.cgi?id=238198
- https://blogs.gnome.org/tbernard/?p=10486

**Google / Android / Chromium**
- https://developers.google.com/ml-kit/vision/doc-scanner · https://developers.google.com/ml-kit/vision/doc-scanner/android · https://developers.google.com/ml-kit/vision/text-recognition/v2
- https://developer.android.com/privacy-and-security/keystore
- https://developer.android.com/training/data-storage/shared/documents-files
- https://developer.android.com/develop/background-work/background-tasks/persistent
- https://developer.android.com/training/printing/html-docs
- https://developer.android.com/reference/android/nfc/tech/IsoDep
- https://support.google.com/googleplay/android-developer/answer/9899034
- https://developer.chrome.com/docs/android/trusted-web-activity · https://developer.chrome.com/docs/capabilities/web-apis/file-handling
- https://chromium.googlesource.com/chromium/src/+/4b55a94de2b88d079652b5bc369868ccea532957/docs/accessibility/browser/android.md

**Microsoft**
- https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine
- https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/overview-features-apis

**W3C, MDN, Web-Plattform**
- https://www.w3.org/TR/WebCryptoAPI/ · https://www.w3.org/TR/webauthn-3/
- https://github.com/WICG/web-smart-card/ · https://www.w3.org/events/meetings/5c9ab1dc-8be0-47ff-8012-c925b553d243/
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker · https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system · https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API · https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API · https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
- https://unpkg.com/@mdn/browser-compat-data/data.json (BCD 8.1.5)

**Signatur, eID**
- https://cloudsignatureconsortium.org/resources/csc-api-v2-2/
- https://www.a-trust.at/en/products/signature_solutions_for_companies/cooperation/
- https://www.wien.gv.at/spezial/foerderhandbuch/e-government/elektronische-eigenhandige-unterschriften-mit-id-austria-elektronischer-identitatsnachweis-e-id-oder-primesign/
- https://www.ausweisapp.bund.de/sdk
- https://www.d-trust.net/files/dokumente/pdf/produktblatt_sign-me.pdf (S, nur Suchauszug)
- https://web-eid.eu/
- https://www.garrigues.com/en_GB/garrigues-digital/european-digital-identity-wallet-now-has-timetable-tasks-be-completed-december (S)
- https://github.com/bluetech/pcsc-rust · https://github.com/parallaxsecond/rust-cryptoki · https://registry.npmjs.org/pkcs11js

**OCR, Konvertierung**
- https://github.com/naptha/tesseract.js · https://github.com/docling-project/docling
- https://doc.courtbouillon.org/weasyprint/stable/first_steps.html · https://pyodide.org/en/stable/usage/packages-in-pyodide.html
- https://registry.npmjs.org/@capacitor/core
