"""
Test of the LibreOffice export (S8) in a real LibreOffice without user interface.

Run with the Python LibreOffice brings along (pyuno):

    prototyp/tools/libreoffice/opt/libreoffice26.8/program/python einbau/libreoffice/pruefen.py <out-dir> [HPRO_CLI]

Steps:
 1. packs einbau/libreoffice/hpro-export/ into <out-dir>/hpro-export.oxt;
 2. installs it with unopkg into a fresh profile under <out-dir>/lo-profile;
 3. starts soffice.bin headless with a local pipe (no network, only while the script runs);
 4. checks that LibreOffice registered the component and the menu entries;
 5. writes a report in Writer through the office API the way a user would build it (title,
    headings, lists, table with repeated header row and caption, picture with alternative text and
    caption, footnote, endnote, bookmark with cross references, hyperlink, quotation, code,
    direct formatting, comment, table of contents, header and footer with page number) and a cost
    estimate in Calc (formulas, sum), stores both as the user would (.odt, .docx, .ods);
 6. triggers the menu command of the extension (service:org.hpro.export.ExportJob?export-to:…)
    on each document; the extension calls `hpro create` and `hpro check`;
 7. prints the results and terminates soffice.

The HPRO_CLI for the extension comes from the second argument or the environment.
"""
import json
import os
import struct
import subprocess
import sys
import time
import zipfile
import zlib

import uno
from com.sun.star.awt import Size
from com.sun.star.beans import PropertyValue
from com.sun.star.lang import Locale

HERE = os.path.dirname(os.path.realpath(__file__))
PROGRAM = os.path.dirname(os.path.realpath(sys.executable))
PARAGRAPH_BREAK = 0
LINE_BREAK = 1


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def log(*args):
    print(*args, flush=True)


# ---------------------------------------------------------------------------------------- extension

def build_oxt(out_dir):
    src = os.path.join(HERE, "hpro-export")
    oxt = os.path.join(out_dir, "hpro-export.oxt")
    with zipfile.ZipFile(oxt, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(src):
            for name in sorted(files):
                if name.endswith(".pyc"):
                    continue
                full = os.path.join(root, name)
                info = zipfile.ZipInfo(os.path.relpath(full, src).replace(os.sep, "/"), date_time=(2026, 10, 14, 12, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                with open(full, "rb") as f:
                    z.writestr(info, f.read())
    return oxt


def install(oxt, profile, env):
    unopkg = os.path.join(PROGRAM, "unopkg")
    url = "file://" + profile
    for attempt in (1, 2):
        r = subprocess.run([unopkg, "add", "--force", "-env:UserInstallation=" + url, oxt], env=env, capture_output=True, text=True, timeout=300)
        log("$ unopkg add hpro-export.oxt  (Versuch %d) -> Rückgabe %d %s" % (attempt, r.returncode, (r.stderr or r.stdout).strip()[:400]))
        if r.returncode == 0:
            break
    else:
        return r.returncode
    r = subprocess.run([unopkg, "list", "-env:UserInstallation=" + url], env=env, capture_output=True, text=True, timeout=300)
    for line in r.stdout.splitlines():
        if line.strip().startswith(("Identifier", "Version", "URL", "is registered", "Media-Type", "Description", "Display Name")) or "org.hpro" in line:
            log("  " + line.strip())
    return r.returncode


# ---------------------------------------------------------------------------------------- picture

def png_chart(path):
    """A small bar chart as PNG (pure Python): 360 x 180, five bars."""
    w, h = 360, 180
    bars = [(30, 120, (0x1f, 0x5f, 0x99)), (100, 70, (0x1f, 0x5f, 0x99)), (170, 150, (0xb3, 0x3a, 0x1f)), (240, 95, (0x1f, 0x5f, 0x99)), (310, 40, (0x1f, 0x5f, 0x99))]
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            c = (255, 255, 255)
            if y == h - 20 or x == 20:
                c = (0x33, 0x33, 0x33)
            for bx, bh, col in bars:
                if bx <= x < bx + 40 and h - 20 - bh <= y < h - 20:
                    c = col
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


# ---------------------------------------------------------------------------------------- documents

class Writer:
    def __init__(self, doc):
        self.doc = doc
        self.text = doc.Text
        self.cur = self.text.createTextCursor()
        styles = doc.StyleFamilies.getByName("ParagraphStyles")
        self.style = lambda *names: next((n for n in names if styles.hasByName(n)), names[-1])
        self.body = self.style("Body Text", "Text body")

    def para(self, style, *parts, numbering=None, level=0):
        c = self.cur
        c.ParaStyleName = style
        c.NumberingStyleName = numbering or ""
        if numbering:
            c.NumberingLevel = level
        for p in parts:
            if isinstance(p, str):
                self.text.insertString(c, p, False)
            else:
                p(c)
        self.text.insertControlCharacter(c, PARAGRAPH_BREAK, False)

    def fmt(self, text, **props):
        # As a user does it: type the text, select it, apply the formatting (or the hyperlink).
        def run(c):
            self.text.insertString(c, text, False)
            c.goLeft(len(text), True)
            for k, v in props.items():
                c.setPropertyValue(k, v)
            c.collapseToEnd()
            for k in props:
                c.setPropertyToDefault(k)
        return run

    def content(self, service, **props):
        def run(c):
            obj = self.doc.createInstance(service)
            for k, v in props.items():
                if k == "string":
                    continue
                obj.setPropertyValue(k, v)
            self.text.insertTextContent(c, obj, False)
            if "string" in props:
                obj.setString(props["string"])
        return run

    def sequence(self, name):
        def run(c):
            master = self.doc.TextFieldMasters.getByName("com.sun.star.text.fieldmaster.SetExpression." + name)
            f = self.doc.createInstance("com.sun.star.text.textfield.SetExpression")
            f.attachTextFieldMaster(master)
            f.NumberingType = 4
            f.Content = name + "+1"
            self.text.insertTextContent(c, f, False)
        return run


def build_writer(desktop, ctx, image_path):
    doc = desktop.loadComponentFromURL("private:factory/swriter", "_blank", 0, ())
    w = Writer(doc)
    dp = doc.DocumentProperties
    dp.Title = "Prüfbericht Brandschutztüren Schule Nord"
    dp.Author = "Ingenieurbüro Beispiel"
    dp.Description = "Wiederkehrende Prüfung der Feuerschutzabschlüsse im Bauteil B"
    dp.Language = Locale("de", "AT", "")
    doc.CharLocale = Locale("de", "AT", "")

    # Header and footer of the default page style (page number only in the footer).
    page = doc.StyleFamilies.getByName("PageStyles").getByName("Standard")
    page.HeaderIsOn = True
    page.FooterIsOn = True
    page.HeaderText.setString("Schule Nord · Bauteil B")
    ft = page.FooterText
    fc = ft.createTextCursor()
    ft.insertString(fc, "Seite ", False)
    pn = doc.createInstance("com.sun.star.text.textfield.PageNumber")
    pn.NumberingType = 4
    pn.SubType = uno.Enum("com.sun.star.text.PageNumberType", "CURRENT")
    ft.insertTextContent(fc, pn, False)

    w.para("Title", "Prüfbericht Brandschutztüren Schule Nord")
    w.para(w.body, "Auftraggeber: Gemeinde Musterdorf, Gebäudeverwaltung. Prüfdatum: 13. Oktober 2026.")
    index = doc.createInstance("com.sun.star.text.ContentIndex")
    index.CreateFromOutline = True
    w.text.insertTextContent(w.cur, index, False)

    w.para(w.style("Heading 1"), "Zusammenfassung")
    w.para(w.body, "Von zwölf geprüften Türen sind ", w.fmt("neun mängelfrei", CharWeight=150.0), ", drei haben Mängel der ",
           w.fmt("Klasse B", CharPosture=uno.Enum("com.sun.star.awt.FontSlant", "ITALIC")), ".",
           w.content("com.sun.star.text.Footnote", string="Klassen nach ÖNORM B 3850, Anhang C."),
           " Details stehen im Abschnitt ", w.content("com.sun.star.text.textfield.GetReference", ReferenceFieldSource=2, SourceName="maengel", ReferenceFieldPart=2),
           " auf Seite ", w.content("com.sun.star.text.textfield.GetReference", ReferenceFieldSource=2, SourceName="maengel", ReferenceFieldPart=0), ".")
    w.para(w.body, "Prüfgrundlage ist die ", w.fmt("Herstellerangabe", HyperLinkURL="https://www.example.org/pruefgrundlage"),
           "; offene Punkte sind im Anhang vermerkt.",
           w.content("com.sun.star.text.textfield.Annotation", Author="Prüferin", Content="Foto der Tür B.07 nachreichen."))

    w.para(w.style("Heading 1"), "Prüfumfang")
    w.para(w.body, "Geprüft wurden:")
    w.para(w.style("List Bullet", "List 1", w.body), "Türblatt und Zarge", numbering="List 1", level=0)
    w.para(w.style("List Bullet", "List 1", w.body), "Schließmittel", numbering="List 1", level=0)
    w.para(w.style("List Bullet", "List 1", w.body), "Obentürschließer", numbering="List 1", level=1)
    w.para(w.style("List Bullet", "List 1", w.body), "Schließfolgeregler", numbering="List 1", level=1)
    w.para(w.style("List Bullet", "List 1", w.body), "Kennzeichnung", numbering="List 1", level=0)

    w.para(w.style("Heading 1"), "Ergebnisse")
    w.para(w.style("Heading 2"), "Ergebnisse je Tür")
    w.para(w.body, "Die Tabelle nennt jede Tür mit Befund.")
    table = doc.createInstance("com.sun.star.text.TextTable")
    rows = [("Tür", "Lage", "Befund", "Klasse"), ("B.03", "Stiege 1, EG", "Schließer stellt nicht ein", "B"),
            ("B.07", "Stiege 1, 1. OG", "Dichtung beschädigt", "B"), ("B.11", "Stiege 2, 2. OG", "Kennzeichnung fehlt", "B")]
    table.initialize(len(rows), len(rows[0]))
    w.text.insertTextContent(w.cur, table, False)
    table.Name = "Ergebnisse"
    table.RepeatHeadline = True
    table.HeaderRowCount = 1
    for r, row in enumerate(rows):
        for col, value in enumerate(row):
            table.getCellByName("%s%d" % ("ABCD"[col], r + 1)).setString(value)
    w.para(w.style("Table"), "Tabelle ", w.sequence("Table"), ": Türen mit Mängeln")

    w.para(w.style("Heading 2"), "Mängel")
    bookmark = doc.createInstance("com.sun.star.text.Bookmark")
    bookmark.Name = "maengel"
    # The bookmark spans the heading just written (Insert > Bookmark with the heading selected).
    w.cur.gotoPreviousParagraph(False)
    w.cur.gotoEndOfParagraph(True)
    w.text.insertTextContent(w.cur, bookmark, True)
    w.cur.gotoEnd(False)
    w.para(w.style("Numbering 123", w.body), "Schließer der Tür B.03 nachstellen.", numbering="Numbering 123")
    w.para(w.style("Numbering 123", w.body), "Dichtung der Tür B.07 tauschen.", numbering="Numbering 123")
    w.para(w.style("Numbering 123", w.body), "Kennzeichnungsschild an Tür B.11 anbringen.", numbering="Numbering 123")

    w.para(w.style("Heading 2"), "Verteilung der Befunde")
    # Picture with caption: LibreOffice's own form is a frame holding the picture and the caption.
    w.para(w.body, "Das Diagramm zeigt die Befunde je Geschoß.")
    # The caption frame gets its own (otherwise empty) paragraph as anchor.
    w.text.insertControlCharacter(w.cur, PARAGRAPH_BREAK, False)
    w.cur.gotoPreviousParagraph(False)
    w.cur.ParaStyleName = w.body
    frame = doc.createInstance("com.sun.star.text.TextFrame")
    frame.AnchorType = uno.Enum("com.sun.star.text.TextContentAnchorType", "AT_PARAGRAPH")
    frame.Width = 9600
    frame.FrameIsAutomaticHeight = True
    w.text.insertTextContent(w.cur, frame, False)
    provider = ctx.ServiceManager.createInstanceWithContext("com.sun.star.graphic.GraphicProvider", ctx)
    graphic = doc.createInstance("com.sun.star.text.TextGraphicObject")
    graphic.Graphic = provider.queryGraphic((prop("URL", uno.systemPathToFileUrl(image_path)),))
    graphic.AnchorType = uno.Enum("com.sun.star.text.TextContentAnchorType", "AS_CHARACTER")
    graphic.setSize(Size(9525, 4763))
    graphic.Title = "Balkendiagramm: Befunde je Geschoß, höchster Wert im 1. Obergeschoß"
    graphic.Name = "Befunde je Geschoss"
    ftext = frame.Text
    fcur = ftext.createTextCursor()
    fcur.ParaStyleName = w.style("Figure", "Illustration")
    ftext.insertTextContent(fcur, graphic, False)
    ftext.insertString(fcur, "Abbildung ", False)
    master = doc.TextFieldMasters.getByName("com.sun.star.text.fieldmaster.SetExpression." + ("Figure" if doc.TextFieldMasters.hasByName("com.sun.star.text.fieldmaster.SetExpression.Figure") else "Illustration"))
    seq = doc.createInstance("com.sun.star.text.textfield.SetExpression")
    seq.attachTextFieldMaster(master)
    seq.NumberingType = 4
    seq.Content = master.Name + "+1"
    ftext.insertTextContent(fcur, seq, False)
    ftext.insertString(fcur, ": Befunde je Geschoß", False)
    w.cur.gotoEnd(False)

    w.para(w.style("Heading 1"), "Hinweise")
    w.para(w.style("Quotations"), "Feuerschutzabschlüsse sind mindestens einmal jährlich zu prüfen.")
    w.para(w.body, "Eintrag im Prüfbuch:", w.content("com.sun.star.text.Endnote", string="Prüfbuch Band 4, Seite 17."))
    w.para(w.style("Preformatted Text"), "B.03  EG   Schließer  B")
    w.para(w.style("Preformatted Text"), "B.07  1.OG Dichtung   B")
    w.para(w.body, "Ende des Berichts.")

    doc.TextFields.refresh()
    index.update()
    doc.TextFields.refresh()
    return doc


def build_calc(desktop):
    doc = desktop.loadComponentFromURL("private:factory/scalc", "_blank", 0, ())
    dp = doc.DocumentProperties
    dp.Title = "Kostenschätzung Türsanierung Schule Nord"
    dp.Language = Locale("de", "AT", "")
    sheet = doc.Sheets.getByIndex(0)
    sheet.Name = "Kosten"
    # Row 1 as header row (Format > Print Ranges > Rows to repeat), written as table:table-header-rows.
    title_rows = uno.createUnoStruct("com.sun.star.table.CellRangeAddress")
    title_rows.Sheet, title_rows.StartColumn, title_rows.StartRow, title_rows.EndColumn, title_rows.EndRow = 0, 0, 0, 3, 0
    sheet.setTitleRows(title_rows)
    sheet.setPrintTitleRows(True)
    rows = [
        ("Position", "Menge", "Einzelpreis", "Betrag"),
        ("Schließer nachstellen", 1, 85, "=B2*C2"),
        ("Dichtung tauschen", 1, 240, "=B3*C3"),
        ("Kennzeichnungsschild", 1, 35, "=B4*C4"),
        ("Prüfung nach Sanierung", 3, 60, "=B5*C5"),
        ("Summe netto", "", "", "=SUM(D2:D5)"),
        ("USt 20 %", "", "", "=ROUND(D6*0.2;2)"),
        ("Summe brutto", "", "", "=D6+D7"),
    ]
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            cell = sheet.getCellByPosition(c, r)
            if isinstance(value, (int, float)):
                cell.Value = value
            elif value.startswith("="):
                cell.Formula = value
            elif value:
                cell.String = value
    doc.calculateAll()
    return doc


# ---------------------------------------------------------------------------------------- main

def main():
    out_dir = os.path.realpath(sys.argv[1])
    if len(sys.argv) > 2:
        os.environ["HPRO_CLI"] = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    profile = os.path.join(out_dir, "lo-profile")
    env = dict(os.environ, SAL_USE_VCLPLUGIN="svp")
    log("HPRO_CLI=%s" % os.environ.get("HPRO_CLI", "(nicht gesetzt, hpro aus PATH)"))
    oxt = build_oxt(out_dir)
    log("Erweiterung gepackt: %s (%d Bytes)" % (os.path.basename(oxt), os.path.getsize(oxt)))
    with zipfile.ZipFile(oxt) as z:
        for n in z.namelist():
            log("  " + n)
    if install(oxt, profile, env) != 0:
        raise SystemExit("Installation der Erweiterung fehlgeschlagen")

    pipe = "hpro_s8_%d" % os.getpid()
    start = lambda: subprocess.Popen([os.path.join(PROGRAM, "soffice.bin"), "--headless", "--norestore", "--nologo", "--nodefault",
                                      "-env:UserInstallation=file://" + profile, "--accept=pipe,name=%s;urp;" % pipe],
                                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    proc = start()
    results = {}
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        restarts = 0
        for _ in range(240):
            # Exit code 81: soffice asks for a restart after setting up a fresh profile.
            if proc.poll() is not None and restarts < 2:
                log("soffice beendet sich mit %s (Neustart nach Profilanlage), wird neu gestartet" % proc.returncode)
                restarts += 1
                proc = start()
            try:
                ctx = resolver.resolve("uno:pipe,name=%s;urp;StarOffice.ComponentContext" % pipe)
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            raise SystemExit("soffice nicht erreichbar")
        smgr = ctx.ServiceManager
        desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        cp = smgr.createInstanceWithContext("com.sun.star.configuration.ConfigurationProvider", ctx)
        about = cp.createInstanceWithArguments("com.sun.star.configuration.ConfigurationAccess", (prop("nodepath", "/org.openoffice.Setup/Product"),))
        log("Office: %s %s" % (about.getByName("ooName"), about.getByName("ooSetupVersionAboutBox")))

        # Registration: component and menu entries as LibreOffice sees them after the installation.
        job = smgr.createInstanceWithContext("org.hpro.export.ExportJob", ctx)
        log("Komponente org.hpro.export.ExportJob: %s" % ("registriert" if job is not None else "FEHLT"))
        if job is None:
            raise SystemExit("Komponente nicht registriert")
        addons = cp.createInstanceWithArguments("com.sun.star.configuration.ConfigurationAccess", (prop("nodepath", "/org.openoffice.Office.Addons/AddonUI"),))
        merging = addons.getByName("OfficeMenuBarMerging").getByName("org.hpro.export").getByName("S1")
        item = merging.getByName("MenuItems").getByName("M1")
        log("Menü Datei: MergePoint %s, %s, Eintrag „%s“ -> %s" % (merging.getByName("MergePoint"), merging.getByName("MergeCommand"), item.getByName("Title"), item.getByName("URL")))
        addon = addons.getByName("AddonMenu").getByName("org.hpro.export.addon")
        log("Menü Extras > Add-ons: „%s“ -> %s" % (addon.getByName("Title"), addon.getByName("URL")))

        image = os.path.join(out_dir, "befunde.png")
        png_chart(image)
        cases = [
            ("writer", lambda: build_writer(desktop, ctx, image), [("pruefbericht.odt", "writer8"), ("pruefbericht.docx", "MS Word 2007 XML")]),
            ("calc", lambda: build_calc(desktop), [("kostenschaetzung.ods", "calc8")]),
        ]
        for name, build, saves in cases:
            t0 = time.perf_counter()
            doc = build()
            log("\n== %s: Dokument über die Office-API aufgebaut (%.1f s)" % (name, time.perf_counter() - t0))
            for file_name, filter_name in saves:
                path = os.path.join(out_dir, file_name)
                doc.storeToURL(uno.systemPathToFileUrl(path), (prop("FilterName", filter_name),))
                log("gespeichert wie vom Nutzer: %s (%s, %d Bytes)" % (file_name, filter_name, os.path.getsize(path)))
            current = desktop.getCurrentComponent()
            log("aktuelles Dokument des Office: %s" % ("das neue Dokument" if current is not None and current == doc else "ein anderes (%r)" % current))
            target = os.path.join(out_dir, "%s.hpro" % ("pruefbericht" if name == "writer" else "kostenschaetzung"))
            for leftover in (target, target + ".export.json"):
                if os.path.exists(leftover):
                    os.remove(leftover)
            t0 = time.perf_counter()
            job.trigger("export-to:" + uno.systemPathToFileUrl(target))
            elapsed = time.perf_counter() - t0
            with open(target + ".export.json", encoding="utf-8") as f:
                result = json.load(f)
            results[name] = result
            log("Menübefehl service:org.hpro.export.ExportJob?export-to:… ausgeführt (%.1f s)" % elapsed)
            if "fehler" in result:
                log("FEHLER: %s" % result["fehler"])
                continue
            log("Aufruf: %s" % " ".join(result["befehl"]))
            log("hpro create -> Rückgabe %d" % result["create"]["exit"])
            for line in result["create"]["stdout"].splitlines():
                log("  | " + line)
            for line in result["create"]["stderr"].splitlines():
                log("  ! " + line)
            check = result.get("check", {})
            report = check.get("bericht", {})
            log("hpro check -> Rückgabe %s; Stufen %s; Befunde %s" % (check.get("exit"), report.get("levels", {}).get("verdict"), report.get("summary")))
            for nc in report.get("notChecked", []):
                log("  nicht geprüft %s: %s" % (nc.get("rule"), nc.get("detail", nc.get("reason"))))
            for r in report.get("results", []):
                if r.get("severity") in ("fatal", "error", "warning", "FATAL", "ERROR", "WARNING"):
                    log("  BEFUND %s %s: %s" % (r.get("rule"), r.get("severity"), r.get("message")))
            udp = doc.DocumentProperties.UserDefinedProperties
            log("Dokumenteigenschaft hpro:id im Office-Dokument: %s" % udp.getPropertyValue("hpro:id"))
            doc.close(True)
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        log("\nsoffice beendet (Rückgabe %s)" % proc.returncode)
    with open(os.path.join(out_dir, "export-ergebnisse.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    ok = all(r.get("create", {}).get("exit") == 0 and r.get("check", {}).get("exit") in (0, 3) for r in results.values()) and len(results) == 2
    log("Ergebnis: %s" % ("beide Exporte geschrieben, Prüfer ohne Fehler" if ok else "NICHT in Ordnung"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
