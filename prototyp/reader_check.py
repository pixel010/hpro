#!/usr/bin/env python3
"""Öffnet einen Container mit EbookLib (Python-EPUB-Bibliothek) wie ein Reader:
Metadaten, Lesereihenfolge (Spine) und Text des ersten Kapitels.

    reader_check.py DATEI
"""
import re
import sys
import warnings

warnings.filterwarnings("ignore")
import ebooklib  # noqa: E402
from ebooklib import epub  # noqa: E402


def main(path):
    try:
        book = epub.read_epub(path, options={"ignore_ncx": True})
    except Exception as e:  # Ausgabe ist das Messergebnis
        print(f"EbookLib: Öffnen fehlgeschlagen -> {type(e).__name__}: {e}")
        return 1
    print("EbookLib: geöffnet")
    print("Titel:", book.get_metadata("DC", "title"))
    print("Sprache:", book.get_metadata("DC", "language"))
    spine = [book.get_item_with_id(i).get_name() for i, _ in book.spine]
    print("Spine:", spine)
    first = book.get_item_with_id(book.spine[0][0])
    text = re.sub(r"<[^>]+>", " ", first.get_content().decode("utf-8"))
    print("Text:", re.sub(r"\s+", " ", text).strip()[:200])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
