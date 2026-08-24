#!/usr/bin/env python3
"""AILAHA PHALAM v2 — PHASE 0 archive. Full export of every public table to
CSV + JSON under archive/<date>/. Read-only; performs NO deletion."""
import os, sys, json, csv, urllib.request, urllib.parse, pathlib

SB = os.environ["VITE_SUPABASE_URL"].rstrip("/")
SK = os.environ["SUPABASE_SERVICE_KEY"]
DATE = "2026-08-24"
OUT = pathlib.Path(__file__).resolve().parents[1] / "archive" / DATE
OUT.mkdir(parents=True, exist_ok=True)

TABLES = ["daily_ohlc","signal_dates","signals","trade_tracker","trades",
          "user_settings","week_offsets","weekly_marks"]

def req(url, headers, method="GET"):
    r = urllib.request.Request(url, headers=headers, method=method)
    return urllib.request.urlopen(r, timeout=60)

def exact_count(table):
    url = f"{SB}/rest/v1/{table}?select=*&limit=1"
    h = {"apikey":SK,"Authorization":f"Bearer {SK}","Prefer":"count=exact","Range-Unit":"items","Range":"0-0"}
    resp = req(url, h)
    cr = resp.headers.get("Content-Range","")  # e.g. 0-0/1234
    return int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1] != "*" else 0

def fetch_all(table):
    rows, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select":"*","limit":step,"offset":off})
        h = {"apikey":SK,"Authorization":f"Bearer {SK}"}
        data = json.loads(req(f"{SB}/rest/v1/{table}?{q}", h).read().decode())
        rows.extend(data)
        if len(data) < step: break
        off += step
    return rows

summary = []
for t in TABLES:
    cnt = exact_count(t)
    rows = fetch_all(t)
    # JSON
    (OUT / f"{t}.json").write_text(json.dumps(rows, indent=2, default=str, ensure_ascii=False))
    # CSV — union of all keys across rows, stable order
    keys = []
    for r in rows:
        for k in r.keys():
            if k not in keys: keys.append(k)
    with open(OUT / f"{t}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k:(json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v) for k,v in r.items()})
    summary.append({"table":t,"server_count":cnt,"rows_fetched":len(rows),
                    "json_bytes":(OUT/f"{t}.json").stat().st_size,
                    "csv_bytes":(OUT/f"{t}.csv").stat().st_size})
    print(f"  {t}: server={cnt} fetched={len(rows)}")

(OUT / "_manifest.json").write_text(json.dumps({"date":DATE,"project":SB,"tables":summary}, indent=2))
print("MANIFEST_WRITTEN", OUT / "_manifest.json")
