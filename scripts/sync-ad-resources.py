"""Extract the curated ad deliverables and reference art from the local XLSX."""

import hashlib
import json
import re
import runpy
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / "scripts" / "parse-channel-requirements.py"))
q = helpers["q"]
relationships = helpers["relationships"]
read_sheet = helpers["read_sheet"]
extract_images = helpers["extract_images"]
MAIN = helpers["MAIN"]
REL = helpers["REL"]


def target_sheet(archive, expected_name):
    strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        strings = [
            "".join(t.text or "" for t in item.iter(q(MAIN, "t")))
            for item in root.findall(q(MAIN, "si"))
        ]
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    book_rels = relationships(archive, "xl/workbook.xml")
    for sheet in root.findall(".//" + q(MAIN, "sheet")):
        if sheet.attrib.get("name", "") != expected_name:
            continue
        source = book_rels.get(sheet.attrib.get(q(REL, "id"), ""))
        if source:
            xml, rows = read_sheet(archive, source, strings)
            return source, xml, rows
    raise ValueError(f"缺少“{expected_name}”工作表")


def assign_spec_ids(specs, previous):
    """A spreadsheet row number is not the identity of a saved deliverable."""
    known = {s['id']: s for s in previous.get('retiredSpecs', [])}
    known.update({s['id']: s for s in previous.get('specs', [])})
    used = set()
    next_id = max([int(key[3:]) for key in known if re.fullmatch(r'ad-\d+', key)] or [0]) + 1
    def same_placement(a, b):
        return all(a.get(k) == b.get(k) for k in ('platform', 'width', 'height', 'format'))
    for spec in specs:
        exact = [s for s in known.values() if s['id'] not in used and same_placement(s, spec) and s.get('logo') == spec['logo']]
        possible = [s for s in known.values() if s['id'] not in used and same_placement(s, spec)]
        match = exact[0] if len(exact) == 1 else possible[0] if len(possible) == 1 else None
        if match:
            spec['id'] = match['id']
        else:
            spec['id'] = f'ad-{next_id:02d}'
            next_id += 1
        used.add(spec['id'])
    return [s for key, s in known.items() if key not in used]


def sync(workbook, output, references):
    previous = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    references.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(workbook) as archive:
        source, xml, rows = target_sheet(archive, "投放资源位")
        images = extract_images(archive, source, xml, references)
    specs = []
    for row_number in sorted(rows):
        cells = rows[row_number]
        if not str(cells.get("A", "")).isdigit():
            continue
        match = re.fullmatch(r"\s*(\d+)\s*[x×*]\s*(\d+)\s*", cells.get("C", ""), re.I)
        if not match:
            raise ValueError(f"主表第 {row_number} 行尺寸无效：{cells.get('C', '')}")
        number = int(cells["A"])
        fmt = cells.get("E", "").upper().strip()
        if fmt not in {"JPG", "GIF"}:
            raise ValueError(f"主表第 {row_number} 行格式无法识别：{fmt}")
        limit = cells.get("D", "").strip()
        size_limit = re.search(r"(\d+(?:\.\d+)?)\s*(KB|MB)", limit, re.I)
        max_bytes = int(float(size_limit.group(1)) * (1024 if size_limit.group(2).upper() == "KB" else 1048576)) if size_limit else None
        requirement = cells.get("F", "").strip()
        output_rule = cells.get("G", "").strip()
        logo = "forbidden" if "无logo" in requirement.lower() else "required" if "有logo" in requirement.lower() else "unspecified"
        location = cells.get("B", "").strip()
        safe_match = re.search(r"左右两边\s*(\d+)\s*px", requirement, re.I)
        info = {
            "row": row_number,
            "number": number,
            "name": location,
            "platform": "TapTap" if location.lower() == "taptap" else "B站" if location.startswith("B站") else "广点通" if location == "广点通" else location,
            "width": int(match.group(1)),
            "height": int(match.group(2)),
            "format": fmt,
            "limitRaw": limit,
            "maxBytes": max_bytes,
            "logo": logo,
            "logoSuffix": "lg" if logo == "required" else "",
            "safeInsetX": int(safe_match.group(1)) if safe_match else 0,
            "requirements": requirement,
            "outputRule": output_rule,
            "reference": images.get(row_number, [None])[0],
            "kind": "animation" if fmt == "GIF" else "static",
            "cautions": [],
        }
        specs.append(info)
        if info['width'] <= 0 or info['height'] <= 0:
            raise ValueError(f'主表第 {row_number} 行尺寸必须大于零')
    if not specs or [spec["number"] for spec in specs] != list(range(1, len(specs)+1)):
        raise ValueError('主表交付项编号必须从 1 开始连续且不重复')
    retired = assign_spec_ids(specs, previous)
    digest = hashlib.sha256(json.dumps(specs, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    for reference in sorted({spec["reference"] for spec in specs if spec["reference"]}):
        digest.update((references / reference).read_bytes())
    history = list(previous.get('previousCatalogs', []))
    if previous.get('sourceSha256') and previous['sourceSha256'] != digest.hexdigest() and not any(c['sourceSha256'] == previous['sourceSha256'] for c in history):
        history.append({key: previous[key] for key in ('sourceName', 'sourceSha256', 'sheet', 'specs')})
    result = {
        "sourceName": workbook.name,
        "sourcePath": str(workbook.relative_to(ROOT)).replace('\\', '/') if workbook.is_relative_to(ROOT) else str(workbook),
        "workbookSha256": hashlib.sha256(workbook.read_bytes()).hexdigest(),
        "sourceSha256": digest.hexdigest(),
        "sheet": "投放资源位",
        "specs": specs,
        "retiredSpecs": retired,
        "previousCatalogs": history,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"{len(specs)} ad deliverables, {sum(bool(s['reference']) for s in specs)} references")
    return result


def main():
    workbook = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '02 规范与模板' / '投放' / '资源位规范' / '投放资源位尺寸表.xlsx'
    references = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'data' / 'runtime' / 'ad-resources' / 'references'
    output = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / 'config' / 'ad-resources-v1.json'
    sync(workbook, output, references)


if __name__ == "__main__":
    main()
