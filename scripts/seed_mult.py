#!/usr/bin/env python3
"""Seed for the editable-multiplier smoke:
   RELIANCE-SEED — NSE FUT (INR), lotSize 250, W34 mark (verify MTM + what-if use ×250)
   NIFTY-EDIT    — NIFTY FUT (INR), lotSize 75, W34 mark (edit multiplier 75→150, recompute)"""
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
open(DIR + '/sessM.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
open(DIR + '/mult.json', 'w').write(json.dumps({'email': email, 'uid': uid}))
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None); return o
trades = [
  T(id='m_rel', symbol='RELIANCE-SEED', instrument='NSE Futures', direction='Long', dateInitiated='2026-08-18', buyPrice=1400, sellPrice=None, buyDate='2026-08-18', sellDate=None, lotSize=250, numberOfLots=1, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0, fridayClosingPrices={'2026-W34':1450}, fridayUsdToInrRates={}),
  T(id='m_nifty', symbol='NIFTY-EDIT', instrument='Futures', direction='Long', dateInitiated='2026-08-18', buyPrice=24000, sellPrice=None, buyDate='2026-08-18', sellDate=None, lotSize=75, numberOfLots=2, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0, fridayClosingPrices={'2026-W34':24500}, fridayUsdToInrRates={}),
]
post(f'{SB}/rest/v1/trades', [{'user_id': uid, 'data': d} for d in trades], pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
cur = sorted(set(cur + [email]))
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': cur}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
print('seeded', email, uid)
