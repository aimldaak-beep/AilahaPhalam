#!/usr/bin/env python3
"""PHASE 0 verify — re-read archived files from disk, count rows independently,
and cross-check against a FRESH live server count. Read-only."""
import os, json, csv, urllib.request, pathlib

SB = os.environ["VITE_SUPABASE_URL"].rstrip("/")
SK = os.environ["SUPABASE_SERVICE_KEY"]
OUT = pathlib.Path(__file__).resolve().parents[1] / "archive" / "2026-08-24"
TABLES = ["daily_ohlc","signal_dates","signals","trade_tracker","trades",
          "user_settings","week_offsets","weekly_marks"]

def live_count(t):
    r = urllib.request.Request(f"{SB}/rest/v1/{t}?select=*&limit=1",
        headers={"apikey":SK,"Authorization":f"Bearer {SK}","Prefer":"count=exact","Range":"0-0"})
    cr = urllib.request.urlopen(r, timeout=60).headers.get("Content-Range","")
    return int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1]!="*" else 0

def csv_rows(p):
    with open(p, newline="", encoding="utf-8") as f:
        return sum(1 for _ in csv.reader(f)) - 1  # minus header

print(f"{'table':16} {'live':>8} {'json':>8} {'csv':>8}  status")
ok = True
for t in TABLES:
    jl = len(json.loads((OUT/f"{t}.json").read_text()))
    cl = csv_rows(OUT/f"{t}.csv")
    lv = live_count(t)
    match = (jl==cl==lv)
    ok = ok and match
    print(f"{t:16} {lv:8d} {jl:8d} {cl:8d}  {'OK' if match else 'MISMATCH'}")
print("\nALL_VERIFIED" if ok else "\nVERIFICATION_FAILED")
