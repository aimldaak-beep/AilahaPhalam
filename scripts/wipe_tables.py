#!/usr/bin/env python3
"""PHASE 0 wipe — delete ALL rows from every public table. Archive verified &
committed (08fb247); user confirmed full wipe incl daily_ohlc + signals."""
import os, json, urllib.request, urllib.error

SB = os.environ["VITE_SUPABASE_URL"].rstrip("/")
SK = os.environ["SUPABASE_SERVICE_KEY"]
H  = {"apikey":SK,"Authorization":f"Bearer {SK}"}

# firstcol per table (guaranteed present). Universal all-rows filter:
# or=(col.is.null,col.not.is.null) matches every row regardless of nulls.
TABLES = {"daily_ohlc":"id","signal_dates":"scan_date","signals":"id",
          "trade_tracker":"id","trades":"id","user_settings":"user_id",
          "week_offsets":"id","weekly_marks":"id"}

def count(t):
    r=urllib.request.Request(f"{SB}/rest/v1/{t}?select=*&limit=1",
        headers={**H,"Prefer":"count=exact","Range":"0-0"})
    cr=urllib.request.urlopen(r,timeout=120).headers.get("Content-Range","")
    return int(cr.split("/")[-1]) if "/" in cr and cr.split("/")[-1]!="*" else 0

def wipe(t,col):
    # Try filtered all-rows delete; fall back to gte/lt on col if server rejects.
    for flt in [f"or=({col}.is.null,{col}.not.is.null)", f"{col}=not.is.null"]:
        url=f"{SB}/rest/v1/{t}?{flt}"
        r=urllib.request.Request(url,headers={**H,"Prefer":"return=minimal"},method="DELETE")
        try:
            urllib.request.urlopen(r,timeout=300); return None
        except urllib.error.HTTPError as e:
            body=e.read().decode()[:200]; last=f"{e.code} {body}"
    return last

print(f"{'table':16}{'before':>8}{'after':>8}  status")
allok=True
for t,col in TABLES.items():
    b=count(t)
    err=wipe(t,col)
    a=count(t)
    ok=(a==0); allok=allok and ok
    print(f"{t:16}{b:8d}{a:8d}  {'OK' if ok else 'FAIL'} {err or ''}")
print("\nWIPE_COMPLETE_ALL_ZERO" if allok else "\nWIPE_INCOMPLETE")
