#!/usr/bin/env python3
"""Match Orleans DB rows to OSO PDF structure-sheet pages, then apply UPDATE.

Run from project root:
    python3 scripts/match_orleans_oso.py --dry-run
    python3 scripts/match_orleans_oso.py --commit
"""
import argparse
import sqlite3

DB = "poker-tournaments.db"
PDF_PATH = "schedule-docs/Orleans/structures/2026_oso_flyer_and_structures.pdf"

PAGE_MAP = [
    {"page":5,"title":"OSO NLH Main Event","buyin":600,"is_sat":False,
     "dates_times":[("2026-07-01","11:00 AM"),("2026-07-01","5:00 PM"),
                    ("2026-07-02","11:00 AM"),("2026-07-02","5:00 PM"),
                    ("2026-07-03","11:00 AM"),("2026-07-04","11:00 AM")],
     "name_substr":"main event"},
    {"page":6,"title":"11 Game Mixed Championship","buyin":1100,"is_sat":False,
     "dates_times":[("2026-06-22","12:00 PM")],
     "name_substr":"11 game"},
    # Day 2 row of 11-game mix has buyin=0; match it separately by name+date below.
    {"page":7,"title":"Super Sunday Special NLH $100k","buyin":300,"is_sat":False,
     "dates_times":[("2026-05-24","11:00 AM"),("2026-05-31","11:00 AM"),
                    ("2026-06-07","11:00 AM"),("2026-06-14","11:00 AM"),
                    ("2026-06-21","11:00 AM"),("2026-06-28","11:00 AM")],
     "name_substr":"sunday special"},
    {"page":8,"title":"OSO NLH Senior's Mega Stack","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-13","10:00 AM")],"name_substr":"senior"},
    {"page":9,"title":"OSO NLH Ladies Mega Stack","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-19","11:00 AM")],"name_substr":"ladies"},
    {"page":10,"title":"OSO NLH Mega Stack","buyin":400,"is_sat":False,
     "dates_times":[("2026-05-23","11:00 AM"),("2026-05-30","11:00 AM"),
                    ("2026-06-04","11:00 AM"),("2026-06-06","11:00 AM"),
                    ("2026-06-11","11:00 AM"),("2026-06-12","11:00 AM"),
                    ("2026-06-15","11:00 AM"),("2026-06-20","11:00 AM"),
                    ("2026-06-22","11:00 AM"),("2026-06-27","11:00 AM"),
                    ("2026-07-07","11:00 AM"),("2026-07-10","11:00 AM")],
     "name_substr":"mega stack"},
    {"page":11,"title":"OSO NLH Monster Stack","buyin":300,"is_sat":False,
     "dates_times":[("2026-05-28","11:00 AM"),("2026-05-29","11:00 AM"),
                    ("2026-06-01","11:00 AM"),("2026-06-05","11:00 AM"),
                    ("2026-06-09","11:00 AM"),("2026-06-16","11:00 AM"),
                    ("2026-06-18","11:00 AM"),("2026-06-19","11:00 AM"),
                    ("2026-06-23","11:00 AM"),("2026-06-25","11:00 AM"),
                    ("2026-06-26","11:00 AM")],
     "name_substr":"monster stack"},
    {"page":12,"title":"OSO NLH Friday Monster Stack","buyin":200,"is_sat":False,
     "dates_times":[("2026-05-22","6:00 PM"),("2026-05-29","6:00 PM"),
                    ("2026-06-05","6:00 PM"),("2026-06-12","6:00 PM"),
                    ("2026-06-19","6:00 PM"),("2026-06-26","6:00 PM"),
                    ("2026-07-10","6:00 PM")],
     "name_substr":"friday"},
    {"page":13,"title":"OSO NLH Super Stack","buyin":200,"is_sat":False,
     "dates_times":[("2026-05-22","11:00 AM"),("2026-05-26","11:00 AM"),
                    ("2026-05-27","11:00 AM"),("2026-06-02","11:00 AM"),
                    ("2026-06-03","11:00 AM"),("2026-06-08","11:00 AM"),
                    ("2026-06-10","11:00 AM"),("2026-06-13","11:00 AM"),
                    ("2026-06-17","11:00 AM"),("2026-06-24","11:00 AM"),
                    ("2026-06-29","11:00 AM"),("2026-06-30","11:00 AM")],
     "name_substr":"super stack"},
    {"page":14,"title":"OSO Triple Triple Draw $10k","buyin":240,"is_sat":False,
     "dates_times":[("2026-05-22","4:00 PM"),("2026-05-28","4:00 PM"),
                    ("2026-06-06","4:00 PM"),("2026-06-20","4:00 PM"),
                    ("2026-06-27","4:00 PM")],
     "name_substr":"triple triple"},
    {"page":15,"title":"OSO Omaha 8-or-Better Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-05-23","12:00 PM")],"name_substr":"plo8"},
    {"page":16,"title":"OSO T.O.R.S.E. $10k","buyin":240,"is_sat":False,
     "dates_times":[("2026-05-23","4:00 PM"),("2026-06-02","4:00 PM"),
                    ("2026-06-24","4:00 PM")],
     "name_substr":"torse"},
    {"page":17,"title":"OSO Nightly NLH Monster Stack","buyin":200,"is_sat":False,
     "dates_times":[("2026-05-23","6:00 PM"),("2026-05-25","6:00 PM"),
                    ("2026-05-26","6:00 PM"),("2026-05-27","6:00 PM"),
                    ("2026-05-28","6:00 PM"),("2026-05-30","6:00 PM"),
                    ("2026-06-01","6:00 PM"),("2026-06-02","6:00 PM"),
                    ("2026-06-03","6:00 PM"),("2026-06-04","6:00 PM"),
                    ("2026-06-06","6:00 PM"),("2026-06-08","6:00 PM"),
                    ("2026-06-09","6:00 PM"),("2026-06-10","6:00 PM"),
                    ("2026-06-11","6:00 PM"),("2026-06-13","6:00 PM"),
                    ("2026-06-15","6:00 PM"),("2026-06-16","6:00 PM"),
                    ("2026-06-17","6:00 PM"),("2026-06-18","6:00 PM"),
                    ("2026-06-20","6:00 PM"),("2026-06-22","6:00 PM"),
                    ("2026-06-23","6:00 PM"),("2026-06-24","6:00 PM"),
                    ("2026-06-25","6:00 PM"),("2026-06-27","6:00 PM"),
                    ("2026-06-29","6:00 PM"),("2026-06-30","6:00 PM")],
     "name_substr":"nightly"},
    {"page":18,"title":"OSO Pot Limit Big-O","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-13","4:00 PM"),("2026-06-17","4:00 PM"),
                    ("2026-05-24","6:00 PM"),("2026-05-31","6:00 PM"),
                    ("2026-06-07","6:00 PM"),
                    ("2026-06-21","6:00 PM"),("2026-06-28","6:00 PM")],
     "name_substr":"big o"},
    {"page":19,"title":"OSO Senior's Monster Stack","buyin":400,"is_sat":False,
     "dates_times":[("2026-05-25","11:00 AM")],"name_substr":"senior"},
    {"page":20,"title":"OSO H.O.R.S.E.","buyin":240,"is_sat":False,
     "dates_times":[("2026-05-25","4:00 PM"),("2026-06-09","4:00 PM"),
                    ("2026-06-15","4:00 PM"),("2026-06-22","4:00 PM"),
                    ("2026-06-29","4:00 PM")],
     "name_substr":"horse"},
    {"page":21,"title":"8 Game Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-05-26","12:00 PM")],"name_substr":"8-game"},
    {"page":22,"title":"OSO NLH Milestone 2K Bankroll Builder","buyin":230,"is_sat":False,
     "dates_times":[("2026-05-26","4:00 PM")],"name_substr":"2k"},
    {"page":23,"title":"PLO Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-05-27","12:00 PM")],"name_substr":"plo championship"},
    {"page":24,"title":"OSO NLH Milestone 1K Bankroll Builder","buyin":125,"is_sat":False,
     "dates_times":[("2026-05-27","4:00 PM"),("2026-05-30","4:00 PM"),
                    ("2026-06-03","4:00 PM"),("2026-06-08","4:00 PM")],
     "name_substr":"1k"},
    {"page":25,"title":"Mixed Omaha-8 Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-05-28","12:00 PM")],"name_substr":"mixed o8"},
    {"page":26,"title":"OSO Omaha-8/Stud-8","buyin":240,"is_sat":False,
     "dates_times":[("2026-05-29","4:00 PM"),("2026-06-10","4:00 PM")],
     "name_substr":"omaha-8/stud-8"},
    {"page":27,"title":"T.O.R.S.E. Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-05-30","12:00 PM")],"name_substr":"torse championship"},
    {"page":28,"title":"Pot Limit Omaha $10k","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-01","4:00 PM"),("2026-06-11","4:00 PM"),
                    ("2026-06-14","6:00 PM")],
     "name_substr":"plo"},
    {"page":29,"title":"PLO-8 Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-03","12:00 PM")],"name_substr":"plo 8"},
    {"page":30,"title":"Triple Stud Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-04","12:00 PM")],"name_substr":"triple stud"},
    {"page":31,"title":"OSO T.O.E.","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-04","4:00 PM"),("2026-06-16","4:00 PM")],
     "name_substr":"toe"},
    {"page":32,"title":"7 Game Draw Mix","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-05","12:00 PM")],"name_substr":"7 game"},
    {"page":33,"title":"T.O.E. Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-06","12:00 PM")],"name_substr":"toe championship"},
    {"page":34,"title":"B.E.A.S.T. Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-08","12:00 PM")],"name_substr":"beast"},
    {"page":35,"title":"Razz Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-11","12:00 PM")],"name_substr":"razz"},
    {"page":36,"title":"OSO Dramaha High/2-7 Mix","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-12","4:00 PM")],"name_substr":"dramaha"},
    {"page":37,"title":"Omaha-8/Stud-8 Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-15","12:00 PM")],"name_substr":"omaha-8/stud-8"},
    {"page":38,"title":"Mixed Limits 2-7 Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-16","12:00 PM")],"name_substr":"mixed limits"},
    {"page":39,"title":"Omaha 8-or-Better $50k","buyin":400,"is_sat":False,
     "dates_times":[("2026-06-18","12:00 PM")],"name_substr":"o8"},
    {"page":40,"title":"OSO Triple Stud $10k","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-18","4:00 PM")],"name_substr":"triple stud"},
    {"page":41,"title":"T.O.R.S.E. $30k","buyin":400,"is_sat":False,
     "dates_times":[("2026-06-20","12:00 PM")],"name_substr":"torse"},
    {"page":42,"title":"OSO 5 Game Draw Mix","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-23","12:00 PM")],"name_substr":"5 game"},
    {"page":43,"title":"PLO 4/5/6 Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-24","12:00 PM")],"name_substr":"plo 4/5/6"},
    {"page":44,"title":"PLO Big-O Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-25","12:00 PM")],"name_substr":"big o championship"},
    {"page":45,"title":"OSO Omaha 8-or-Better $10k","buyin":240,"is_sat":False,
     "dates_times":[("2026-06-25","4:00 PM")],"name_substr":""},
    {"page":46,"title":"Stud Championship","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-26","12:00 PM")],"name_substr":"stud"},
    {"page":47,"title":"PLO Big-O $40k","buyin":400,"is_sat":False,
     "dates_times":[("2026-06-27","12:00 PM")],"name_substr":"big o"},
    {"page":48,"title":"OSO Triple Triple Draw $40k","buyin":600,"is_sat":False,
     "dates_times":[("2026-06-29","12:00 PM")],"name_substr":"a-5"},
    {"page":49,"title":"Pot Limit Omaha $30k","buyin":400,"is_sat":False,
     "dates_times":[("2026-06-30","12:00 PM")],"name_substr":"plo"},
    {"page":50,"title":"OSO NLH Main Event Satellite","buyin":120,"is_sat":True,
     "dates_times":[("2026-06-30","4:00 PM"),("2026-07-01","4:00 PM"),
                    ("2026-07-02","4:00 PM"),("2026-07-03","4:00 PM")],
     "name_substr":"satellite"},
    {"page":51,"title":"Super Sunday Special NLH Turbo $50k","buyin":300,"is_sat":False,
     "dates_times":[],"name_substr":"sunday special turbo"},
    {"page":52,"title":"B.E.A.S.T. $30k","buyin":400,"is_sat":False,
     "dates_times":[],"name_substr":"beast"},
    {"page":53,"title":"9 Game Championship","buyin":600,"is_sat":False,
     "dates_times":[],"name_substr":"9-game"},
    {"page":54,"title":"T.O.E. $30k","buyin":400,"is_sat":False,
     "dates_times":[],"name_substr":"toe"},
    {"page":55,"title":"Mixed Omaha-8 $10k","buyin":240,"is_sat":False,
     "dates_times":[],"name_substr":"mixed o-8"},
]


def build_updates():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("""SELECT id, event_number, event_name, date, time, buyin, game_variant, is_satellite
                 FROM tournaments WHERE venue='Orleans' ORDER BY date, time""")
    rows = c.fetchall()
    conn.close()

    rows_by_dt = {}
    for r in rows:
        rows_by_dt.setdefault((r[3], r[4]), []).append(r)

    updates = []
    matched_row_ids = set()
    unmatched_pdf = []

    for entry in PAGE_MAP:
        page = entry["page"]
        path_frag = f"{PDF_PATH}#page={page}"
        for d, t in entry["dates_times"]:
            candidates = rows_by_dt.get((d, t), [])
            target_buyin = entry["buyin"]
            cands = [r for r in candidates
                     if r[5] == target_buyin and bool(r[7]) == entry["is_sat"]]
            if not cands:
                unmatched_pdf.append((page, entry["title"], d, t,
                                      f"no DB row buyin={target_buyin} sat={entry['is_sat']}"))
                continue
            if len(cands) > 1 and entry.get("name_substr"):
                ns = entry["name_substr"].lower()
                refined = [r for r in cands if ns in r[2].lower()]
                if refined:
                    cands = refined
            cands = [r for r in cands if r[0] not in matched_row_ids]
            if not cands:
                unmatched_pdf.append((page, entry["title"], d, t,
                                      "all candidates already claimed"))
                continue
            for r in cands:
                matched_row_ids.add(r[0])
                updates.append((path_frag, r[0], page, entry["title"], r))

    # Special: 11 Game Mixed Main Event Day 2 (buyin=0 in DB)
    for r in rows:
        if r[0] not in matched_row_ids and "11 game" in r[2].lower() and "day 2" in r[2].lower():
            matched_row_ids.add(r[0])
            updates.append((f"{PDF_PATH}#page=6", r[0], 6,
                            "11 Game Mixed Championship (Day 2)", r))

    # Special: NLH Main Event Day 2 (row 30388, buyin 600, date 2026-07-04, name has "Day 2")
    # Already matched by page 5 via 2026-07-04 11:00 AM buyin 600. Confirm.

    all_orleans_ids = {r[0] for r in rows}
    unlinked_ids = all_orleans_ids - matched_row_ids
    unlinked = [r for r in rows if r[0] in unlinked_ids]
    return updates, unmatched_pdf, unlinked, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    updates, unmatched_pdf, unlinked, rows = build_updates()
    print(f"Total Orleans rows: {len(rows)}")
    print(f"Updates planned: {len(updates)}")
    print(f"Unmatched PDF entries: {len(unmatched_pdf)}")
    print(f"Unlinked DB rows: {len(unlinked)}")

    if args.commit:
        conn = sqlite3.connect(DB)
        cur = conn.cursor()
        for path_frag, row_id, _, _, _ in updates:
            cur.execute(
                "UPDATE tournaments SET structure_sheet_path = ? WHERE id = ?",
                (path_frag, row_id))
        conn.commit()
        cur.execute("""SELECT COUNT(*) FROM tournaments
                       WHERE venue='Orleans' AND structure_sheet_path IS NOT NULL""")
        print(f"\nPost-commit linked count: {cur.fetchone()[0]}")
        conn.close()


if __name__ == "__main__":
    main()
