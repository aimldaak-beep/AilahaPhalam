#!/usr/bin/env python3
"""Seed one throwaway allowlisted user for the closed-by-week smoke (writes sessPT.json + pertrade.json into PT_DIR
   so scripts/cleanup_pertrade.py removes it).
   DOW-PT   USD carried W35→W37, closed Wed 9 Sep  → +89,280 (history +35,640 / +72,000 / −18,360)
   NAS-W37  USD same-week, closed Fri 11 Sep @89   → +1,41,688
   NIF-W36  INR same-week, closed Wed 2 Sep        → +6,400
   OLD-W34  INR same-week, closed Thu 20 Aug       → −8,578
   NIF-PT   INR OPEN (excluded from Closed)."""
import os, json, urllib.request, random
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; AK = os.environ['VITE_SUPABASE_ANON_KEY']; DIR = os.environ['PT_DIR']
def post(url, body, key=SK, pref='return=representation'):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': pref}), timeout=60)
email = f'smoke-cw-{random.randint(1,10**9)}@example.com'
uid = json.loads(post(f'{SB}/auth/v1/admin/users', {'email': email, 'email_confirm': True}).read())['id']
gl = json.loads(post(f'{SB}/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}).read())
hashed = gl.get('hashed_token') or gl.get('properties', {}).get('hashed_token')
sess = json.loads(post(f'{SB}/auth/v1/verify', {'type': 'magiclink', 'token_hash': hashed}, key=AK).read())
open(f'{DIR}/sessPT.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None)
    o.setdefault('fridayClosingPrices', {}); o.setdefault('fridayUsdToInrRates', {}); return o
rows = [
  T(id='t_dow_pt', symbol='DOW-PT', instrument='DOW', direction='Long', dateInitiated='2026-08-25', buyPrice=40000, sellPrice=40250, buyDate='2026-08-25', sellDate='2026-09-09', lotSize=5, numberOfLots=1, status='Closed', currency='USD', usdToInrRate=90, realizationRate=0.8, fridayClosingPrices={'2026-W35': 40100, '2026-W36': 40300}),
  T(id='t_nas_w37', symbol='NAS-W37', instrument='Nasdaq', direction='Long', dateInitiated='2026-09-10', buyPrice=20000, sellPrice=20100, buyDate='2026-09-10', sellDate='2026-09-11', lotSize=20, numberOfLots=1, status='Closed', currency='USD', usdToInrRate=89, realizationRate=0.8),
  T(id='t_nif_w36', symbol='NIF-W36', instrument='Futures', direction='Long', dateInitiated='2026-09-01', buyPrice=24400, sellPrice=24500, buyDate='2026-09-01', sellDate='2026-09-02', lotSize=75, numberOfLots=1, status='Closed', currency='INR', usdToInrRate=1, realizationRate=1.0),
  T(id='t_old_w34', symbol='OLD-W34', instrument='Futures', direction='Long', dateInitiated='2026-08-19', buyPrice=24000, sellPrice=23900, buyDate='2026-08-19', sellDate='2026-08-20', lotSize=75, numberOfLots=1, status='Closed', currency='INR', usdToInrRate=1, realizationRate=1.0),
  T(id='t_nif_pt', symbol='NIF-PT', instrument='Futures', direction='Long', dateInitiated='2026-08-31', buyPrice=24400, sellPrice=None, buyDate='2026-08-31', sellDate=None, lotSize=75, numberOfLots=1, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0, fridayClosingPrices={'2026-W36': 24500, '2026-W37': 24450}),
]
post(f'{SB}/rest/v1/trades', [{'user_id': uid, 'data': d} for d in rows], pref='return=minimal')
marks = [{'user_id': uid, 'trade_id': d['id'], 'week_key': k, 'close_price': v, 'updated_at': '2026-09-12T00:00:00Z'} for d in rows for k, v in d['fridayClosingPrices'].items()]
post(f'{SB}/rest/v1/weekly_marks', marks, pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': sorted(set(cur + [email]))}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
open(f'{DIR}/pertrade.json', 'w').write(json.dumps({'email': email, 'uid': uid}))
print('seeded', email, uid)
