#!/usr/bin/env python3
"""
Update WSOP 2026 main-series re-entry values from the official wsop.com
schedule. Maps the official text format to the DB's reentry column convention:

  "Freezeout"               -> "Freezeout"
  "1 Re-Entry"              -> "1"
  "2 Re-Entries"            -> "2"
  "1 Re-Entry Per Flight"   -> "1 Per Flight"
  "2 Re-Entries Per Flight" -> "2 Per Flight"
  "Unlimited Re-Entry"      -> "Unlimited"
  "1 Re-Entry Per Player"   -> "1"
  Composite (Bust A Play B; ...) -> per-flight value applied to the matching
    flight letter; final flight gets "Freezeout".

Source: https://www.wsop.com/tournaments/2026-57th-annual-world-series-of-poker/
"""
import sqlite3
import re
import sys

DB = 'poker-tournaments.db'

# (event_number, official_reentry_text) — copied verbatim from the WSOP page.
WSOP_OFFICIAL = [
    (1, "2 Re-Entries Per Flight"),
    (2, "1 Re-Entry"),
    (3, "1 Re-Entry"),
    (4, "Freezeout"),
    (5, "2 Re-Entries"),
    (6, "Freezeout"),
    (7, "Flight A: Bust A Play B; Flight B: Freezeout"),
    (8, "1 Re-Entry"),
    (9, "Freezeout"),
    (10, "1 Re-Entry"),
    (11, "Unlimited Re-Entry"),
    (12, "2 Re-Entries"),
    (13, "1 Re-Entry"),
    (14, "2 Re-Entries"),
    (15, "2 Re-Entries"),
    (16, "2 Re-Entries"),
    (17, "2 Re-Entries"),
    (18, "1 Re-Entry Per Flight"),
    (19, "1 Re-Entry Per Flight"),
    (20, "1 Re-Entry"),
    (21, "2 Re-Entries"),
    (22, "2 Re-Entries Per Flight"),
    (23, "Freezeout"),
    (24, "1 Re-Entry"),
    (25, "Freezeout"),
    (26, "1 Re-Entry"),
    (27, "Freezeout"),
    (28, "2 Re-Entries"),
    (29, "1 Re-Entry"),
    (30, "Freezeout"),
    (31, "1 Re-Entry"),
    (32, "1 Re-Entry"),
    (33, "2 Re-Entries"),
    (34, "1 Re-Entry Per Flight"),
    (35, "2 Re-Entries Per Flight"),
    (36, "1 Re-Entry"),
    (37, "Freezeout"),
    (38, "Freezeout"),
    (39, "1 Re-Entry"),
    (40, "Freezeout"),
    (41, "1 Re-Entry"),
    (42, "2 Re-Entries"),
    (43, "1 Re-Entry"),
    (44, "1 Re-Entry"),
    (45, "1 Re-Entry"),
    (46, "1 Re-Entry Per Flight"),
    (47, "2 Re-Entries"),
    (48, "Freezeout"),
    (49, "Freezeout"),
    (50, "1 Re-Entry Per Flight"),
    (51, "2 Re-Entries"),
    (52, "1 Re-Entry"),
    (53, "2 Re-Entries"),
    (54, "Freezeout"),
    (55, "2 Re-Entries"),
    (56, "1 Re-Entry"),
    (57, "2 Re-Entries"),  # per-flight format on site but main reads "2 Re-Entries"
    (58, "1 Re-Entry"),
    (59, "1 Re-Entry"),
    (60, "Freezeout"),
    (61, "1 Re-Entry"),
    (62, "1 Re-Entry"),
    (63, "2 Re-Entries Per Flight"),
    (64, "2 Re-Entries"),
    (65, "Freezeout"),
    (66, "Freezeout"),
    (67, "Freezeout"),
    (68, "1 Re-Entry"),
    (69, "Freezeout"),
    (70, "Freezeout"),
    (71, "2 Re-Entries"),
    (72, "Flight A: Bust A Play B; Flight B: Bust B Play C; Flight C: Freezeout"),
    (73, "1 Re-Entry"),
    (74, "1 Re-Entry"),
    (75, "Freezeout"),
    (76, "2 Re-Entries"),
    (77, "1 Re-Entry"),
    (78, "1 Re-Entry"),
    (79, "Freezeout"),
    (80, "Freezeout"),
    (81, "1 Re-Entry Per Flight"),
    (82, "Freezeout"),
    (83, "2 Re-Entries"),
    (84, "1 Re-Entry"),
    (85, "1 Re-Entry"),
    (86, "2 Re-Entries Per Flight"),
    (87, "2 Re-Entries Per Flight"),
    (88, "2 Re-Entries Per Flight"),
    (89, "1 Re-Entry Per Flight"),
    (90, "1 Re-Entry"),
    (91, "2 Re-Entries"),
    (92, "1 Re-Entry"),  # "1 Re-Entry Per Player" simplifies to 1
    (93, "Unlimited Re-Entry"),
    (94, "Freezeout"),
    (95, "2 Re-Entries Per Flight"),
    (96, "2 Re-Entries"),
    (97, "1 Re-Entry"),
    (98, "1 Re-Entry"),
    (99, "1 Re-Entry"),
    (100, "1 Re-Entry"),
]


def map_simple(text):
    """Map a simple (non-composite) WSOP re-entry string to DB format."""
    t = text.strip()
    if t == "Freezeout":
        return "Freezeout"
    if t == "Unlimited Re-Entry":
        return "Unlimited"
    if t == "1 Re-Entry Per Flight":
        return "1 Per Flight"
    if t == "2 Re-Entries Per Flight":
        return "2 Per Flight"
    m = re.match(r"^(\d+)\s+Re-Entr", t)
    if m:
        return m.group(1)
    return None


def parse_composite(text):
    """For 'Flight X: ...; Flight Y: ...; ...' return {letter: db_value}."""
    parts = [p.strip() for p in text.split(";")]
    out = {}
    for p in parts:
        m = re.match(r"Flight\s+([A-Z]):\s*(.+)$", p)
        if not m:
            continue
        letter = m.group(1)
        rest = m.group(2).strip()
        out[letter] = rest  # keep original phrasing; matches DB convention
    return out


def main():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    updates = 0
    skipped = 0
    not_found = []

    for evnum, official in WSOP_OFFICIAL:
        ev_str = str(evnum)
        # Composite (per-flight) policy: parse and apply by flight letter.
        if official.startswith("Flight ") and ";" in official:
            flight_map = parse_composite(official)
            c.execute(
                "SELECT id, event_name, reentry FROM tournaments "
                "WHERE venue='Horseshoe / Paris Las Vegas' AND event_number=? "
                "AND event_name NOT LIKE '%Day 2%' AND event_name NOT LIKE '%Day 3%' "
                "AND event_name NOT LIKE '%Day 4%' AND event_name NOT LIKE '%Day 5%' "
                "AND event_name NOT LIKE '%Day 6%' AND event_name NOT LIKE '%Day 7%' "
                "AND event_name NOT LIKE '%Day 8%' AND event_name NOT LIKE '%Day 9%' "
                "AND event_name NOT LIKE '%Final%' AND event_name NOT LIKE '%Restart%'",
                (ev_str,)
            )
            for row_id, name, current in c.fetchall():
                # Find Flight letter in event_name
                fm = re.search(r"Flight ([A-Z])", name)
                if not fm:
                    continue
                letter = fm.group(1)
                desired = flight_map.get(letter)
                if desired and desired != current:
                    c.execute("UPDATE tournaments SET reentry=? WHERE id=?", (desired, row_id))
                    updates += 1
                    print(f"  #{evnum} {name}: {current!r} -> {desired!r}")
            continue

        desired = map_simple(official)
        if desired is None:
            print(f"!! Could not parse official text for #{evnum}: {official!r}")
            continue

        c.execute(
            "SELECT id, event_name, reentry FROM tournaments "
            "WHERE venue='Horseshoe / Paris Las Vegas' AND event_number=? "
            "AND event_name NOT LIKE '%Day 2%' AND event_name NOT LIKE '%Day 3%' "
            "AND event_name NOT LIKE '%Day 4%' AND event_name NOT LIKE '%Final%' "
            "AND event_name NOT LIKE '%Restart%'",
            (ev_str,)
        )
        rows = c.fetchall()
        if not rows:
            not_found.append(evnum)
            continue
        for row_id, name, current in rows:
            if current != desired:
                c.execute("UPDATE tournaments SET reentry=? WHERE id=?", (desired, row_id))
                updates += 1
                print(f"  #{evnum} {name}: {current!r} -> {desired!r}")
            else:
                skipped += 1

    conn.commit()
    conn.close()

    print()
    print(f"Updated rows: {updates}")
    print(f"Already correct (skipped): {skipped}")
    if not_found:
        print(f"Event numbers not found in DB: {not_found}")


if __name__ == "__main__":
    main()
