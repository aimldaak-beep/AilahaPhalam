#!/usr/bin/env python3
"""Seed a user for the full-edit smoke: one live trade with marks (edit instrument+lots+entry),
one closed trade closed on 2026-08-23 (W34) to move across a week boundary."""
import os, json, urllib.request, random
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; AK = os.environ['VITE_SUPABASE_ANON_KEY']
DIR = '/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad'
def post(url, body, key=SK, pref='return=representation'):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': pref}), timeout=60)
email = f'smoke-{random.randint(1,10**9)}@example.com'
uid = json.loads(post(f'{SB}/auth/v1/admin/users', {'email': email, 'email_confirm': True}).read())['id']
gl = json.loads(post(f'{SB}/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}).read())
hashed = gl.get('hashed_token') or gl.get('properties', {}).get('hashed_token')
sess = json.loads(post(f'{SB}/auth/v1/verify', {'type': 'magiclink', 'token_hash': hashed}, key=AK).read())
open(DIR + '/sessE.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
open(DIR + '/edit.json', 'w').write(json.dumps({'email': email, 'uid': uid}))
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None); return o
trades = [
  T(id='e_live', symbol='GIFTNIFTY', instrument='Gift Nifty', direction='Long', dateInitiated='2026-08-11', buyPrice=25180, sellPrice=None, buyDate='2026-08-11', sellDate=None, lotSize=50, numberOfLots=2, status='CarryForwardLong', currency='USD', usdToInrRate=83.24, realizationRate=0.8, fridayClosingPrices={'2026-W33':25342,'2026-W34':25255}, fridayUsdToInrRates={'2026-W33':83.1,'2026-W34':83.24}),
  T(id='e_closed', symbol='NQ-EDIT', instrument='Nasdaq', direction='Long', dateInitiated='2026-08-11', buyPrice=23890, sellPrice=24012, buyDate='2026-08-11', sellDate='2026-08-23', lotSize=20, numberOfLots=3, status='Closed', currency='USD', usdToInrRate=83.24, closedUsdToInrRate=83.24, realizationRate=0.8, fridayClosingPrices={}, fridayUsdToInrRates={}),
]
post(f'{SB}/rest/v1/trades', [{'user_id': uid, 'data': d} for d in trades], pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
cur = sorted(set(cur + [email]))
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': cur}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
print('seeded', email, uid, '| e_live (edit instr+lots+entry), e_closed closed 23 Aug W34 (move date)')
