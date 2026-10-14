# Engine-Vergleich (P13)

Erzeugt von `scripts/p13-vergleich.mjs` aus `app/test-results/engines`. Toleranz für Lage und Höhe: 2 px.

## Engines

| Engine | Version | User-Agent |
|---|---|---|
| chromium | 156.0.8078.4 | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Safari/537.36` |
| firefox | 157.0 | `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0` |
| webkit | 27.2 | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15` |

## Fließende Ansicht: Geometrie je Datei und Breite

Bezug ist Chromium. „Blöcke verschoben“ zählt adressierte Blöcke (Elemente mit `id`), deren Oberkante oder Höhe um mehr als die Toleranz abweicht; „größte Abweichung“ nennt den Block mit dem größten Höhenunterschied.

| Datei@Breite | Engine | Überlauf (scrollWidth/clientWidth) | Dokumenthöhe px | Blöcke | Blöcke verschoben | größte Abweichung |
|---|---|---|---|---|---|---|
| beispiel@1280 | chromium | 992/992 | 3493 | 43 | Bezug | – |
| beispiel@1280 | firefox | 992/992 | 3496 (+3) | 43 | 6 | `section#bericht` 3403 → 3406 px (+3) |
| beispiel@1280 | webkit | 992/992 | 3492 (-1) | 43 | 0 | `section#bericht` 3403 → 3402 px (-1) |
| beispiel@320 | chromium | 320/320 | 5125 | 43 | Bezug | – |
| beispiel@320 | firefox | 320/320 | 5128 (+3) | 43 | 11 | `section#bericht` 5035 → 5038 px (+3) |
| beispiel@320 | webkit | 320/320 | 5124 (-1) | 43 | 0 | `section#bericht` 5035 → 5034 px (-1) |
| beispiel@768 | chromium | 768/768 | 3493 | 43 | Bezug | – |
| beispiel@768 | firefox | 768/768 | 3496 (+3) | 43 | 6 | `section#bericht` 3403 → 3406 px (+3) |
| beispiel@768 | webkit | 768/768 | 3492 (-1) | 43 | 0 | `section#bericht` 3403 → 3402 px (-1) |
| druck@1280 | chromium | 992/992 | 10156 | 42 | Bezug | – |
| druck@1280 | firefox | 992/992 | 10161 (+5) | 42 | 33 | `section#messprotokoll` 6596 → 6602 px (+6) |
| druck@1280 | webkit | 992/992 | 10153 (-3) | 42 | 8 | `section#bauzeitenplan` 709 → 708 px (-1) |
| druck@320 | chromium | 320/320 | 16108 | 42 | Bezug | – |
| druck@320 | firefox | 320/320 | 11129 (-4979) | 42 | 33 | `section#messprotokoll` 11630 → 6676 px (-4954) |
| druck@320 | webkit | 320/320 | 16080 (-28) | 42 | 29 | `section#bauzeitenplan` 765 → 739 px (-26) |
| druck@768 | chromium | 768/768 | 10156 | 42 | Bezug | – |
| druck@768 | firefox | 768/768 | 10161 (+5) | 42 | 33 | `section#messprotokoll` 6596 → 6602 px (+6) |
| druck@768 | webkit | 768/768 | 10153 (-3) | 42 | 8 | `section#bauzeitenplan` 709 → 708 px (-1) |
| kostenschaetzung@1280 | chromium | 992/992 | 1764 | 14 | Bezug | – |
| kostenschaetzung@1280 | firefox | 992/992 | 1856 (+92) | 14 | 5 | `section#kosten-abschnitt` 472 → 566 px (+94) |
| kostenschaetzung@1280 | webkit | 992/992 | 1766 (+2) | 14 | 0 | `section#kennzahlen-abschnitt` 332 → 334 px (+2) |
| kostenschaetzung@320 | chromium | 320/320 | 2762 | 14 | Bezug | – |
| kostenschaetzung@320 | firefox | 320/320 | 2832 (+70) | 14 | 14 | `h1#titel` 192 → 240 px (+48) |
| kostenschaetzung@320 | webkit | 320/320 | 2836 (+74) | 14 | 14 | `h1#titel` 192 → 240 px (+48) |
| kostenschaetzung@768 | chromium | 768/768 | 1764 | 14 | Bezug | – |
| kostenschaetzung@768 | firefox | 768/768 | 1880 (+116) | 14 | 13 | `section#kosten-abschnitt` 472 → 566 px (+94) |
| kostenschaetzung@768 | webkit | 768/768 | 1996 (+232) | 14 | 13 | `section#kosten-abschnitt` 472 → 678 px (+206) |
| lebendig@1280 | chromium | 992/992 | 2114 | 20 | Bezug | – |
| lebendig@1280 | firefox | 992/992 | 2097 (-17) | 20 | 10 | `section#signal` 156 → 141 px (-15) |
| lebendig@1280 | webkit | 992/992 | 2088 (-26) | 20 | 10 | `section#signal` 156 → 132 px (-24) |
| lebendig@320 | chromium | 320/320 | 2683 | 20 | Bezug | – |
| lebendig@320 | firefox | 320/320 | 2667 (-16) | 20 | 10 | `section#signal` 253 → 238 px (-15) |
| lebendig@320 | webkit | 320/320 | 2657 (-26) | 20 | 10 | `section#signal` 253 → 229 px (-24) |
| lebendig@768 | chromium | 768/768 | 2114 | 20 | Bezug | – |
| lebendig@768 | firefox | 768/768 | 2097 (-17) | 20 | 10 | `section#signal` 156 → 141 px (-15) |
| lebendig@768 | webkit | 768/768 | 2088 (-26) | 20 | 10 | `section#signal` 156 → 132 px (-24) |

## Seitenansicht (A4): Seitenzahl und Umbrüche

| Datei | Engine | Seiten | Seitengröße px | Umbrüche vor | gleich wie Chromium |
|---|---|---|---|---|---|
| beispiel@seiten | chromium | 4 | 794 × 1123 | `ol#l-befunde`, `table#t-kosten`, `h2#technik-titel` | Bezug |
| beispiel@seiten | firefox | 4 | 794 × 1123 | `ol#l-befunde`, `table#t-kosten`, `h2#technik-titel` | ja |
| beispiel@seiten | webkit | 4 | 794 × 1123 | `ol#l-befunde`, `table#t-kosten`, `h2#technik-titel` | ja |
| druck@seiten | chromium | 11 | 794 × 1123 | `figure#balkenplan`, `figure#zeitraffer-abbildung`, `hp-chart#aufwand-diagramm` | Bezug |
| druck@seiten | firefox | 11 | 794 × 1123 | `figure#balkenplan`, `figure#zeitraffer-abbildung`, `hp-chart#aufwand-diagramm` | ja |
| druck@seiten | webkit | 11 | 794 × 1123 | `figure#balkenplan`, `figure#zeitraffer-abbildung`, `hp-chart#aufwand-diagramm` | ja |

## Lesesystem-Variablen (HPR-INH-006)

| Engine | Absätze | Schrift vorher → nachher | Zeilenhöhe vorher → nachher | Faktor Schrift (min–max) | Zeilenhöhe/Schrift (min–max) |
|---|---|---|---|---|---|
| chromium | 20 | 16 → 32 px | 24.8px → 64px | 2–2 | 2–2 |
| firefox | 20 | 16 → 32 px | 24.8px → 64px | 2–2 | 2–2 |
| webkit | 20 | 16 → 32 px | 24.799999px → 64px | 2–2 | 2–2 |

## Schrift und Merkmale im Dokumentrahmen (Sandbox)

| Merkmal | chromium | firefox | webkit | Unterschied |
|---|---|---|---|---|
| Origin des Rahmens | null | null | null |  |
| Schriftfamilie (berechnet) | `Georgia, "Times New Roman", serif` | `Georgia, "Times New Roman", serif` | `Georgia, Times New Roman, serif` | **ja** |
| Schriftgröße / Zeilenhöhe | 16px / 24.8px | 16px / 24.8px | 16px / 24.799999px | **ja** |
| Breite des Mustersatzes px | 575 | 575 | 575 |  |
| hyphens (berechnet) | manual | manual | manual |  |
| CSS container-queries | ja | ja | ja |  |
| CSS text-wrap-balance | ja | ja | ja |  |
| CSS text-wrap-pretty | ja | **nein** | ja | **ja** |
| CSS hyphens-auto | ja | ja | ja |  |
| CSS break-inside-avoid | ja | ja | ja |  |
| CSS zoom | ja | ja | ja |  |
| CSS field-sizing | ja | ja | ja |  |
| CSS anchor-positioning | ja | ja | ja |  |
| CSS view-transition-name | ja | ja | ja |  |
| CSS color-mix | ja | ja | ja |  |
| CSS light-dark | ja | ja | ja |  |
| CSS interpolate-size | ja | **nein** | **nein** | **ja** |
| CSS selector-has | ja | ja | ja |  |
| CSS details-content | ja | ja | ja |  |
| API CompressionStream deflate-raw | ja | ja | ja |  |
| API Intl.Segmenter | ja | ja | ja |  |
| API crypto.subtle | ja | ja | ja |  |
| API fragmentDirective (text fragments) | ja | ja | ja |  |
| API speechSynthesis | ja | ja | ja |  |
| API showSaveFilePicker | ja | **nein** | **nein** | **ja** |
| API Element.checkVisibility | ja | ja | ja |  |
| API Popover API | ja | ja | ja |  |
| API HTMLDialogElement | ja | ja | ja |  |
| API ResizeObserver | ja | ja | ja |  |

## Sonde `fragmentierung`

| Wert | chromium | firefox | webkit | Unterschied |
|---|---|---|---|---|
| headingColumn | 2 | 1 | 1 | **ja** |
| paragraphColumn | 2 | 2 | 2 |  |
| boxFirstColumn | 3 | 3 | 3 |  |
| boxLastColumn | 3 | 3 | 3 |  |
| supports.break-after: avoid | ja | ja | ja |  |
| supports.break-inside: avoid | ja | ja | ja |  |
| supports.orphans: 2 | ja | **nein** | ja | **ja** |
| supports.widows: 2 | ja | **nein** | ja | **ja** |
| breakAfterAvoidHonoured | ja | **nein** | **nein** | **ja** |
| breakInsideAvoidHonoured | ja | ja | ja |  |

## Sonde `selbstnavigation`

| Wert | chromium | firefox | webkit | Unterschied |
|---|---|---|---|---|
| loads | 2 | 1 | 2 | **ja** |
| messages | load, left | load | load, left | **ja** |
| frameUrl | chrome-error://chromewebdata/ | about:srcdoc | about:srcdoc | **ja** |
| shownText |  | Dokumentinhalt | Dokumentinhalt | **ja** |
| hostReportedLeft | ja | **nein** | ja | **ja** |
| requestsAtTarget | 0 | 0 | 0 |  |

## Pixelvergleich der Bildschirmfotos (Bezug Chromium)

Anteil der Pixel, die sich in mindestens einem Farbkanal um mehr als 32 unterscheiden. Die Differenzbilder liegen in `bilder/*-diff-<engine>.png` (rot = verschieden).

| Bild | firefox | webkit |
|---|---|---|
| beispiel-1280 | 5.34 % | 8.16 % |
| beispiel-320 | 8.86 % | 12.50 % |
| beispiel-768 | 8.05 % | 10.33 % |
| beispiel-seiten | 4.43 % | 31.08 % |
| druck-1280 | 5.87 % | 8.62 % |
| druck-320 | 5.46 % | 14.61 % |
| druck-768 | 6.81 % | 11.51 % |
| druck-seiten | 5.49 % | 29.21 % |
| fragmentierung | 13.70 % | 18.97 % |
| kostenschaetzung-1280 | 5.99 % | 7.18 % |
| kostenschaetzung-320 | 15.13 % | 13.34 % |
| kostenschaetzung-768 | 12.01 % | 10.59 % |
| lebendig-1280 | 10.25 % | 30.48 % |
| lebendig-320 | 8.70 % | 25.72 % |
| lebendig-768 | 16.52 % | 48.45 % |

## Gefundene Unterschiede

- **Geometrie** · beispiel@1280 · firefox: 6 von 43 Blöcken, Höhe 3496 statt 3493 px
- **Geometrie** · beispiel@320 · firefox: 11 von 43 Blöcken, Höhe 5128 statt 5125 px
- **Geometrie** · beispiel@768 · firefox: 6 von 43 Blöcken, Höhe 3496 statt 3493 px
- **Geometrie** · druck@1280 · firefox: 33 von 42 Blöcken, Höhe 10161 statt 10156 px
- **Geometrie** · druck@1280 · webkit: 8 von 42 Blöcken, Höhe 10153 statt 10156 px
- **Geometrie** · druck@320 · firefox: 33 von 42 Blöcken, Höhe 11129 statt 16108 px
- **Geometrie** · druck@320 · webkit: 29 von 42 Blöcken, Höhe 16080 statt 16108 px
- **Geometrie** · druck@768 · firefox: 33 von 42 Blöcken, Höhe 10161 statt 10156 px
- **Geometrie** · druck@768 · webkit: 8 von 42 Blöcken, Höhe 10153 statt 10156 px
- **Geometrie** · kostenschaetzung@1280 · firefox: 5 von 14 Blöcken, Höhe 1856 statt 1764 px
- **Geometrie** · kostenschaetzung@320 · firefox: 14 von 14 Blöcken, Höhe 2832 statt 2762 px
- **Geometrie** · kostenschaetzung@320 · webkit: 14 von 14 Blöcken, Höhe 2836 statt 2762 px
- **Geometrie** · kostenschaetzung@768 · firefox: 13 von 14 Blöcken, Höhe 1880 statt 1764 px
- **Geometrie** · kostenschaetzung@768 · webkit: 13 von 14 Blöcken, Höhe 1996 statt 1764 px
- **Geometrie** · lebendig@1280 · firefox: 10 von 20 Blöcken, Höhe 2097 statt 2114 px
- **Geometrie** · lebendig@1280 · webkit: 10 von 20 Blöcken, Höhe 2088 statt 2114 px
- **Geometrie** · lebendig@320 · firefox: 10 von 20 Blöcken, Höhe 2667 statt 2683 px
- **Geometrie** · lebendig@320 · webkit: 10 von 20 Blöcken, Höhe 2657 statt 2683 px
- **Geometrie** · lebendig@768 · firefox: 10 von 20 Blöcken, Höhe 2097 statt 2114 px
- **Geometrie** · lebendig@768 · webkit: 10 von 20 Blöcken, Höhe 2088 statt 2114 px
- **Merkmal** · Schriftfamilie (berechnet) · webkit: chromium=`Georgia, "Times New Roman", serif`; firefox=`Georgia, "Times New Roman", serif`; webkit=`Georgia, Times New Roman, serif`
- **Merkmal** · Schriftgröße / Zeilenhöhe · webkit: chromium=16px / 24.8px; firefox=16px / 24.8px; webkit=16px / 24.799999px
- **Merkmal** · CSS text-wrap-pretty · firefox: chromium=true; firefox=false; webkit=true
- **Merkmal** · CSS interpolate-size · firefox, webkit: chromium=true; firefox=false; webkit=false
- **Merkmal** · API showSaveFilePicker · firefox, webkit: chromium=true; firefox=false; webkit=false
- **Sonde fragmentierung** · headingColumn · chromium, firefox, webkit: chromium=2; firefox=1; webkit=1
- **Sonde fragmentierung** · supports.orphans: 2 · chromium, firefox, webkit: chromium=true; firefox=false; webkit=true
- **Sonde fragmentierung** · supports.widows: 2 · chromium, firefox, webkit: chromium=true; firefox=false; webkit=true
- **Sonde fragmentierung** · breakAfterAvoidHonoured · chromium, firefox, webkit: chromium=true; firefox=false; webkit=false
- **Sonde selbstnavigation** · loads · chromium, firefox, webkit: chromium=2; firefox=1; webkit=2
- **Sonde selbstnavigation** · messages · chromium, firefox, webkit: chromium=load, left; firefox=load; webkit=load, left
- **Sonde selbstnavigation** · frameUrl · chromium, firefox, webkit: chromium=chrome-error://chromewebdata/; firefox=about:srcdoc; webkit=about:srcdoc
- **Sonde selbstnavigation** · shownText · chromium, firefox, webkit: chromium=; firefox=Dokumentinhalt; webkit=Dokumentinhalt
- **Sonde selbstnavigation** · hostReportedLeft · chromium, firefox, webkit: chromium=true; firefox=false; webkit=true
