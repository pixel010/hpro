"""
P19: Importquellen mit LibreOffice erzeugen (HPF-IMP-001…004).

    prototyp/tools/libreoffice/opt/libreoffice26.8/program/python scripts/p19-importquellen.py QUELLE.fods OUTDIR

Lädt QUELLE.fods, ergänzt ein Basic-Makro (Bibliothek Standard, Modul Modul1, Funktion VERDOPPELN) und
in Kosten.D19 die Formel =VERDOPPELN(D2) (benutzerdefinierte Funktion), berechnet alles (calculateAll) und
speichert als OUTDIR/p19-quelle.ods (OpenDocument mit Makro) und OUTDIR/p19-quelle.xlsx (Office Open XML;
LibreOffice schreibt Formeln in Excel-Schreibweise und die berechneten Werte mit). soffice läuft ohne
Oberfläche mit einer lokalen Pipe nur für die Dauer des Laufs.
"""
import os
import subprocess
import sys
import time

import uno
from com.sun.star.beans import PropertyValue

PROGRAM = os.path.dirname(os.path.realpath(sys.executable))
PROFILE = os.path.realpath(os.path.join(os.path.dirname(__file__), '..', 'prototyp', 'out', 'p19', 'lo-profile'))
PIPE = 'hpro_p19q_%d' % os.getpid()

MACRO = '''REM Makro der Importquelle P19: wird beim Import nach hpro nicht übernommen (HPF-IMP-003)
Function VERDOPPELN(x)
  VERDOPPELN = 2 * x
End Function
'''


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def main():
    source, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    env = dict(os.environ, SAL_USE_VCLPLUGIN='svp')
    proc = subprocess.Popen([os.path.join(PROGRAM, 'soffice.bin'), '--headless', '--norestore', '--nologo', '--invisible',
                             '-env:UserInstallation=file://' + PROFILE, '--accept=pipe,name=%s;urp;' % PIPE],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(120):
        try:
            ctx = resolver.resolve('uno:pipe,name=%s;urp;StarOffice.ComponentContext' % PIPE)
            break
        except Exception:
            time.sleep(0.5)
    if ctx is None:
        proc.kill()
        raise SystemExit('soffice nicht erreichbar')
    desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    try:
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.realpath(source)), '_blank', 0, (prop('Hidden', True),))
        libs = doc.BasicLibraries
        if not libs.hasByName('Standard'):
            libs.createLibrary('Standard')
        lib = libs.getByName('Standard')
        if lib.hasByName('Modul1'):
            lib.removeByName('Modul1')
        lib.insertByName('Modul1', MACRO)
        sheet = doc.Sheets.getByName('Kosten')
        sheet.getCellByPosition(0, 18).setString('Benutzerfunktion (Makro)')
        sheet.getCellByPosition(3, 18).setFormula('=VERDOPPELN(D2)')
        doc.calculateAll()
        ods = os.path.realpath(os.path.join(outdir, 'p19-quelle.ods'))
        xlsx = os.path.realpath(os.path.join(outdir, 'p19-quelle.xlsx'))
        doc.storeToURL(uno.systemPathToFileUrl(ods), (prop('FilterName', 'calc8'),))
        doc.storeToURL(uno.systemPathToFileUrl(xlsx), (prop('FilterName', 'Calc Office Open XML'),))
        for r in range(19):
            c = sheet.getCellByPosition(3, r)
            print('Kosten.D%d  %-45s %s' % (r + 1, c.getFormula(), c.getString()))
        doc.close(True)
        print('geschrieben: %s, %s' % (ods, xlsx))
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=30)
        except Exception:
            proc.kill()


if __name__ == '__main__':
    main()
