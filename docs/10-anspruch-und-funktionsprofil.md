# 10 – Anspruch und Funktionsprofil

**Stand:** 11.10.2026. Nachschärfung des Auftrags durch den Auftraggeber. Dieses Dokument ist ab
jetzt für jeden Arbeitslauf verbindlich — es beschreibt, **was** html-Pro sein soll, jenseits der
Frage, wie es technisch gebaut wird.

---

## 1. Zweck in einem Satz

html-Pro ist ein **Datei-Austauschformat für Information, die für Bildschirme gemacht ist** — nicht
für Papier. Es ersetzt nicht das Papier, es ersetzt die **Nachahmung des Papiers**.

Das klassische PDF ist am Ende seines Formats ein digitaler Bogen DIN A4: eine feste Seite mit
fixierter Geometrie, auf die alles gepresst wird. html-Pro dreht das um: die Information steht im
Vordergrund, die Darstellung richtet sich nach dem Gerät — und der Ausdruck ist eine **Ausgabe**,
nicht die Grundlage.

---

## 2. Sechs Zusagen

Jede Zusage ist eine Eigenschaft des Formats, keine Funktion der Oberfläche. Jede muss prüfbar sein.

### Zusage 1 — Bildschirm zuerst

Ein Dokument ist auf einem Telefon lesbar, ohne zu zoomen, und auf einem 32-Zoll-Monitor sinnvoll
genutzt, ohne dass es wie ein vergrößertes Blatt wirkt. Zwei Darstellungsarten sind vorgesehen:
**fließend** (Standard, passt sich an) und **seitengetreu** (feste Ansicht, für Vergleichbarkeit und
Druckvorschau). Die fließende Ansicht ist die Wahrheit, die feste die Ausnahme.

*Prüfbar:* Dieselbe Datei in drei Breiten gerendert, ohne waagrechtes Scrollen, ohne
Schriftgrößen-Bastelei.

### Zusage 2 — Lebendig statt statisch

Was ein Bildschirm kann, darf das Dokument nutzen: **Animation, Video, Ton, Interaktion,
Aufklappen, Filtern, Sortieren, Rechnen**. Grenzen sind gesetzt, damit daraus kein Webangebot wird:

- Interaktive Teile sind **deklarierte Komponenten** in einer abgeschotteten Sandbox, nicht
  beliebiger Code im Dokument.
- Sie dürfen **nichts nach außen** senden, nichts nachladen, nichts speichern außer im Dokument.
- Fällt JavaScript aus, bleibt ein **statisches Äquivalent** sichtbar (Standbild, Beschreibung) —
  das Dokument bleibt lesbar, nur ohne Bewegung.
- Bewegte Inhalte respektieren die Systemeinstellung für reduzierte Bewegung.

*Prüfbar:* Ein Dokument mit Animation und Video in einer Sandbox gerendert; es erreicht nachweislich
kein Netzwerk; ohne Skripte bleibt es vollständig lesbar.

### Zusage 3 — Verschachtelte Information

Information darf **tief** sein, ohne unübersichtlich zu werden: Abschnitte aufklappbar,
Unterdokumente eingebettet, Detailtiefe wählbar — vom Überblick bis zur Einzelheit, ohne ein zweites
Dokument. Anhänge sind Teil des Dokuments, keine Beigaben.

Dazu gehört der Ersatz für den stabilen Bezug des Papiers: Papier hat Seitenzahlen, html-Pro hat
**stabile Adressen** (Pfad und Kennung je Abschnitt) — zitierbar, verlinkbar, unabhängig von
Gerät und Layout. Der Ausdruck setzt daraus automatisch Seitenzahlen und ein Verzeichnis.

*Prüfbar:* Ein Verweis auf einen Abschnitt bleibt gültig, wenn die Schriftgröße, die Fensterbreite
oder das Gerät wechselt; im Ausdruck erscheint er als Seitenzahl plus Abschnittskennung.

### Zusage 4 — Leicht zu bearbeiten

Bearbeiten heißt ändern, nicht übermalen. Die Quelle ist Text und Struktur, deshalb:

- Text ist Text (kein Overlay-Trick, keine Font-Anpassung — der Vorteil aus
  [07, Abschnitt 3a](07-foren-und-nutzererwartungen.md)),
- Struktur bleibt Struktur (Überschriften, Listen, Tabellen, Verweise),
- Änderungen sind nachvollziehbar (Verlauf, Vergleich zweier Fassungen).

*Prüfbar:* Ein bearbeiteter Absatz steht als Text im Container und ist auffindbar; der Vergleich
zweier Fassungen zeigt die Änderung als Textänderung, nicht als Bilddifferenz.

### Zusage 5 — Sperrbar und vertrauenswürdig

Ein Dokument muss **festgeschrieben** werden können: signiert, zeitgestempelt, unveränderlich, mit
Prüfprotokoll. Abschnitte müssen sperrbar sein (nur lesen, nicht drucken, nicht exportieren,
ausgeblendet) und Redaktion muss **löschen**, nicht überdecken (der Befund aus
[07, Abschnitt 3b](07-foren-und-nutzererwartungen.md)).

Ehrliche Grenze: Gegen Kopieren gibt es **keinen** technischen Schutz. Wer etwas sieht, kann es
abschreiben. Was html-Pro verspricht, ist Nachweisbarkeit, nicht Abschottung.

Der Konflikt zwischen lebendig und signiert wird nicht weggeredet, sondern in **zwei Profile**
geteilt:

| Profil | Inhalt | Signatur |
| --- | --- | --- |
| **Lebendig** | Animation, Interaktion, Formulare, Filter | nicht signierbar im Vollsinne; signierbar ist die Struktur, nicht die Erscheinung |
| **Eingefroren** | statisches Äquivalent, Erscheinung festgeschrieben, keine Skripte | signierbar und zeitstempelbar, Langzeitprüfung möglich |

Das Dokument kann **beide** enthalten: die lebendige Fassung für die Arbeit, die eingefrorene als
Nachweis. Genau das ist der smarte Teil — ein PDF kann nur die eingefrorene.

*Prüfbar:* Die eingefrorene Fassung ist signiert und geprüft; die lebendige Fassung lässt sich
anzeigen und bearbeiten, ohne die Signatur der eingefrorenen zu berühren; eine Änderung an der
eingefrorenen Fassung wird als Manipulation erkannt.

### Zusage 6 — Druckbar nach DIN A4, aber abgeleitet

Der Ausdruck kommt aus dem digitalen Layout, nicht aus einer nachgebauten Seite: Umbruchregeln,
Kopf- und Fußzeile, Seitenzahlen, Verzeichnis, kein abgeschnittener Rand, keine halben Tabellen.

Was nicht auf ein Blatt passt, wird sinnvoll verteilt: Tabellen wiederholen ihre Kopfreile,
Codeblöcke brechen mit Markierung um, Animationen und Video werden zu Standbild mit Beschreibung
und Verweis auf die lebendige Fassung.

*Prüfbar:* Ein Dokument mit langen Tabellen, Code und Video druckt auf A4: keine abgeschnittenen
Inhalte, Kopfzeile und Seitenzahlen vorhanden, Video als Standbild mit Bildunterschrift, und der
Ausdruck nennt für jedes interaktive Element die lebendige Quelle.

---

## 3. Was das für die Bauentscheidungen heißt

1. **Papier ist eine Ausgabe, nicht die Grundlage.** Kein Modell, das intern Seiten kennt und daraus
   Bildschirmdarstellung ableitet. Umgekehrt: Struktur zuerst, Seite am Ende.
2. **Eine Datei, kein Dienst.** Austauschformat heißt: per Mail, Messenger oder Behördeneingang
   weitergebbar, offline lesbar, ohne Konto, ohne Server. Serverdienste sind Zusatz, nie Bedingung.
3. **Der Standard ist das Produkt, nicht die Anwendung.** html-Pro ist als **offener Standard**
   angelegt, der PDF ablösen soll. Die Clients (Reader, Bearbeiter, Browser-Erweiterung,
   Betriebssystem-Einbindung) sind Werkzeuge zu diesem Standard — sie kommen später und dürfen die
   Standardentwicklung nicht bestimmen. Ein PDF-Export bleibt als **Brücke** für den
   Übergangszeitraum vorgesehen (Ämter, Gerichte, Archive), ist aber nicht das Ziel des Formats und
   keine Pflicht für jede Datei.
4. **Sicherheit im Format, nicht in der Oberfläche.** Lebendige Inhalte laufen ausschließlich in der
   Sandbox. Prüfregeln dafür gehören in den Kern.
5. **Barrierefreiheit ist kein Anhang.** Semantisches HTML und reflowable Darstellung sind der
   Vorsprung gegenüber PDF — er wird nicht durch verschachtelte, nur per Maus bedienbare
   Interaktion verspielt.
6. **Formate ohne Umsetzer sterben.** (XPS, Web Publications.) Deshalb Reader, Bearbeiter und
   Rückfallweg zu PDF von Anfang an — nicht ein Standardpapier, sondern Werkzeuge.

---

## 4. Der Standard selbst

html-Pro ist kein Dateiformat eines Anbieters, sondern ein **offener Standard** mit dem Ziel, PDF
abzulösen. Daraus folgen Anforderungen, die unabhängig von jeder Anwendung gelten.

**a) Offenheit, die man nachweisen kann**

- **Veröffentlichte, versionierte Spezifikation** mit normativen Anforderungen (Muss/Soll/Kann),
  nicht bloß eine Beschreibung.
- **Royalty-freie Nutzung** der Pflichtteile. Wo fremde Rechte berührt werden könnten, wird das
  offengelegt; ob eine Anerkennung bei einem Gremium angestrebt wird (W3C, ISO, OASIS), ist eine
  Governance-Entscheidung und keine technische.
- **Aufbau auf vorhandenen offenen Standards**: ZIP, HTML, CSS, Web Crypto, XML-Signaturen, XAdES,
  RFC 3161, das OCF-Muster von EPUB. Nichts Eigenes, wo ein offener Standard schon steht.
- **Keine Anbietersignatur im Pflichtteil**: kein Merkmal, das nur ein Hersteller erzeugen oder lesen
  kann.
- **Erweiterungsmechanismus**: eigene Erweiterungen erlaubt, aber abgegrenzt und deklariert — ein
  Standardleser bricht daran nicht.

**b) Überprüfbarkeit durch Dritte**

- **Konformitätsstufen** (Vorschlag: Basis, Lebendig, Signiert, Archiv) mit Muss/Soll/Kann je Stufe.
- **Konformitätsprüfer und öffentliche Testsuite** — die Aussage „ist html-Pro" muss an ein messbares
  Ergebnis gebunden sein, so wie epubcheck das für EPUB leistet.
- **Referenzimplementierung unter offener Lizenz** (Kern und minimaler Reader), damit die
  Weiterentwicklung nicht an einem Anbieter hängt.

**c) Lebensfähigkeit**

- **Versionierung und Aufwärtskompatibilität**: alte Dateien bleiben lesbar, neue Dateien dürfen
  bestehende Leser nicht brechen.
- **Langzeitlesbarkeit**: die statische Grundschicht bleibt dauerhaft lesbar; für lebendige Inhalte
  wird festgelegt, wie lange sie laufen müssen und was passiert, wenn eine Komponente verschwindet.
- **Migration**: hinein aus PDF, Word und Markdown, hinaus nach PDF als Brücke.
- **Sicherheitsregeln sind Teil der Spezifikation**: was in der Sandbox laufen darf, steht im
  Standard und im Prüfregelwerk, nicht in der Anwendung.

**d) Clients sind Werkzeuge, nicht der Standard**

Reader, Bearbeiter, Browser-Weg, Betriebssystem-Einbindung und Handy-Apps kommen später. Für die
Standardentwicklung zählt: eine Datei muss **beschreibbar, prüfbar und lesbar** sein. Der Browser-Weg
ist ausdrücklich denkbar — dann braucht niemand eine Installation —, ist aber keine Bedingung für
diese Phase.

**e) Warum das der schwierigere Weg ist**

Formate ohne Umsetzer sterben (XPS, Web Publications, siehe
[01](01-stand-der-technik.md)). Deshalb entstehen Spezifikation, Prüfer und Referenzleser zusammen —
und der Standard muss etwas können, das PDF nicht kann: lebendige, verschachtelte, bildschirmgerechte
Information in einer Datei, signierbar in der eingefrorenen Fassung.

---

## 5. Offene Fragen aus dieser Nachschärfung

1. **Animation in der eingefrorenen Fassung:** Standbild automatisch erzeugen (Browser-Rendering zum
   definierten Zeitpunkt) oder vom Autor? Beides prüfen.
2. **Sperren von Abschnitten:** Im Dateiformat umsetzbar (Zugriffsregeln im Manifest + Signatur)
   oder nur Oberflächenregel ohne Beweiswert? Rechtliche Wirkung unklar, ist zu erheben.
3. **Größe:** Video und Ton blähen Dateien auf. Obergrenzen, Kompression, Verweise auf abgelegte
   Medien — noch nicht entschieden.
4. **Langzeitlesbarkeit:** Interaktive Dokumente müssen in zwanzig Jahren noch laufen. Welche
   Komponenten friert man ein (Web-Standards, die bleiben), welche nicht?
5. **Werkzeugkette:** Womit erstellt ein Autor solche Dokumente — html-Pro selbst, Word/InDesign
   mit Export, Markdown mit Vorlage? Ohne Autorenwerkzeug bleibt der Standard leer.
6. **Druckqualität:** Wie genau wird der A4-Ausdruck sein müssen — Büroausdruck oder
   druckvorstufentauglich? (Nach [07](07-foren-und-nutzererwartungen.md) reicht Büroausdruck für die
   Zielgruppe; Vorstufe bleibt Acrobat.)
