# 15 – Mobil-Hüllen: Spike Tauri 2 auf Android und iOS

**Projekt:** hpro · **Paket:** P12 · **Stand:** 14.10.2026
**Belege:** [`docs/belege/P12/`](belege/P12/README.md) · **Code:** [`mobil/`](../mobil/README.md)
(Tauri-App [`mobil/src-tauri/`](../mobil/src-tauri/src/lib.rs), eigenes Kotlin-Plugin
[`mobil/tauri-plugin-hpro-mobil/`](../mobil/tauri-plugin-hpro-mobil/android/src/main/java/HproPlugin.kt),
Vergleichshülle [`mobil/capacitor/`](../mobil/capacitor/), Testtreiber [`mobil/e2e/`](../mobil/e2e/),
Skripte [`mobil/scripts/`](../mobil/scripts/))

---

## 1. Ergebnis

**Der Spike ist durchgefallen. Empfehlung: Capacitor für Android und iOS** (Abschnitt 5).

Nach [docs/06, Abschnitt 4.4](06-plattform-und-funktionsmatrix.md#44-abbruchkriterien-für-den-tauri-mobil-spike)
bleibt Tauri nur gesetzt, wenn **alle** fünf Kriterien erfüllt sind. Schon Kriterium 1 ist
gemessen **nicht** erfüllt: Unter Android erreicht ein Skript im Dokumentrahmen, der in einem
`sandbox`-iframe mit opaker Origin läuft, Tauri-Befehle des Reader-Fensters. Das widerspricht der
Zusage aus [docs/10, Abschnitt 3.4](10-anspruch-und-funktionsprofil.md): „Lebendige Inhalte laufen
ausschließlich in der Sandbox.“ Mit Capacitor 8 erreicht derselbe Angriff im selben Emulator und mit
derselben WebView **keinen** Befehl.

| # | Abbruchkriterium (docs/06, 4.4) | Android (gemessen) | iOS | Ergebnis |
|---|---|---|---|---|
| 1 | Dokument-iframe erreicht **keinen** Tauri-Befehl | **nein**: der Rahmen löst `e2e_canary` aus | nicht geprüft (kein Mac) | **nein** |
| 2 | `.hpro` öffnet sich aus Mail und Dateimanager | K2_ANDROID | nicht geprüft (kein Mac) | K2_ERGEBNIS |
| 3 | Kotlin- und Swift-Plugin in ≤ 5 PT, ohne ANR | K3_ANDROID | Swift: nicht geprüft (kein Mac) | K3_ERGEBNIS |
| 4 | TalkBack und VoiceOver lesen Dokument und Oberfläche vollständig | K4_ANDROID | VoiceOver: nicht geprüft (kein Mac) | K4_ERGEBNIS |
| 5 | Store-Builds (AAB, IPA) reproduzierbar in CI | K5_ANDROID | IPA: nicht geprüft (kein Mac) | K5_ERGEBNIS |

„Ergebnis“ beantwortet die Frage aus docs/06: Ist das Kriterium für Tauri **nachgewiesen** erfüllt?
Ein Kriterium, dessen iOS-Hälfte nicht prüfbar war, gilt nicht als erfüllt. Ein „ja“ steht nur da,
wo es gemessen wurde. Das Gesamturteil hängt aber nicht an iOS: Kriterium 1 fällt bereits unter
Android.

K_DETAILS
