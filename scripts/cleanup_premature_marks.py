#!/usr/bin/env python3
"""JOB 1 rule 4 — delete premature weekly_marks: a mark for the UNFINISHED current
week (2026-W35, 24-30 Aug) whose value == entry, on trades initiated 2026-08-24.
Removes from BOTH the trades.data jsonb AND the weekly_marks table. Reports each."""
import os, json, urllib.request
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']
H = {'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json'}
UNFINISHED_WEEK = '2026-W35'; PREMATURE_INIT = '2026-08-24'

def req(url, method='GET', body=None, pref=None):
    h = dict(H)
    if pref: h['Prefer'] = pref
    r = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None), method=method, headers=h)
    return urllib.request.urlopen(r, timeout=60)

rows = json.loads(req(f"{SB}/rest/v1/trades?select=id,user_id,data").read())
deleted = []
for r in rows:
    d = r['data']; fcp = d.get('fridayClosingPrices', {})
    entry = d.get('buyPrice') if d.get('direction') == 'Long' else d.get('sellPrice')
    if d.get('dateInitiated') == PREMATURE_INIT and UNFINISHED_WEEK in fcp and fcp[UNFINISHED_WEEK] == entry:
        tid = d['id']
        deleted.append({'trade_id': tid, 'symbol': d.get('symbol'), 'status': d.get('status'),
                        'week': UNFINISHED_WEEK, 'value': fcp[UNFINISHED_WEEK], 'init': d.get('dateInitiated')})
        # 1) strip the key from the jsonb and PATCH the trade
        newfcp = {k: v for k, v in fcp.items() if k != UNFINISHED_WEEK}
        newdata = {**d, 'fridayClosingPrices': newfcp}
        req(f"{SB}/rest/v1/trades?data->>id=eq.{tid}", method='PATCH', body={'data': newdata}, pref='return=minimal')
        # 2) delete the weekly_marks row
        req(f"{SB}/rest/v1/weekly_marks?trade_id=eq.{tid}&week_key=eq.{UNFINISHED_WEEK}", method='DELETE', pref='return=minimal')

print(json.dumps(deleted, indent=2))
# verify none remain
after = json.loads(req(f"{SB}/rest/v1/weekly_marks?select=trade_id,week_key&week_key=eq.{UNFINISHED_WEEK}").read())
print('remaining W35 weekly_marks rows after cleanup:', len(after))
