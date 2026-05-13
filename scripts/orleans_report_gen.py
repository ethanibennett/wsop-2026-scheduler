#!/usr/bin/env python3
import sys
from collections import defaultdict

sys.path.insert(0, "scripts")
import match_orleans_oso as m

updates, unmatched, unlinked, rows = m.build_updates()

by_page = defaultdict(list)
for path_frag, row_id, page, title, r in updates:
    by_page[page].append((title, r))

PAGE_INFO = {e["page"]: e for e in m.PAGE_MAP}

print("| page | PDF title | buy-in | matched rows | first 3 event_names |")
print("|------|-----------|--------|--------------|---------------------|")
for p in sorted(by_page.keys()):
    title = PAGE_INFO[p]["title"]
    buyin = PAGE_INFO[p]["buyin"]
    matched = by_page[p]
    count = len(matched)
    names = "; ".join(r[2] for _, r in matched[:3])
    print(f"| {p} | {title} | ${buyin} | {count} | {names} |")

print()
print("--- PDF structures with NO matched DB rows ---")
for p in sorted(PAGE_INFO.keys()):
    if p not in by_page:
        e = PAGE_INFO[p]
        print(f"  page {p}: {e['title']} (${e['buyin']})")

print()
print("--- Unmatched PDF date/time slots ---")
for u in unmatched:
    print(" ", u)

print()
print("--- Unlinked DB rows ---")
for r in unlinked:
    print(" ", r)
