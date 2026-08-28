#!/usr/bin/env python3
"""
One-time migration to the weekly FX settlement model (2026-08-28).

1. KILL THE STORED GHOST: every USD trade's data.usdToInrRate 83.24 snapshot -> null
   (the weekly rate store is the ONE source; a missing rate must be loud, not 83.x).
2. COMEX -> ordinary USD: COPPER-HG/MHG trades stored with internal currency 'INR'
   (the old display-only-$ law) become currency 'USD' so the engine converts them at
   the weekly rate inside the one Rs MTM.
3. SEED: this week's (2026-W35) provisional USD/INR = 95.55, as an RLS-scoped sentinel
   row in `trades` (data.kind = 'fx_weekly_rates') for each user that owns trades.

Idempotent; prints every change. Uses SUPABASE_SERVICE_KEY from .env (server-side only).
"""
import json, urllib.request, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
env = {}
for line in open(os.path.join(HERE, '..', '.env')):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); env[k] = v.strip()
URL, KEY = env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_KEY']
HDRS = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
WEEK, RATE = '2026-W35', 95.55
COMEX = {'COPPER-HG', 'COPPER-MHG'}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDRS)
    if method in ('PATCH', 'POST'): h['Prefer'] = 'return=representation'
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        t = resp.read()
        return json.loads(t) if t else None

rows = req('GET', '/rest/v1/trades?select=id,user_id,data')
users = set()
for row in rows:
    d = row['data']
    if isinstance(d, dict) and d.get('kind'):
        continue  # sentinel doc, not a trade
    users.add(row['user_id'])
    changed = []
    if d.get('instrument') in COMEX and d.get('currency') != 'USD':
        d['currency'] = 'USD'; changed.append("currency INR->USD (COMEX joins weekly FX)")
    if d.get('currency') == 'USD' and d.get('usdToInrRate') is not None:
        changed.append(f"usdToInrRate {d['usdToInrRate']} -> null (ghost killed)")
        d['usdToInrRate'] = None
    if changed:
        req('PATCH', f"/rest/v1/trades?id=eq.{row['id']}", {'data': d})
        print(f"UPDATED {d.get('symbol')} ({d.get('id')}): " + '; '.join(changed))
    else:
        print(f"ok      {d.get('symbol')} ({d.get('id')}): no change")

# Seed the weekly-rate store for each trade-owning user (skip if the doc exists).
for uid in sorted(users):
    have = req('GET', f"/rest/v1/trades?select=id,data&user_id=eq.{uid}&data->>kind=eq.fx_weekly_rates")
    if have:
        print(f"fx doc  user {uid[:8]}: already present -> {json.dumps(have[0]['data'].get('weeks'))}")
        continue
    doc = {'id': 'fx_weekly_rates_v1', 'kind': 'fx_weekly_rates',
           'weeks': {WEEK: {'rate': RATE, 'settled': False}}}
    req('POST', '/rest/v1/trades', {'user_id': uid, 'data': doc})
    print(f"SEEDED  user {uid[:8]}: {WEEK} provisional = {RATE}")
print('done.')
