#!/usr/bin/env python3
"""
One-time migration to PER-TRADE FX (2026-09-12).

Every USD trade gets its own data.usdToInrRate — the rate the engine currently converts
it at — so nothing changes silently:
  closed USD trade : closedUsdToInrRate (the rate its closing week was frozen at),
                     else its latest weekly stamp, else the user's latest stored weekly rate;
  open USD trade   : its latest weekly stamp (fridayUsdToInrRates, highest week),
                     else the user's latest stored weekly rate (the retired store's carry-forward).
A USD trade already carrying a valid rate (> 1) is left alone. INR trades untouched.
Legacy fields (fridayUsdToInrRates / closedUsdToInrRate) and the retired store row stay
on disk as history; the engine no longer reads them.

Idempotent; prints every decision. DRY_RUN=1 prints only. Uses SUPABASE_SERVICE_KEY from .env.
"""
import json, urllib.request, os

HERE = os.path.dirname(os.path.abspath(__file__))
env = {}
for line in open(os.path.join(HERE, '..', '.env')):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); env[k] = v.strip()
URL, KEY = env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_KEY']
HDRS = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
DRY = os.environ.get('DRY_RUN') == '1'

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDRS)
    if method in ('PATCH', 'POST'): h['Prefer'] = 'return=representation'
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        t = resp.read()
        return json.loads(t) if t else None

rows = req('GET', '/rest/v1/trades?select=id,user_id,data')
store = {}   # user_id -> weeks dict of the retired store
for row in rows:
    d = row['data']
    if isinstance(d, dict) and d.get('kind') == 'fx_weekly_rates':
        store[row['user_id']] = d.get('weeks') or {}

def store_latest(uid):
    weeks = store.get(uid) or {}
    if not weeks: return None
    return weeks[sorted(weeks)[-1]]['rate']

changed = 0; missing = []
for row in rows:
    d = row['data']
    if not isinstance(d, dict) or d.get('kind'): continue
    if d.get('currency') != 'USD':
        continue
    cur = d.get('usdToInrRate')
    if isinstance(cur, (int, float)) and cur > 1:
        print(f"ok      {d.get('symbol'):10} {d.get('id')}: already per-trade rate {cur}"); continue
    stamps = d.get('fridayUsdToInrRates') or {}
    last_stamp = stamps[sorted(stamps)[-1]] if stamps else None
    is_closed = d.get('status') in ('Closed', 'CarryForwardClosed')
    if is_closed:
        target = d.get('closedUsdToInrRate') or last_stamp or store_latest(row['user_id'])
        src = 'closedUsdToInrRate' if d.get('closedUsdToInrRate') else ('last stamp' if last_stamp else 'store latest')
    else:
        target = last_stamp or store_latest(row['user_id'])
        src = 'last stamp' if last_stamp else 'store latest'
    if not target:
        missing.append(d.get('id')); print(f"MISSING {d.get('symbol'):10} {d.get('id')}: no rate anywhere — AKS must set it via Edit trade"); continue
    print(f"{'DRY   ' if DRY else 'UPDATE'}  {d.get('symbol'):10} {d.get('id')}: usdToInrRate {cur} -> {target}  ({src}; {'closed' if is_closed else 'open'})")
    if not DRY:
        d['usdToInrRate'] = target
        req('PATCH', f"/rest/v1/trades?id=eq.{row['id']}", {'data': d})
    changed += 1
print(f"done. {'would change' if DRY else 'changed'} {changed}; missing {len(missing)}")
