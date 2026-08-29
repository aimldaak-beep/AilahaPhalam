#!/usr/bin/env python3
"""Seed two throwaway allowlisted users for the Saturday-voice settlement smoke.
   U1 (mixed): DOW-SV (USD, opened Tue 25 Aug, W35) + NIF-SV (INR, opened Wed 26 Aug), W35 provisional 95.55.
   U2 (INR-only): NIF-ONLY (INR, opened Wed 26 Aug), no FX store at all.
   Writes sessSV1.json / sessSV2.json / satvoice.json into the scratchpad DIR (env SV_DIR)."""
import os, json, urllib.request, random
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; AK = os.environ['VITE_SUPABASE_ANON_KEY']
DIR = os.environ['SV_DIR']
def post(url, body, key=SK, pref='return=representation'):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': pref}), timeout=60)
def mint(tag):
    email = f'smoke-sv{tag}-{random.randint(1,10**9)}@example.com'
    uid = json.loads(post(f'{SB}/auth/v1/admin/users', {'email': email, 'email_confirm': True}).read())['id']
    gl = json.loads(post(f'{SB}/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}).read())
    hashed = gl.get('hashed_token') or gl.get('properties', {}).get('hashed_token')
    sess = json.loads(post(f'{SB}/auth/v1/verify', {'type': 'magiclink', 'token_hash': hashed}, key=AK).read())
    open(f'{DIR}/sessSV{tag}.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
    return email, uid
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None)
    o.setdefault('usdToInrRate', None); o.setdefault('fridayClosingPrices', {}); o.setdefault('fridayUsdToInrRates', {}); return o
dow = T(id='t_dow_sv', symbol='DOW-SV', instrument='DOW', direction='Long', dateInitiated='2026-08-25', buyPrice=40000, sellPrice=None, buyDate='2026-08-25', sellDate=None, lotSize=5, numberOfLots=1, status='CarryForwardLong', currency='USD', realizationRate=0.8)
nif = T(id='t_nif_sv', symbol='NIF-SV', instrument='Futures', direction='Long', dateInitiated='2026-08-26', buyPrice=24400, sellPrice=None, buyDate='2026-08-26', sellDate=None, lotSize=75, numberOfLots=1, status='CarryForwardLong', currency='INR', realizationRate=0.8)
nifo = dict(nif, id='t_nif_only', symbol='NIF-ONLY')
fxdoc = {'id': 'fx_weekly_rates_v1', 'kind': 'fx_weekly_rates', 'weeks': {'2026-W35': {'rate': 95.55, 'settled': False}}}
e1, u1 = mint(1); e2, u2 = mint(2)
post(f'{SB}/rest/v1/trades', [{'user_id': u1, 'data': d} for d in (dow, nif, fxdoc)], pref='return=minimal')
post(f'{SB}/rest/v1/trades', [{'user_id': u2, 'data': nifo}], pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
cur = sorted(set(cur + [e1, e2]))
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': cur}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
open(f'{DIR}/satvoice.json', 'w').write(json.dumps({'u1': {'email': e1, 'uid': u1}, 'u2': {'email': e2, 'uid': u2}}))
print('seeded', e1, u1, '|', e2, u2)
