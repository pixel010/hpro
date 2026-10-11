# 03 – Konzept html-Pro

**Projekt:** html-Pro · **Phase:** 1 (Recherche) · **Stand:** 11.10.2026
**Grundlage:** [`01-stand-der-technik.md`](01-stand-der-technik.md),
[`02-acrobat-pro-funktionsumfang.md`](02-acrobat-pro-funktionsumfang.md) und die Notizen in
[`quellen/`](quellen/).

Dieses Dokument ist ein **Vorschlag zur Diskussion**, keine Spezifikation. Belegte Fakten tragen
eine URL. Entwurfsentscheidungen sind als **Vorschlag** gekennzeichnet, Unbelegtes als
**OFFENE FRAGE**. Aufwände sind **Schätzungen ohne externe Quelle** und deshalb als Bandbreiten
angegeben.

---

## 0. Kurzfassung

- **Basis:** HTML/CSS als Inhaltsschicht, aber verpackt in einen **ZIP-Container nach dem
  OCF-Muster von EPUB**, der zugleich als **ASiC-E-Container** (ETSI EN 319 162-1) signierbar ist.
  Kein eigener WASM-Renderer, kein loses HTML, kein CBOR.
- **Drei Profile** pro Dokument: *Statisch* (kein Code), *Interaktiv* (nur deklarierte Komponenten
  aus einer versionierten, signierten Bibliothek, in einer Sandbox) und *Signiert/Archiv*
  (eingefroren, Formularwerte als Daten, optional mitsignierte Referenzdarstellung).
- **Daten vor Darstellung:** Strukturierte Daten (JSON mit Schema) liegen getrennt vom HTML, wie
  bei der E-Rechnung. Die Darstellung ist eine Sicht darauf.
- **Reader/Editor:** eine clientseitige Web-App (offline-fähig), verpackt in eine Desktop- und
  Mobil-Hülle (Vorschlag: Tauri 2). Server nur für qualifizierte Signatur, Zeitstempel, optionale
  Synchronisation und optionale KI.
- **Übergang:** PDF → html-Pro über Tags oder ML-Konverter (Docling), Original-PDF bleibt im
  Container. html-Pro → PDF über WeasyPrint (PDF/A, PDF/UA), dazu ein PDF/A-3-Hybrid mit
  eingebettetem Container.
- **Größte Schwächen:** „What you see is what you sign“ bei responsivem Inhalt, PDF-Pflicht bei
  Gerichten, eingeschränkte Archivakzeptanz von HTML, Sicherheitsrisiko interaktiver Dokumente und
  vor allem das **Adoptionsproblem** (siehe Abschnitt 7).
- **MVP:** Lesen, semantisch bearbeiten, Formulare, Kommentare, Barrierefreiheitsprüfung,
  PDF-Import und -Export, AdES-Signatur mit Zeitstempel. Grob **33–68 Personenmonate**.

---

## 1. Formatvorschlag

### 1.1 Leitentscheidungen

| Frage | Vorschlag | Begründung (Beleg) |
|---|---|---|
| HTML oder etwas anderes? | HTML/CSS/SVG als Inhalt | einzige Basis mit responsivem Layout, Interaktivität und breiter Engine-Basis; alle Alternativen sind seitenorientiert oder cloudgebunden ([01, Abschnitt 9–10](01-stand-der-technik.md#10-fazit-ist-html-die-richtige-basis)) |
| Container | ZIP nach OCF-Muster (EPUB) | erprobt; ASiC baut ausdrücklich auf OCF auf ([ETSI EN 319 162-1](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf)); LoC führt EPUB 3 als „preferred“ ([LoC](https://www.loc.gov/preservation/resources/rfs/text.html)) |
| Manifest | JSON, angelehnt an W3C Publication Manifest | Publication Manifest ist W3C-Recommendation ([W3C](https://www.w3.org/TR/pub-manifest/)); H5P zeigt das Muster ZIP + JSON-Manifest ([H5P](https://h5p.org/documentation/developers/json-file-definitions)) |
| Signatur | ASiC-E mit XAdES Baseline (B-LT/B-LTA) | ab 23.02.2027 von öffentlichen Stellen anzuerkennen ([DVO 2026/248](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R0248)); von EU DSS validierbar ([DSS](https://github.com/esig/dss)) |
| CBOR? | nein | spart Bytes, bricht aber mit lesbaren Vorbildern (Publication Manifest, H5P, Observable) und mit XAdES/ASiC |
| WASM-Renderer? | nein; WASM nur als Sandbox-Werkzeug | eigener Renderer würde die barrierefreien Browser-Engines ersetzen; pdf.js nutzt WASM (QuickJS) gerade zum Isolieren von Dokument-Code ([Mozilla Hacks](https://hacks.mozilla.org/2021/10/implementing-form-filling-and-accessibility-in-the-firefox-pdf-viewer/)) |
| Syntax | XHTML-Serialisierung (polyglottes HTML) | EPUB verlangt XHTML; der Versuch, HTML-Syntax zuzulassen, wurde 11/2025 zurückgenommen ([EPUB 3.4](https://www.w3.org/TR/epub-34/)). Polyglottes Markup hält die EPUB-Rückfallebene offen |

### 1.2 Aufbau des Containers (Vorschlag)

Arbeitstitel der Dateiendung: `.hpro`.

```
vertrag.hpro                      ZIP (OCF-Muster)
├── mimetype                      erste Datei, unkomprimiert (siehe OFFENE FRAGE 1.6)
├── META-INF/
│   ├── container.xml             OCF: verweist auf package.opf (EPUB-Rückfallebene)
│   ├── signatures001.xml         XAdES-Baseline-Signatur(en), ASiC-E
│   ├── ASiCArchiveManifest001.xml  optional, Archivzeitstempel (B-LTA)
│   └── c2pa.c2pa                 optional, C2PA-Manifest (Herkunft, KI-Kennzeichnung)
├── package.opf                   generiert: EPUB-3.3-Package für alte Reader
├── manifest.json                 html-Pro-Manifest (maßgeblich)
├── content/
│   ├── index.xhtml               Einstieg; weitere Abschnitte als eigene Dateien
│   ├── styles/document.css
│   └── media/…                   Bilder, SVG, Fonts (keine externen Ressourcen)
├── data/
│   ├── form.json                 Formular- und Fachdaten
│   └── form.schema.json          JSON Schema für Validierung und Editor
├── components/
│   └── hp-components@1.2.0/      versionierte Komponentenbibliothek (gehasht, signiert)
├── annotations/
│   └── annotations.jsonld        Kommentare als W3C Web Annotations
├── renditions/                   optional
│   └── reference.pdf             mitsignierte Referenzdarstellung (Signaturprofil)
└── original/                     optional
    └── quelle.pdf                Ausgangs-PDF bei Konvertierung (GoBD Rz. 135)
```

### 1.3 Manifest (Vorschlag, Auszug)

```json
{
  "@context": ["https://www.w3.org/ns/pub-context", "https://html-pro.example/ns/v0"],
  "conformsTo": "https://html-pro.example/spec/0.1/profile/interactive",
  "id": "urn:uuid:5b0c…",
  "name": "Mietvertrag Wohnung Innsbruck",
  "inLanguage": "de-AT",
  "dateModified": "2026-10-11T09:00:00Z",
  "author": [{ "name": "…" }],
  "readingOrder": [{ "url": "content/index.xhtml", "type": "application/xhtml+xml" }],
  "resources": [
    { "url": "content/styles/document.css", "integrity": "sha256-…" },
    { "url": "components/hp-components@1.2.0/form.js", "integrity": "sha256-…" }
  ],
  "data": [{ "url": "data/form.json", "schema": "data/form.schema.json" }],
  "accessibility": {
    "conformsTo": "EPUB Accessibility 1.1 - WCAG 2.2 Level AA",
    "accessMode": ["textual", "visual"],
    "accessModeSufficient": ["textual"],
    "accessibilityFeature": ["structuralNavigation", "tableOfContents", "alternativeText"],
    "accessibilityHazard": ["none"],
    "accessibilitySummary": "…"
  },
  "renditions": [{ "url": "renditions/reference.pdf", "role": "signature-reference" }]
}
```

- Die Barrierefreiheitsfelder übernehmen das Modell von EPUB Accessibility 1.1
  ([W3C](https://www.w3.org/TR/epub-a11y-11/)); in 1.2 wird `accessModeSufficient` Pflicht
  ([DAISY KB](https://kb.daisy.org/publishing/docs/new/index.html)).
- `integrity` folgt dem Muster von Subresource Integrity: Jede Ressource ist mit Hash
  verzeichnet. Der Reader lädt nichts, was nicht im Manifest steht.
- `@context`/`conformsTo` folgen dem Publication Manifest. Die Namensraum-URL ist ein Platzhalter.

### 1.4 Die drei Profile

| Profil | Was darf das Dokument? | Typische Dokumente | Reader-Verhalten |
|---|---|---|---|
| **Statisch** | HTML, CSS, SVG, Medien; **kein Skript** | Berichte, Bescheide, Briefe, Handbücher | immer sicher darstellbar |
| **Interaktiv** | zusätzlich **deklarierte Komponenten** aus einer versionierten Bibliothek (`<hp-form>`, `<hp-table>`, `<hp-chart>`, `<hp-calc>`), jede mit Pflicht-Fallback ohne Skript; kein freies JavaScript | Formulare mit Berechnung, Angebote, interaktive Tabellen und Diagramme, Schulungsunterlagen | Komponenten laufen in der Sandbox; fremde Bibliotheksversionen nur nach Prüfung von Hash und Signatur |
| **Signiert/Archiv** | eingefroren: Formularwerte in `data/`, Komponenten auf ihre statische Fallback-Darstellung reduziert, optional `renditions/reference.pdf` | Verträge, Rechnungen, Bescheide, Prüfberichte | kein Skript; Signatur deckt alle Dateien ab |

Das Muster „interaktive Komponente mit Pflicht-Fallback ohne JavaScript“ stammt aus dem Vorschlag
„Portable EPUBs“ ([Crichton](https://willcrichton.net/notes/portable-epubs/)); das Muster
„deklarierter Block, den der Reader interpretiert“ aus Observable Notebook Kit
([Kit-Doku](https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html)); die
Mehrfachdarstellung (interaktiv + statisch) aus den MIME-Bundles von Jupyter
([nbformat](https://nbformat.readthedocs.io/en/latest/format_description.html)).

**Freies JavaScript** gibt es im Vorschlag bewusst nicht. Ein späteres Profil „Experimentell“ wäre
denkbar, dann nur nach ausdrücklicher Freigabe durch den Nutzer (Trust-Modell wie Jupyter:
„Untrusted Javascript is never executed“, [Jupyter](https://jupyter-server.readthedocs.io/en/latest/operators/security.html))
und nie im Signaturprofil.

### 1.5 Signaturen und Verschlüsselung

**Signatur (Vorschlag):**
- **ASiC-E mit XAdES Baseline**, Ziel B-LT bzw. B-LTA. Die Signatur referenziert **jede Datei**
  im Container einschließlich `manifest.json`, `data/` und `components/`.
- **Mehrere Signaturen** (Gegenzeichnung, Freigabekette) ohne Bruch früherer Signaturen, wie ASiC-E
  es erlaubt ([EN 319 162-1](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf)).
- **Signaturfelder** als deklarierte Stellen im HTML (`<hp-signature-field ref="sig-mieter">`),
  die im Reader den Status der zugehörigen XAdES-Signatur anzeigen. Kommentare danach liegen in
  `annotations/` und sind von einer späteren Signatur abgedeckt oder ausdrücklich ausgenommen.
- **C2PA optional** für Herkunft und KI-Kennzeichnung; Reihenfolge wie in C2PA Anhang A.4.2.2 für
  PDF: erst C2PA-Manifest, dann ASiC-Signatur über alles
  ([C2PA 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)).

**Verschlüsselung (Vorschlag):**
- **Umschlag statt Dateiverschlüsselung:** Der ganze Container wird als CMS EnvelopedData
  ([RFC 5652](https://www.rfc-editor.org/rfc/rfc5652)) für Empfänger-Zertifikate oder per Passwort
  verschlüsselt. EPUB-artige Einzeldatei-Verschlüsselung legt Verzeichnisstruktur und Dateinamen
  offen ([EPUB 3.3, §4.2.6.3.2](https://www.w3.org/TR/epub-33/)) und wird deshalb nicht genutzt.
- Rechteverwaltung („nicht drucken“, „nicht kopieren“) ist in einem offenen Format nicht
  durchsetzbar. Die PDF-Berechtigungsflags sind im Kern ebenfalls Absprachen mit dem Reader.
  html-Pro sollte das offen sagen und nur Vertraulichkeit (Verschlüsselung) anbieten.
- DRM nach Readium LCP ([EDRLab](https://www.edrlab.org/readium-lcp/)) ist für Verlage gebaut;
  Bedarf für Geschäftsdokumente ist offen (**OFFENE FRAGE**).

### 1.6 Vergleich mit EPUB

| Aspekt | EPUB 3.3/3.4 | html-Pro (Vorschlag) |
|---|---|---|
| Container | OCF-ZIP | OCF-ZIP, zusätzlich ASiC-E-konform |
| Manifest | `package.opf` (XML) | `manifest.json` (maßgeblich) + generiertes `package.opf` |
| Inhalt | XHTML, CSS, SVG | XHTML-polyglott, CSS, SVG, dazu getrennte Daten (`data/`) |
| Layout | Reader dürfen Autoren-CSS überschreiben; Paginierung | kein Paginieren; Nutzereinstellungen über definierte CSS-Variablen statt Überschreiben |
| Skripte | optional, uneinheitlich, sicherheitskritisch | nur deklarierte Komponenten in Sandbox; Profile |
| Signatur | `signatures.xml` definiert, aber nicht geprüft | ASiC-E/XAdES, Reader **muss** prüfen und anzeigen |
| Formulare | nicht vorgesehen | Kernfunktion (Komponente + JSON Schema) |
| Kommentare | EPUB Annotations in Arbeit (Ziel 02/2027, [PMWG-Charter](https://www.w3.org/groups/wg/pm/charters/active/)) | W3C Web Annotations im Container |
| Barrierefreiheit | EPUB Accessibility 1.1 | dasselbe Modell, Prüfbericht im Container |
| Reader | viele, fragmentiert | ein Referenz-Reader + öffentliche Testsuite |

**Vorteile gegenüber EPUB:** echte Signaturprüfung, Formulare, getrennte Daten, verbindliches
Sicherheitsmodell, ein Referenz-Reader. **Nachteile:** neues Format ohne installierte Basis; die
EPUB-Rückfallebene zeigt nur den statischen Inhalt; doppelte Pflege von `package.opf` und
`manifest.json`.

**OFFENE FRAGE (zentral):** Die `mimetype`-Datei muss bei EPUB `application/epub+zip` lauten; bei
ASiC-E ist `application/vnd.etsi.asic-e+zip` vorgesehen. Ob ein ASiC-E-mit-XAdES-Container einen
anderen Mime-Typ tragen darf und trotzdem Baseline-konform ist, ließ sich nicht klären
(Abschnitt 4.4.3.1 der Norm nicht extrahierbar, siehe
[Notiz B](quellen/recherche-b-recht-vertrauen-barrierefreiheit.md)). Davon hängt ab, ob eine Datei
**gleichzeitig** EPUB-lesbar und ASiC-validierbar sein kann. **Erster Prototyp in Phase 2:**
Beispielcontainer bauen und mit EU DSS, RTR-Prüfdienst, epubcheck und Thorium testen.

---

## 2. Reader/Editor-Architektur

### 2.1 Schichten

```
┌───────────────────────────────────────────────────────────────┐
│ Hülle: Desktop (Windows/macOS/Linux), Mobil (iOS/Android), Web │
│   Dateizuordnung, Dateisystem, Schlüsselspeicher, Updates      │
├───────────────────────────────────────────────────────────────┤
│ Anwendung (TypeScript, läuft komplett im Client)               │
│   Bibliothek, Reader-UI, Editor, Kommentare, Formulare,        │
│   Barrierefreiheitsprüfung, Signatur-UI, Export-Steuerung      │
├──────────────────────────────┬────────────────────────────────┤
│ Container-Kern               │ Dokument-Sandbox                │
│   ZIP lesen/schreiben,       │   iframe mit opaker Origin,     │
│   Manifest, Hashes,          │   strenge CSP, nur Komponenten  │
│   Signaturprüfung            │   aus geprüfter Bibliothek      │
├──────────────────────────────┴────────────────────────────────┤
│ Lokale Dienste (optional, in der Desktop-Hülle)                │
│   PDF-Export (WeasyPrint), PDF-Import (Docling),               │
│   Signaturvalidierung (EU DSS)                                 │
├───────────────────────────────────────────────────────────────┤
│ Netzdienste (nur wo unvermeidbar)                              │
│   QTSP-Fernsignatur (CSC API), Zeitstempel (RFC 3161),          │
│   Vertrauenslisten (EU LOTL), optional Sync und KI              │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Web-App plus Desktop-Hülle

- **Web-App als Kern:** eine Codebasis für alle Plattformen; Offline über Service Worker (PWA).
  Dateizuordnung für installierte Web-Apps (File Handling API) gibt es aber nur in Chrome und Edge
  ab 102, nicht in Firefox und Safari ([web.dev](https://web.dev/learn/pwa/os-integration);
  [Chrome](https://developer.chrome.com/docs/capabilities/web-apis/file-handling)). Für
  „Doppelklick öffnet `.hpro`“ auf allen Systemen braucht es eine **native Hülle**.
- **Hülle – Vorschlag Tauri 2:**
  - nutzt die System-Webview: WebView2/Chromium unter Windows, WebKit unter macOS, iOS und Linux,
    System-WebView unter Android ([Tauri](https://v2.tauri.app/reference/webview-versions/));
  - Installer laut Vergleichen deutlich kleiner als bei Electron, das Chromium mitliefert
    (Sekundärquellen, z. B. [pkgpulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026));
  - Berechtigungen über „Capabilities“ je Fenster/Webview
    ([Tauri](https://v2.tauri.app/security/capabilities/));
  - wird von vergleichbaren Projekten genutzt: Observable Desktop (laut Tom MacWright,
    [Sekundärquelle](https://macwright.com/2025/07/31/observable-notebooks-2)) und der
    Portable-EPUB-Reader „Bene“ ([Crichton](https://willcrichton.net/notes/portable-epubs/)).
- **Gegenargument Electron:** eine einzige Engine (Chromium) auf allen Plattformen, also
  einheitlichere Darstellung, was für Signatur und Barrierefreiheitsprüfung hilft. Dafür größer
  und mit bekannter Angriffsfläche: Thorium (Electron) hatte 2025 eine RCE über EPUB-JavaScript
  ([Thorium](https://github.com/edrlab/thorium-reader/releases/tag/v3.3.0)).
- **Entscheidung offen** (**OFFENE FRAGE**). Die unterschiedlichen Engines unter Tauri (WebKit vs.
  Chromium) sind für ein Format, das „überall gleich“ verspricht, ein echtes Risiko. Phase 2 sollte
  dieselbe Testsuite in beiden Hüllen laufen lassen.

### 2.3 Was geht ohne Server?

| Funktion | Ohne Server? | Bemerkung |
|---|---|---|
| Öffnen, Lesen, Suchen, Nutzereinstellungen | ja | komplett im Client |
| Bearbeiten, Formulare ausfüllen, Kommentare | ja | Kommentare als Web Annotations im Container |
| Barrierefreiheitsprüfung | ja | z. B. mit axe-core (MPL-2.0); findet laut Hersteller „on average 57% of WCAG issues“ automatisch ([axe-core](https://github.com/dequelabs/axe-core)), der Rest braucht geführte manuelle Prüfung |
| Signatur **prüfen** | weitgehend | Kryptoprüfung lokal; aktuelle Vertrauenslisten (EU LOTL) und Sperrinformationen brauchen Netz oder einen Cache. EU DSS ist Java ([DSS](https://github.com/esig/dss)) und liefe als lokaler Dienst in der Desktop-Hülle; eine reine Browser-Validierung ist offen (**OFFENE FRAGE**) |
| **Fortgeschrittene** Signatur (AdES) mit eigenem Zertifikat | ja | Schlüssel im Systemspeicher oder auf Token |
| **Qualifizierte** Signatur (QES) | nein | Fernsignatur beim Vertrauensdiensteanbieter (CSC API v2.2, [CSC](https://cloudsignatureconsortium.org/resources/csc-api-v2-2/)); später EUDI-Wallet |
| Qualifizierter Zeitstempel | nein | Zeitstempeldienst (RFC 3161) |
| PDF-Export | Desktop ja, reine Web-App eingeschränkt | WeasyPrint ist Python ([WeasyPrint](https://github.com/Kozea/WeasyPrint)) und liefe lokal in der Hülle; im Browser nur Druck-zu-PDF der Engine |
| PDF-Import mit ML | Desktop ja | Docling läuft lokal, „for sensitive data and air-gapped environments“ ([Docling](https://github.com/docling-project/docling)) |
| Zusammenarbeit in Echtzeit | nein (Sync-Server) | local-first: lokal arbeiten, später abgleichen, z. B. mit Automerge ([automerge.org](https://automerge.org/)) |
| KI-Funktionen | lokal begrenzt möglich, sonst nein | Datenschutz-Abwägung, nicht im MVP |

**Offline-Nutzung:** Die Datei ist das Dokument. Alles, was zum Anzeigen nötig ist, liegt im
Container (keine externen Ressourcen, Manifest mit Hashes). Der Reader hält die
Komponentenbibliotheken zusätzlich lokal vor; fehlt eine Version, nutzt er den Fallback des
Dokuments. Das entspricht den Local-first-Idealen „The network is optional“ und „The Long Now“
([Ink & Switch](https://www.inkandswitch.com/essay/local-first/)).

### 2.4 Sicherheit: Wie verhindert man, dass Dokumente Schadsoftware werden?

Ausgangslage: 23 % der HTML-Mailanhänge waren laut Barracuda im Februar 2025 bösartig
([Barracuda](https://www.barracuda.com/company/news/2025/barracuda-finds-html-email-attachments-malicious));
EPUB-Reader hatten reale Lücken bis zur Codeausführung (Thorium 2025, Leuven-Studie 2021, siehe
[01, Abschnitt 1](01-stand-der-technik.md#1-epub-33--34-und-epub-accessibility)).

**Vorschlag, gestaffelt:**

1. **Kein freies JavaScript.** Profile „Statisch“ und „Signiert“ ohne Code; „Interaktiv“ nur mit
   Komponenten aus einer **versionierten, vom Projekt signierten Bibliothek**, deren Hashes im
   Manifest stehen. Fremde Bibliotheksversionen werden nur nach Signaturprüfung geladen
   (Lehre aus H5P, wo Sicherheit an vertrauenswürdigen Administratoren hängt,
   [H5P](https://h5p.org/node/16), [CVE-2025-7062](https://nvd.nist.gov/vuln/detail/CVE-2025-7062)).
2. **Sandbox-iframe mit opaker Origin:** `sandbox="allow-scripts"` **ohne** `allow-same-origin`.
   MDN warnt ausdrücklich, dass die Kombination beider Werte dem Dokument erlaubt, die Sandbox zu
   entfernen ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)).
   Kein `allow-top-navigation`, keine Popups, keine Formular-Absendung ins Netz.
3. **Strenge Content Security Policy** im Dokumentrahmen: `default-src 'none'`, Skripte nur per
   Hash aus der Bibliothek, `connect-src 'none'` (kein Netz), Bilder/Fonts nur aus dem Container.
   Links nach außen öffnet der Reader nach Rückfrage.
4. **Keine Brücke zur Hülle:** Der Dokumentrahmen bekommt keine Tauri- bzw. Node-Befehle. Achtung:
   Tauri kann laut eigener Doku unter Linux und Android Anfragen eines eingebetteten iframes nicht
   vom Fenster unterscheiden ([Tauri](https://v2.tauri.app/security/capabilities/)). Die
   Dokument-Sandbox muss deshalb in einer eigenen Webview ohne jede Capability laufen.
5. **Keine Ein-/Ausgabe-APIs für Dokumente**, wie bei pdf.js, das die I/O-bezogenen PDF-APIs
   bewusst nicht implementiert ([Mozilla Hacks](https://hacks.mozilla.org/2021/10/implementing-form-filling-and-accessibility-in-the-firefox-pdf-viewer/)).
6. **Container-Härtung:** Whitelist der Dateitypen beim Import (wie H5P), Schutz vor
   Pfad-Traversal und ZIP-Bomben, Größenlimits, Fuzzing des Parsers.
7. **Rückfallebene ohne Reader** zeigt nur statischen Inhalt; ein `.hpro` öffnet sich nicht
   „einfach im Browser“ mit aktivem Code.
8. **Externe Sicherheitsprüfung** vor jeder öffentlichen Version.

Restrisiko bleibt: Jede Browser-Engine-Lücke trifft auch den Reader. Das ist bei PDF-Readern nicht
anders, aber der Anspruch „sicherer als PDF“ wäre ohne Belege Marketing.

### 2.5 Editor

- **Semantischer Block-Editor**, kein Layout-Editor: Abschnitte, Überschriften, Absätze, Listen,
  Tabellen, Abbildungen, Formularfelder, Komponenten. Struktur ist Pflicht, freie Positionierung
  gibt es nicht.
- **Barrierefreiheit beim Schreiben erzwingen:** Alt-Text-Pflicht, Überschriftenhierarchie,
  Sprache je Abschnitt, Tabellenköpfe, Kontrastprüfung, Formular-Labels. Begründung: In der Praxis
  sind sowohl Websites (95,9 % mit Fehlern, [WebAIM](https://webaim.org/projects/million/)) als
  auch Behörden-PDFs (9,5 % PAC-konform, [axes4](https://www.axes4.com/en/blog/post/2026-1/only-9-5-pac-compliant-what-the-new-study-on-pdf-accessibility-in-the-public-sector-reveals))
  schlecht; der Vorteil von HTML entsteht nur durch das Werkzeug.
- **Vorschau in mehreren Breiten** gleichzeitig (Telefon, Tablet, Desktop, Druck), weil Autoren
  responsives Verhalten sonst nicht beurteilen können.
- Lehre aus Distill („50+ hours per article“, [Distill](https://distill.pub/2021/distill-hiatus/)):
  **Der Editor ist der Engpass**, nicht das Format. Ohne guten Editor gibt es keine Dokumente.

---

## 3. Responsives Layout als Gestaltungsauftrag

### 3.1 Absicht statt Position beschreiben (Vorschlag)

| Absicht | Ausdrucksmittel | Beleg / Stand |
|---|---|---|
| **Reihenfolge** | DOM-Reihenfolge = Lesereihenfolge = Reihenfolge für Hilfstechnik. Kein CSS-Umsortieren (`order`, Grid-Platzierung), das davon abweicht | WCAG verlangt, dass die Darstellungsreihenfolge die Bedeutung nicht verändert ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)) |
| **Gewicht/Betonung** | semantische Elemente (`strong`, `em`, `aside`, `figure`) plus Prioritätsattribut je Block (Vorschlag `data-hp-priority="1…3"`): auf schmalen Bildschirmen wird Priorität 3 eingeklappt, **nie entfernt** | eigene Konvention, kein Standard |
| **Zusammenhalt** | `break-inside: avoid` für Tabellen und Abbildungen, „Überschrift bleibt beim nächsten Block“ | `break-*` in allen drei Engines ([Notiz C](quellen/recherche-c-satz-interaktiv-alternativen.md)) |
| **Umbruch und Zeilenfall** | `hyphens: auto` mit korrektem `lang`; `text-wrap: balance` für Überschriften | `text-wrap: balance` in Chrome 114, Firefox 121, Safari 17.5 (Sekundärquelle, [Chrome](https://developer.chrome.com/docs/css-ui/css-text-wrap-balance)) |
| **Komponenten passen sich ihrem Platz an** | Container Queries statt Viewport-Breakpoints | seit 2023 in Chrome 105, Firefox 110, Safari 16 ([MDN](https://developer.mozilla.org/docs/Web/CSS/container); [web.dev Baseline 2023](https://web.dev/blog/baseline2023)) |
| **Tabellen** | Autor wählt je Tabelle eine Strategie: horizontal scrollen, als Karten stapeln, Spalten priorisieren, transponieren | Branche empfiehlt Scroll-Container ([EDRLab](https://qualebook.edrlab.org/en/rules/078/)); Liquid Mode scheitert an dichten Tabellen ([Adobe](https://www.adobe.com/devnet-docs/acrobat/android/en/lmode.html)) |
| **Abbildungen** | SVG mit `viewBox`; Mindest-Lesebreite; Mehrfachdarstellung (interaktiv, statisch, Datentabelle) | MIME-Bundle-Prinzip ([Jupyter](https://nbformat.readthedocs.io/en/latest/format_description.html)) |
| **Leser-Anpassung** | definierte CSS-Variablen für Schrift, Größe, Zeilen-, Wort- und Absatzabstand, Kontrast; der Reader setzt sie, das Dokument muss sie respektieren | EAA verlangt „anpassbaren Abstand zwischen den Buchstaben, Zeilen und Absätzen“ ([EUR-Lex](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32019L0882)) |
| **Zitierbarkeit ohne Seitenzahlen** | stabile Block-IDs (Absatznummern), Textanker | Blocknummern statt Seitenzahlen ([Crichton](https://willcrichton.net/notes/portable-epubs/)); Text Fragments `#:~:text=` in Chrome 89, Firefox 131, Safari 18.2 ([web.dev](https://web.dev/articles/text-fragments)); W3C Web Annotation Data Model mit `TextQuoteSelector` ([W3C](https://www.w3.org/TR/annotation-model/)) |

### 3.2 Was dabei verloren geht (ehrlich)

- **„Seite 7, dritter Absatz“** als Zitierform. Ersatz durch Absatznummern verlangt neue
  Gewohnheiten in Recht, Verwaltung und Wissenschaft.
- **Gestalterische Kontrolle:** Satzspiegel, exakte Zeilenumbrüche, Bild-Text-Bezüge auf einer
  Doppelseite. Dokumente, deren Bedeutung an der Gestaltung hängt (Plakate, Magazine, technische
  Zeichnungen, Pläne), sind kein Zielgebiet; die KOST hält fest, dass „viele Webseiten nur bei
  korrekter grafischer Darstellung inhaltlich verständlich sind“ ([KOST](https://kost-ceco.ch/cms/kad_html_de.html)).
- **Formulare mit fester Geometrie** (Amtsformulare, Ankreuzraster, maschinenlesbare Belege für
  Scan-Verarbeitung) verlieren ihre Form.
- **Identische Darstellung für alle Beteiligten:** Bei einem Vertrag sieht nicht jeder dasselbe
  Bild. Das ist rechtlich das Kernproblem (Abschnitt 5.2).
- **Druckqualität:** Druck wird ein Export (Abschnitt 4.2), mit den Lücken von CSS Paged Media
  (Fußnoten, laufende Kopfzeilen nur über Polyfills oder Print-Engines).
- **Mehraufwand für Autoren:** Wer responsiv schreibt, muss mehrere Breiten prüfen.

---

## 4. Übergang: PDF ↔ html-Pro

### 4.1 PDF → html-Pro

| Ausgangslage | Weg | Qualität (erwartet) |
|---|---|---|
| **Getaggtes PDF** (PDF/UA, gute Tags) | Tag-Baum direkt in HTML-Struktur abbilden; WTPDF nennt HTML-Ausgabe ausdrücklich als Wiederverwendungsziel ([WTPDF](https://pdfa.org/wp-content/uploads/2024/02/Well-Tagged-PDF-WTPDF-1.0.pdf)) | gut; Struktur ist schon da |
| **Ungetaggtes PDF** (der Normalfall: 37,4 % der Behörden-PDFs ganz ohne Tags, [axes4](https://www.axes4.com/en/blog/post/2026-1/only-9-5-pac-compliant-what-the-new-study-on-pdf-accessibility-in-the-public-sector-reveals)) | ML-Konverter: **Docling** (IBM, MIT-Lizenz, lokal, erkennt Layout, Lesereihenfolge, Tabellen, exportiert HTML, [Docling](https://github.com/docling-project/docling)); Alternative **Marker** (GPL-3.0, HTML-Ausgabe, [PyPI](https://pypi.org/project/marker-pdf/)) | mittel; manuelle Nacharbeit nötig, Quote **OFFENE FRAGE** (Phase-2-Test mit eigenem Korpus) |
| **Scan** | OCR (Docling bietet optionale OCR) | wie oben, schlechter |
| **Formulare (AcroForm)** | Felder → `<hp-form>` + `data/form.json` + Schema; einfache Berechnungen übertragbar, beliebiges PDF-JavaScript nicht automatisch | **OFFENE FRAGE**, welcher Anteil realer Formulare automatisch übertragbar ist; XFA-Formulare nicht untersucht |
| **Signiertes PDF** | Signatur lässt sich nicht übertragen; Original-PDF mit Signatur bleibt als Beweis in `original/` | – |

**Regeln (Vorschlag):**
- Das Original-PDF bleibt im Container (`original/`), die Konvertierung wird im Manifest vermerkt.
  Das entspricht GoBD Rz. 135: Bei Konvertierung sind grundsätzlich beide Fassungen aufzubewahren
  (Sekundärquelle, [PSP](https://www.psp.eu/assets/pdfs/gobd_experten_erlaeutern_ersetzendes_konvertieren.pdf)).
- **pdf2htmlEX** und ähnliche Werkzeuge erzeugen pixelgenaue, absolut positionierte HTML-Kopien,
  also Papiersimulation; das Projekt sucht seit Jahren neue Maintainer
  ([best-of-web](https://best-of-web.builder.io/library/pdf2htmlEX/pdf2htmlEX), Sekundärquelle).
  Für html-Pro höchstens als „Originalansicht“ brauchbar, nicht als Zielstruktur.

### 4.2 html-Pro → PDF (und andere Formate)

| Ziel | Weg | Begründung |
|---|---|---|
| **PDF/A-2 + PDF/UA** (Justiz, Archiv, Behörden) | Dokument einfrieren (Signaturprofil), dann **WeasyPrint** (BSD; PDF/A-1…4, PDF/UA-1/-2, [Doku](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)); Prüfung mit **veraPDF** (offener PDF/A- und PDF/UA-Validator, GPLv3+/MPLv2+, [GitHub](https://github.com/veraPDF/veraPDF-library)) | WeasyPrint garantiert keine Validität; Prüfung ist Pflicht |
| **PDF/A-3-Hybrid** | PDF/A-3 mit eingebettetem `.hpro`-Container als Anhang | Muster ZUGFeRD/Factur-X ([FeRD](https://www.ferd-net.de/en/downloads/publications/details/zugferd-24-english)); alte Empfänger lesen das PDF, neue den Container |
| **Druckvorschau im Reader** | Paged.js im Browser ([Paged.js](https://pagedjs.org/)) | clientseitig, aber Release-Stillstand seit 2023 |
| **Schneller Druck aus dem Reader** | Druck-zu-PDF der Engine; Chromium erzeugt seit Version 85 Tagged PDF ([Chromium-Blog](https://blog.chromium.org/2020/07/using-chrome-to-generate-more.html)) | PDF/UA-Qualität ungeprüft (**OFFENE FRAGE**) |
| **PAdES-signiertes PDF je Dokument** | nach dem Export signieren | ERVV § 4 Abs. 2 verbietet gemeinsame Signatur über mehrere Dokumente ([ERVV](https://www.gesetze-im-internet.de/ervv/__4.html)) |
| **EPUB 3** | fast kostenlos, wenn der Container EPUB-kompatibel ist (Abschnitt 1.6) | Verbreitung in Bibliotheken/Lesegeräten |
| **E-Rechnung** | `data/` nach EN 16931 (XRechnung/ZUGFeRD) erzeugen | html-Pro ist keine E-Rechnung, kann aber eine erzeugen ([§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html)) |
| DOCX, ODT | nicht untersucht | **OFFENE FRAGE** (z. B. über Pandoc) |

---

## 5. Recht und Vertrauen

### 5.1 Signaturen und Zeitstempel

- Format: **ASiC-E mit XAdES Baseline**, B-T beim Signieren (qualifizierter Zeitstempel),
  B-LT mit eingebetteten Validierungsdaten, B-LTA mit Archivzeitstempeln für lange Fristen
  ([EN 319 162-1](https://www.etsi.org/deliver/etsi_en/319100_319199/31916201/01.01.01_60/en_31916201v010101p.pdf);
  [DVO 2025/1929](https://eur-lex.europa.eu/eli/reg_impl/2025/1929/oj)).
- Signieren: AdES lokal mit eigenem Zertifikat; QES per Fernsignatur (CSC API) bei einem
  qualifizierten Anbieter, in Österreich naheliegend A-Trust/ID Austria (Anbindung **OFFENE FRAGE**),
  später EUDI-Wallet (Pflicht zum kostenlosen QES-Signieren, Art. 5a eIDAS,
  [EUR-Lex](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02014R0910-20240520)).
- Prüfen: integrierter Validator auf Basis EU DSS mit EU-Vertrauenslisten; Ergebnis muss mit
  DSS-Demo und RTR-Prüfdienst übereinstimmen (Testsuite).
- Der Signaturvorgang muss selbst barrierefrei sein (EAA Anhang I Abschnitt IV).

### 5.2 „What you see is what you sign“ – Signaturprofil

Weil § 371a ZPO an eine „Erklärung“ und § 126a BGB an ein „gleichlautendes Dokument“ anknüpft
([§ 371a ZPO](https://www.gesetze-im-internet.de/zpo/__371a.html),
[§ 126a BGB](https://www.gesetze-im-internet.de/bgb/__126a.html)), muss das Signierte eindeutig
sein. **Vorschlag:**

1. Signiert wird nur im Profil **Signiert/Archiv**: keine Skripte, keine externen Ressourcen,
   Formularwerte als Daten.
2. Die Signatur deckt **alle** Dateien inklusive Schriften, CSS und Komponenten ab.
3. Der Reader zeigt beim Signieren und Prüfen eine **Zusammenfassung der Erklärung** (Texte,
   Werte, Anlagen) in einer festen, linearen Darstellung.
4. **Optional** wird eine Referenzdarstellung (`renditions/reference.pdf`, PDF/A) mitsigniert.

**Schwäche:** Punkt 4 holt Papiersimulation durch die Hintertür zurück. Ohne ihn hängt der
Beweiswert an der Frage, ob die Darstellung auf allen Geräten inhaltlich gleich ist. Das ist bei
reinem Text und Tabellen plausibel, aber nicht belegt; Rechtsprechung dazu fehlt
(**OFFENE FRAGE**, juristische Prüfung in Phase 2 empfohlen).

### 5.3 Archivierbarkeit und Aufbewahrung

- **Original byte-identisch aufbewahren**, mit Hash, Signatur und Zeitstempel. Das erfüllt die
  Unveränderbarkeit (§ 146 Abs. 4 AO, § 190 Abs. 4 UGB).
- **Viewer für die gesamte Frist** bereitstellen (§ 147 Abs. 5 AO, § 132 Abs. 3 BAO). Ein offener
  Referenz-Reader und eine öffentliche Spezifikation sind deshalb keine Kür, sondern Pflicht.
- **Strukturierte Daten** maschinell auswertbar exportieren (§ 147 Abs. 2 und 6 AO).
- **Archiv-Export:** PDF/A-2 oder PDF/A-3-Hybrid; für Web-Archive optional WACZ. Ein
  ASiC-E-Container kann in TR-ESOR-Archive (ASiC-AIP) eingestellt werden
  ([BSI](https://www.bsi.bund.de/EN/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03125/BSITR03125.html)).
- Österreich ist günstiger: Für rein elektronische Unterlagen entfällt die urschriftgetreue
  Wiedergabe ([§ 132 BAO](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003940&Paragraf=132)).
  Deutschland: Was bei responsiven Belegen das „Bild“ ist, ist offen (**OFFENE FRAGE**).

### 5.4 Barrierefreiheitsnachweis

- Metadaten nach EPUB Accessibility 1.1 im Manifest (Abschnitt 1.3).
- Ein **Prüfbericht** im Container (`META-INF/accessibility-report.json`, Vorschlag): automatische
  Prüfungen, geführte manuelle Prüfungen mit Ergebnis, Zuordnung zu WCAG 2.2 und EN 301 549.
  Automatik allein reicht nicht: Beim Matterhorn-Protokoll erfordern 47 von 136 Bedingungen
  menschliches Urteil ([PDFlib](https://www.pdflib.com/pdf-knowledge-base/pdfua/matterhorn-protocol)),
  axe-core findet im Schnitt 57 % der WCAG-Probleme ([axe-core](https://github.com/dequelabs/axe-core)).
- Der Bericht wird mitsigniert, damit er nachträglich nicht geschönt werden kann.

### 5.5 Normungsweg

Die E-Rechnung zeigt: Akzeptanz kommt über Normen und Behördenlisten, nicht über Produktqualität
([Notiz B, 5.4](quellen/recherche-b-recht-vertrauen-barrierefreiheit.md)). **Vorschlag:**
Spezifikation offen und versioniert veröffentlichen, früh eine W3C Community Group gründen
([W3C Community Groups](https://www.w3.org/community/)) bzw. den Austausch mit der Publishing
Maintenance WG suchen, und konsequent vorhandene Normen wiederverwenden (OCF, ASiC, XAdES, EPUB
Accessibility, Web Annotations). Ein ETSI- oder ISO-Verfahren ist erst nach Verbreitung realistisch.

---

## 6. Roadmap MVP

### 6.1 Was das MVP leisten soll

**Ziel:** Ein Unternehmen oder eine Kanzlei kann ein Dokument (Angebot, Vertrag, Bericht,
Formular) in html-Pro erstellen, versenden, ausfüllen und kommentieren lassen, fortgeschritten
signieren und als PDF/A ablegen, ohne dass Empfänger ein Konto brauchen.

| Im MVP | Nicht im MVP (spätere Ausbaustufen) |
|---|---|
| Format v0.1: Container, Manifest, Profile *Statisch* und *Signiert*, eine Formularkomponente | weitere Komponenten (Diagramm, Rechenblatt), Profil *Interaktiv* voll |
| Reader: Web-App + Desktop-Hülle, Sandbox, Nutzereinstellungen, Suche, Inhaltsverzeichnis, Vorlesen über die System-Sprachausgabe (**OFFENE FRAGE**: Qualität der Web Speech API) | Mobile Apps |
| Editor: semantischer Block-Editor, Tabellen, Bilder, Formularfelder, Mehrbreiten-Vorschau | freie Gestaltung, Vorlagenbibliothek |
| Kommentare (Web Annotations) und Versionsvergleich auf Textebene | Echtzeit-Zusammenarbeit, Freigabe-Workflows in der Cloud |
| Barrierefreiheitsprüfung mit Bericht | KI-gestützte Alt-Texte |
| PDF-Import (Docling) mit Original im Container | OCR-Feinschliff, XFA |
| PDF-Export PDF/A-2 + PDF/UA (WeasyPrint + veraPDF), PDF/A-3-Hybrid | PDF/X, Druckvorstufe |
| AdES-Signatur (ASiC-E/XAdES, B-T), Validierung (DSS), ein QES-Anbieter per CSC | EUDI-Wallet, Mehr-Anbieter |
| Verschlüsselung als Umschlag (Passwort, Zertifikat) | Schwärzen mit Bereinigung (eigene Stufe, da sicherheitskritisch) |
| Öffentliche Spezifikation v0.1 + Testsuite | KI-Assistent, Automatisierung, Batch |

### 6.2 Aufwand MVP (Schätzung)

Die Werte sind **eigene Schätzungen ohne externe Quelle** in Personenmonaten (PM). Sie setzen ein
erfahrenes Team voraus und enthalten keine Puffer für Organisation, Vertrieb und Rechtsberatung.

| Paket | Aufwand (PM) | Haupt-Unsicherheit |
|---|---|---|
| Spezifikation v0.1 + Konformitäts-Testsuite | 3–6 | ASiC-/EPUB-Mime-Typ-Frage |
| Container-Kern (ZIP, Manifest, Hashes, Profile) | 2–4 | – |
| Reader inkl. Sandbox, Hülle, Einstellungen | 6–12 | Engine-Unterschiede WebKit/Chromium |
| Editor (semantisch, Formulare, Vorschau) | 10–20 | UX-Qualität entscheidet über Erfolg |
| Barrierefreiheitsprüfung + Bericht | 2–4 | manuelle Prüfführung |
| PDF-Export (WeasyPrint, PDF/A, PDF/UA, Validierung) | 2–5 | CSS-Abweichungen WeasyPrint |
| PDF-Import (Docling, Mapping, Formulare) | 3–6 | Qualität bei realen Dokumenten |
| Signatur (ASiC-E/XAdES, Zeitstempel, DSS, eine QES-Anbindung) | 4–8 | Zugang zu QTSP-Schnittstellen |
| Externe Sicherheitsprüfung + Härtung | 1–3 | Befunde |
| **Summe** | **33–68 PM** | ≈ 7–17 Monate mit 4–5 Personen |

Umrechnung in Geld nur unter einer **Annahme** (nicht recherchiert): Bei Vollkosten von
8.000–12.000 € je PM ergäben sich rund 0,26–0,82 Mio. €. Externe Kosten (Sicherheitsprüfung,
juristische Gutachten, Zertifikate, QTSP-Verträge) kommen hinzu.

### 6.3 Aufwandsklassen jenseits des MVP (Richtung Acrobat-Pro-Umfang)

Grobe Klassen statt Zahlen, weil der Umfang erst mit dem MVP-Feedback klar wird. Zuordnung der
Acrobat-Funktionen siehe [`02-acrobat-pro-funktionsumfang.md`](02-acrobat-pro-funktionsumfang.md).

| Klasse | Bedeutung | Beispiele |
|---|---|---|
| S | < 2 PM | Lesezeichen/Inhaltsverzeichnis, Wasserzeichen, Kopf-/Fußzeilen, Metadaten bereinigen |
| M | 2–6 PM | Schwärzen mit Mustern, Vergleichen mit Bericht, Stapelverarbeitung, Messwerkzeug für SVG |
| L | 6–12 PM | Mobile Apps, Review-Workflow mit Freigaben, Formular-Datensammlung, Druckvorstufen-Export (PDF/X über Vivliostyle/Prince) |
| XL | > 12 PM | Echtzeit-Zusammenarbeit (CRDT), KI-Assistent über mehrere Dokumente, Plug-in-/Skript-Schnittstelle, Zertifizierungen |

### 6.4 Empfohlene nächste Schritte (Phase 2)

1. **Container-Prototyp** bauen und gegen EU DSS, RTR-Prüfdienst, epubcheck und Thorium testen
   (klärt die zentrale Mime-Typ-Frage). Aufwand: 0,5–1 PM.
2. **Konvertierungstest** mit 50–100 echten PDFs aus dem Zielmarkt (Docling, Marker): Anteil
   brauchbarer Strukturen messen. Aufwand: 0,5–1 PM.
3. **Juristische Kurzprüfung** von Signaturprofil (WYSIWYS), § 147 AO „bildlich“ und
   EN 301 549 Kapitel 9/10. Externe Kosten; Umfang **OFFENE FRAGE**.
4. **Gespräch mit einem QTSP** (A-Trust) zur Fernsignatur-Schnittstelle.
5. **Zielgruppe schärfen:** Wo ist der Schmerz mit PDF am größten und der Behördenzwang am
   kleinsten (z. B. interne Berichte, Angebote, Schulungsunterlagen, B2B-Verträge in Österreich)?

---

## 7. Schwächen und Risiken der Idee

| Risiko | Warum es ernst ist | Gegenmaßnahme | Rest |
|---|---|---|---|
| **Adoption** | Web Publications 2019 „lack of practical business cases“ ([W3C](https://www.w3.org/TR/wpub/)), XPS zurückgebaut ([Microsoft](https://learn.microsoft.com/en-us/windows/whats-new/removed-features)), SXG 2026 abgekündigt ([Google](https://developers.google.com/public-key-infrastructure/updates/july2026-sxg-deprecation)) | Rückwärtskompatibilität (EPUB-Lesbarkeit, PDF-Export, PDF/A-3-Hybrid), Nische mit echtem Schmerz zuerst, offene Spezifikation | **hoch** |
| **WYSIWYS / Beweiswert** | responsive Darstellung ist nicht bildidentisch | Signaturprofil, optionale Referenzdarstellung | mittel bis hoch |
| **Behörden und Gerichte** | ERVV verlangt PDF und verbietet Container-Signaturen | PDF-Export als Pflichtfunktion | dauerhaft |
| **Archivakzeptanz** | LoC: HTML nur „acceptable“; KOST: nur ohne externe Ressourcen | EPUB-Nähe, PDF/A-Export, öffentliche Spezifikation | mittel |
| **Sicherheit** | HTML-Anhänge sind ein Hauptangriffsweg; Reader-RCE belegt | kein freies JS, Sandbox, signierte Komponenten, externe Prüfung | mittel |
| **Engine-Unterschiede** | Tauri nutzt WebKit und Chromium; CSS-Unterstützung unterscheidet sich | Testsuite, konservatives CSS-Profil | mittel |
| **Wettbewerb** | Adobe investiert in KI-Arbeitsräume (PDF Spaces, AI Assistant) statt in ein neues Format, siehe [02](02-acrobat-pro-funktionsumfang.md) | Positionierung als offenes Format, nicht als Acrobat-Klon | hoch |
| **Editor-Aufwand** | Distill scheiterte am Herstellungsaufwand | Editor zuerst gut machen, Vorlagen | mittel |
| **„Papier nicht simulieren“ vs. Praxis** | Druck, PDF-Export, Referenzdarstellung holen Seiten zurück | Seiten nur als Export, nie als Primärmodell | bewusst akzeptiert |

---

## 8. Offene Fragen dieses Konzepts

1. Mime-Typ: gleichzeitig EPUB-lesbar und ASiC-E-validierbar? (Prototyp)
2. Tauri oder Electron: Wie stark wirken sich WebKit/Chromium-Unterschiede auf Darstellung und
   Prüfung aus?
3. Signaturvalidierung ohne Java (DSS) im reinen Web-Reader möglich?
4. Beweiswert signierter responsiver Dokumente ohne Referenzdarstellung (juristisch).
5. Anteil automatisch konvertierbarer PDF-Formulare (AcroForm, XFA).
6. Fernsignatur-Schnittstelle A-Trust/ID Austria; QES-Fähigkeit der EUDI-Wallets DE/AT.
7. Wie gut ist Chromium-Tagged-PDF gegenüber WeasyPrint für PDF/UA?
8. DOCX/ODT-Export: Pandoc-Weg tragfähig?
9. Bedarf an Rechteverwaltung (DRM) für Geschäftsdokumente.
10. Schweiz: ZertES, GeBüV, Justitia 4.0 (nicht recherchiert).

---

## Nachtrag Phase 2

**Stand:** 11.10.2026 · **Grundlage:** [`05-prototyp-ergebnisse.md`](05-prototyp-ergebnisse.md)
(Container-Experiment) und [`06-plattform-und-funktionsmatrix.md`](06-plattform-und-funktionsmatrix.md).
Die Abschnitte 0–8 oben bleiben als Phase-1-Stand unverändert; dieser Nachtrag geht ihnen vor, wo
er abweicht.

### N.1 Was nicht kippt

- **Containeransatz trägt:** Eine Datei kann gleichzeitig gültiges EPUB 3 (epubcheck 5.4.0:
  0 Fehler) und gültig signierter ASiC-E-Container mit XAdES sein (EU DSS 6.5: `TOTAL_PASSED`),
  auch mit zwei Signaturen ([05, Fall V11](05-prototyp-ergebnisse.md#41-übersicht)). Die zentrale
  OFFENE FRAGE aus Abschnitt 1.6 ist damit **technisch beantwortet**. EN 319 162-1 §4.4.3.1 erlaubt
  bei XAdES als mimetype ausdrücklich „the original media type of the container“.
- HTML/CSS als Inhalt, OCF-Container, `manifest.json`, die drei Profile, Web-App als Kern und
  Signatur nach ASiC-E/XAdES bleiben wie vorgeschlagen.

### N.2 Was sich am Format ändert und warum

| Abschnitt | Bisher | Neu | Warum |
|---|---|---|---|
| 1.2, 1.6 | mimetype offen (`application/epub+zip` oder `…asic-e+zip`) | **`application/epub+zip`**, kein eigener Mime-Typ | EPUB verlangt ihn, ASiC-E/XAdES erlaubt ihn; ein eigener Mime-Typ bricht EPUB (`PKG-007`) und bringt bei DSS nichts (05, V7) |
| 1.2, 1.5, 5.1 | „ASiC-E mit XAdES“ | **nur XAdES, kein CAdES** | bei CAdES verlangt die Norm zwingend den ASiC-mimetype (§4.4.4.1); technisch lief es, normkonform ist es nicht (05, V6) |
| 1.2 | `META-INF/signatures001.xml` | **`META-INF/signatures.xml` mit OCF-Wurzel** (`<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container">`), alle Signaturen als Geschwister, neue ans Ende; exklusive Kanonisierung Pflicht | einzige Form, die beide Normen vorsehen; epubcheck prüft `signatures.xml` gegen das OCF-Schema und lehnt die ASiC-Wurzel ab (05, V4/V5/V11). Der Reader liest zusätzlich `signaturesNNN.xml`, wie andere ASiC-Werkzeuge sie schreiben |
| 1.5 | „Signatur referenziert jede Datei“ | ausdrücklich **auch `META-INF/container.xml`** | DSS lässt die Datei beim Ergänzen einer zweiten Signatur weg (05, V10) |
| 1.5 | Kommentare nach der Signatur „ausdrücklich ausgenommen“ | bestätigt; der Reader **muss** unsignierte Dateien benennen | DSS meldet nachträglich ergänzte Dateien nur als Warnung „Not all files are signed!“ (05, V9) |
| 2.1 Container-Kern | ZIP lesen/schreiben | **eigener ZIP-Schreiber**; die Signaturbibliothek liefert nur die XAdES-Signatur | DSS setzt den EPUB-mimetype nicht selbst (schreibt `application/octet-stream`, 05, V2a) |
| 5.1 Prüfen | DSS mit EU-Listen | zusätzlich eine **mitgelieferte DSS-Validierungsrichtlinie**, die `application/epub+zip` akzeptiert | Standardrichtlinie warnt, eine strenge Richtlinie lehnt ab (05, V3) |
| 1.2 Endung | `.hpro` | `.hpro` für die Dateizuordnung; **„Als EPUB weitergeben“ = dieselben Bytes als `.epub`** | Signatur und EPUB-Gültigkeit hängen nicht an der Endung (05, V7). **OFFENE FRAGE:** EN 319 162-1 verlangt `.asice`/`.sce` |
| 1.6, 7 | EPUB-Rückfallebene als Argument für Vertrauen | Rückfallebene = **Lesbarkeit, nicht Beweiskraft** | EPUB-Reader prüfen keine Signaturen; calibre zeigt eine manipulierte Datei kommentarlos an (05, V8) |

Geänderter Ausschnitt des Containers aus 1.2:

```
vertrag.hpro                      ZIP (OCF-Muster), identische Bytes auch als vertrag.epub
├── mimetype                      "application/epub+zip", erste Datei, unkomprimiert
├── META-INF/
│   ├── container.xml             OCF; wird mitsigniert
│   ├── signatures.xml            OCF-Wurzel <signatures>, darin 1…n XAdES-ds:Signature
│   ├── manifest.xml              optional (ODF-Manifest, von EPUB-Readern ignoriert)
│   └── …                         Rest wie in 1.2
```

### N.3 Was sich an der Architektur ändert und warum

Aus [06](06-plattform-und-funktionsmatrix.md):

- **Kern und Adapter:** Der TypeScript-Kern spricht nur mit Schnittstellen (`Storage`, `Signer`,
  `Validator`, `Scanner`, `Ocr`, `PdfExport`, `Print` u. a.). Jede Plattform liefert Adapter
  ([06, 4.1](06-plattform-und-funktionsmatrix.md#41-kern-und-adapter)).
- **Hülle (OFFENE FRAGE 2 aus Abschnitt 8, teilweise entschieden):** Tauri 2 für Desktop, dieselbe
  App als PWA. Für Mobil folgt ein Spike mit Abbruchkriterien; Capacitor ist Plan B. Electron bleibt
  Desktop-Rückfall, falls WebKit/WebKitGTK die Engine- oder Barrierefreiheitstests nicht bestehen.
- **Neuer Baustein „html-Pro-Dienst“ (selbst hostbar):** WeasyPrint, Docling und DSS laufen lokal
  nur am Desktop als Sidecar. Für gleichen Funktionsumfang bei Export, Import und Validierung
  brauchen Web, iOS und Android diesen Dienst. Abschnitt 2.3 („Was geht ohne Server?“) gilt damit
  nur für Desktop vollständig.
- **QES:** Standardweg auf allen Plattformen ist die Fernsignatur (CSC). Lokale Kartensignatur ist
  eine Desktop-Zusatzfunktion; im Web ist sie nicht möglich.
- **Sandbox (Abschnitt 2.4, Punkt 4):** Unter Linux und Android muss gemessen werden, ob ein
  `sandbox`-iframe den Tauri-IPC erreicht ([06, 3.3](06-plattform-und-funktionsmatrix.md#33-sandbox-isolation-je-plattform)).
- **Mobile Apps** sind nicht mehr nur „spätere Ausbaustufe“ (6.1), sondern Teil des Zielbilds
  „alle Plattformen“: zusätzlich **16–35 PM** gegenüber dem MVP, davon 7–15 PM Mobil (eigene
  Schätzung, [06, 4.2](06-plattform-und-funktionsmatrix.md#42-aufwand-eigene-schätzung-personenmonate)).
  Die MVP-Schätzung aus 6.2 (33–68 PM) bleibt für Web + Desktop bestehen.

### N.4 Offene Fragen aus Abschnitt 8, neuer Stand

| Nr. | Frage | Stand |
|---|---|---|
| 1 | Mime-Typ EPUB + ASiC-E | **technisch beantwortet** (ja, mit XAdES); offen bleiben Endung und Reaktion fremder Prüfdienste (RTR, DSS-Demo, DigiDoc) |
| 2 | Tauri oder Electron | **teilweise**: Tauri mit Testsuite-Vorbehalt; Messung WebKit/WebKitGTK steht aus |
| 3 | Validierung ohne Java | **teilweise beantwortet (P2):** TypeScript-Prüfung für Niveau B im Kern, gleiches Urteil wie DSS 6.5 in 39/39 Fällen ([Belege P2](belege/P2/README.md)); offen: Vertrauenslisten, CRL/OCSP, Zeitstempel ([06, Frage 12](06-plattform-und-funktionsmatrix.md#5-offene-fragen)) |
| neu | Signieren ohne Java (Web, mobil) | **beantwortet für Niveau B (P3):** der Kern signiert mit WebCrypto-Schlüssel und eigenem ZIP-Schreiber; epubcheck 0 Fehler, DSS 6.5 `TOTAL_PASSED`, Manipulation `HASH_FAILURE` bei Kern und DSS ([Belege P3](belege/P3/README.md)). Der in N.5 vorgesehene „DSS-Sidecar“ ist zum Signieren nicht mehr nötig. Offen: Zeitstempel (B-T/LTA, P10), PKCS#12-Import, qualifizierte Schlüssel |
| neu | Endung `.hpro`/`.epub` gegen `.asice` (EN 319 162-1 §4.4.3.1 Nr. 1) | offen; ETSI/Prüfdienst und juristisch klären |
| neu | Verhalten von Thorium, Apple Books, ADE, Readium mit dem Zielformat | nicht geprüft (GUI/Geräte fehlten) |

### N.5 Nächste Phase (Phase 3, Vorschlag)

**Ziel:** technischer Durchstich, der die verbliebenen Messfragen beantwortet, bevor das MVP startet.

| Paket | Aufwand (PM, eigene Schätzung) |
|---|---|
| Zielformat bei Readern (Thorium, Apple Books, ADE, Readium) und Fremdvalidatoren (RTR, DSS-Demo, DigiDoc) prüfen | 0,25–0,5 |
| XAdES B-T/B-LT mit Test-QTSP, Gespräch A-Trust (CSC) | 0,5–1 |
| Container-Kern in TypeScript (lesen, schreiben, Manifest, Hashes, eigene ZIP-Schreibung) + Signatur über DSS-Sidecar | 2–4 |
| Hülle: Tauri-Desktop + PWA-Grundgerüst, Sandbox-Messung Linux/Android, Engine-Testsuite in WebView2/WebKit/WebKitGTK/Chromium | 1–2 |
| Tauri-Mobil-Spike mit Abbruchkriterien ([06, 4.4](06-plattform-und-funktionsmatrix.md#44-abbruchkriterien-für-den-tauri-mobil-spike)) | 0,5–1 |
| Konvertierungstest mit 50–100 echten PDFs (aus 6.4) | 0,5–1 |
| **Summe** | **≈ 5–10 PM**, Aufwandsklasse **M bis L** (Klassen aus 6.3) |

Externe Kosten (juristische Kurzprüfung, QTSP-Testzugang) kommen hinzu; Umfang **OFFENE FRAGE**.
