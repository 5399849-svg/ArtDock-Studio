"""Read channel requirement cells and embedded row images with only Python stdlib."""

import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def q(ns, name):
    return "{%s}%s" % (ns, name)


def resolve(base, target):
    if target.startswith("/"):
        return target.lstrip("/")
    parts = list(PurePosixPath(base).parent.parts)
    for part in target.split("/"):
        if part == "..":
            parts.pop()
        elif part and part != ".":
            parts.append(part)
    return "/".join(parts)


def relationships(archive, source):
    p = PurePosixPath(source)
    rel_file = str(p.parent / "_rels" / (p.name + ".rels"))
    if rel_file not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(rel_file))
    return {r.attrib["Id"]: resolve(source, r.attrib["Target"])
            for r in root.findall(q(PKG, "Relationship")) if "Target" in r.attrib}


def cell_column(address):
    return re.match(r"[A-Z]+", address).group()


def read_sheet(archive, name, strings):
    root = ET.fromstring(archive.read(name))
    rows = {}
    for row in root.findall(".//" + q(MAIN, "sheetData") + "/" + q(MAIN, "row")):
        row_number = int(row.attrib["r"])
        cells = {}
        for cell in row.findall(q(MAIN, "c")):
            address = cell.attrib.get("r", "")
            value = cell.find(q(MAIN, "v"))
            inline = cell.find(q(MAIN, "is"))
            text = "" if value is None else (value.text or "")
            if cell.attrib.get("t") == "s" and text:
                text = strings[int(text)]
            elif inline is not None:
                text = "".join(t.text or "" for t in inline.iter(q(MAIN, "t")))
            if address:
                cells[cell_column(address)] = text.strip()
        rows[row_number] = cells
    for merged in root.findall(".//" + q(MAIN, "mergeCell")):
        match = re.fullmatch(r"([A-Z]+)(\d+):([A-Z]+)(\d+)", merged.attrib.get("ref", ""))
        if not match or match.group(1) != match.group(3):
            continue
        col, first, _, last = match.groups()
        value = rows.get(int(first), {}).get(col, "")
        for number in range(int(first) + 1, int(last) + 1):
            if not rows.setdefault(number, {}).get(col):
                rows[number][col] = value
    return root, rows


def extract_images(archive, sheet_path, sheet_root, outdir):
    sheet_rels = relationships(archive, sheet_path)
    linked = {}
    for drawing in sheet_root.findall(".//" + q(MAIN, "drawing")):
        drawing_path = sheet_rels.get(drawing.attrib.get(q(REL, "id"), ""))
        if not drawing_path or drawing_path not in archive.namelist():
            continue
        drawing_rels = relationships(archive, drawing_path)
        drawing_root = ET.fromstring(archive.read(drawing_path))
        for anchor in drawing_root:
            row_node = anchor.find(".//" + q(DRAW, "from") + "/" + q(DRAW, "row"))
            image_node = anchor.find(".//" + q(A, "blip"))
            if row_node is None or image_node is None:
                continue
            media = drawing_rels.get(image_node.attrib.get(q(REL, "embed"), ""))
            if not media or media not in archive.namelist():
                continue
            row_number = int(row_node.text or "0") + 1
            ext = PurePosixPath(media).suffix.lower()
            if ext not in (".png", ".jpg", ".jpeg", ".webp"):
                continue
            filename = "row-%04d-%02d%s" % (row_number, len(linked.get(row_number, [])) + 1, ext)
            (outdir / filename).write_bytes(archive.read(media))
            linked.setdefault(row_number, []).append(filename)
    return linked


def main():
    workbook = Path(sys.argv[1])
    outdir = Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(workbook) as archive:
        names = set(archive.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in item.iter(q(MAIN, "t")))
                      for item in root.findall(q(MAIN, "si"))]
        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        book_rels = relationships(archive, "xl/workbook.xml")
        all_rows = []
        for sheet in workbook_root.findall(".//" + q(MAIN, "sheet")):
            source = book_rels.get(sheet.attrib.get(q(REL, "id"), ""))
            if not source or source not in names:
                continue
            root, rows = read_sheet(archive, source, shared)
            images = extract_images(archive, source, root, outdir)
            for number in sorted(rows):
                cells = rows[number]
                if number == 1 or not any(cells.get(col) for col in ("A", "C", "F")):
                    continue
                all_rows.append({"sheet": sheet.attrib.get("name", ""), "row": number,
                                 "cells": cells, "images": images.get(number, [])})
    print(json.dumps({"rows": all_rows}, ensure_ascii=False))


if __name__ == "__main__":
    main()
