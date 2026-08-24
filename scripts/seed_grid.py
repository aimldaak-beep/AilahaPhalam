#!/usr/bin/env python3
"""Seed 3 dummy trades with wildly different meta lengths for the grid-alignment smoke."""
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
open(DIR + '/sessG.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
open(DIR + '/grid.json', 'w').write(json.dumps({'email': email, 'uid': uid}))
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None); return o
trades = [
  # long symbol + long meta (12 lots, USD, 80%), two weekly marks
  T(id='g1', symbol='GIFTNIFTY25SEPFUT', instrument='Gift Nifty', direction='Long', dateInitiated='2026-08-11', buyPrice=25180, sellPrice=None, buyDate='2026-08-11', sellDate=None, lotSize=50, numberOfLots=12, status='CarryForwardLong', currency='USD', usdToInrRate=83.24, realizationRate=0.8, fridayClosingPrices={'2026-W33':25342,'2026-W34':25255}, fridayUsdToInrRates={'2026-W33':83.1,'2026-W34':83.24}),
  # short symbol (1 lot, USD, 100%), one mark
  T(id='g2', symbol='NKD', instrument='Nikkei', direction='Short', dateInitiated='2026-08-18', buyPrice=None, sellPrice=42480, buyDate=None, sellDate='2026-08-18', lotSize=100, numberOfLots=1, status='CarryForwardShort', currency='USD', usdToInrRate=83.24, realizationRate=1.0, fridayClosingPrices={'2026-W34':42210}, fridayUsdToInrRates={'2026-W34':83.24}),
  # INR trade, no marks (— for P&L/closed), medium symbol
  T(id='g3', symbol='NIFTY25SEP', instrument='Futures', direction='Long', dateInitiated='2026-08-24', buyPrice=24880, sellPrice=None, buyDate='2026-08-24', sellDate=None, lotSize=75, numberOfLots=4, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=0.8, fridayClosingPrices={}, fridayUsdToInrRates={}),
]
post(f'{SB}/rest/v1/trades', [{'user_id': uid, 'data': d} for d in trades], pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
cur = sorted(set(cur + [email]))
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': cur}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
print('seeded', email, uid)
