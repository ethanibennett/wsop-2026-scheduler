#!/usr/bin/env python3
"""Regenerate the WSOP event_number → page_number map.

Reads the canonical structure PDF (downloads a fresh copy from the WSOP CDN
unless a local path is given), scans each page's first ~10 lines for an
"EVENT [#]N" header, and prints a JS object literal suitable for pasting
into vite-app/src/utils/wsop-structure-pages.js.

Two source-PDF inconsistencies are tolerated:
  - "EVENT 49" with the # missing
  - "EVENT #43"/"EVENT #60" with no trailing colon

Usage:
  python3 scripts/extract-wsop-structure-pages.py
  python3 scripts/extract-wsop-structure-pages.py path/to/local.pdf
"""
import re
import subprocess
import sys
import tempfile
import urllib.request

CDN_URL = (
    "https://wsop.gg-global-cdn.com/wsop/"
    "9597cb0c-1322-4d57-831c-8160a0e6abd4.pdf"
)


def extract(pdf_path: str) -> dict[int, int]:
    text = subprocess.check_output(["pdftotext", "-layout", pdf_path, "-"]).decode()
    pages = text.split("\x0c")
    pat = re.compile(r"\bEVENT\s*#?\s*(\d+)\b", re.IGNORECASE)
    mapping: dict[int, int] = {}
    for i, page in enumerate(pages, 1):
        head = "\n".join(page.splitlines()[:10])
        m = pat.search(head)
        if m:
            n = int(m.group(1))
            if n not in mapping:
                mapping[n] = i
    return mapping


def emit_js(mapping: dict[int, int]) -> str:
    keys = sorted(mapping.keys())
    rows = []
    for start in range(0, len(keys), 10):
        chunk = keys[start : start + 10]
        parts = [f"{n}: {mapping[n]}" for n in chunk]
        rows.append("  " + ", ".join(parts) + ",")
    if rows:
        rows[-1] = rows[-1].rstrip(",")
    return "{\n" + "\n".join(rows) + "\n}"


def main() -> None:
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            sys.stderr.write(f"Downloading {CDN_URL}\n")
            urllib.request.urlretrieve(CDN_URL, tmp.name)
            path = tmp.name

    mapping = extract(path)
    keys = sorted(mapping.keys())
    if not keys:
        sys.exit("no EVENT headers found")
    gaps = [n for n in range(min(keys), max(keys) + 1) if n not in mapping]
    sys.stderr.write(
        f"events: {len(keys)} ({min(keys)}-{max(keys)}); "
        f"gaps: {gaps if gaps else 'none'}\n"
    )
    print(emit_js(mapping))


if __name__ == "__main__":
    main()
