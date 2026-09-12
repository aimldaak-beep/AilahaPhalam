#!/usr/bin/env python3
"""Seed for the journal-fix / weekly-stamp / alert smoke (per-trade seed + two UNSTAMPED open trades).
   TATA-PT INR NSE Futures ×250 opened Wed 9 Sep @8000 (no stamp) · GIFT-PT INR Futures ×75 opened Mon 7 Sep @24400 (no stamp).
   DOW-PT  USD Long ×5, opened Tue 25 Aug (W35) @40000, rate 90, stamps W35 40100 / W36 40300, CLOSED Wed 9 Sep @40250
           → pieces +35,640 / +72,000 / −18,360 = realized +89,280 (engine-proved in scripts/fx-pertrade-proof.ts)
   NIF-PT  INR Long ×75 Futures, opened Mon 31 Aug (W36) @24400, stamps W36 24500 / W37 24450, OPEN → +6,951 / −3,750
   NAS-PT  USD Long ×20 Nasdaq, opened Mon 7 Sep (W37) @20000, rate 89, stamp W37 20050, OPEN → +70,844
   Writes sessPT.json + pertrade.json into env PT_DIR."""
import os, json, urllib.request, random
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; AK = os.environ['VITE_SUPABASE_ANON_KEY']
DIR = os.environ['PT_DIR']
def post(url, body, key=SK, pref='return=representation'):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': pref}), timeout=60)
email = f'smoke-jf-{random.randint(1,10**9)}@example.com'
uid = json.loads(post(f'{SB}/auth/v1/admin/users', {'email': email, 'email_confirm': True}).read())['id']
gl = json.loads(post(f'{SB}/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}).read())
hashed = gl.get('hashed_token') or gl.get('properties', {}).get('hashed_token')
sess = json.loads(post(f'{SB}/auth/v1/verify', {'type': 'magiclink', 'token_hash': hashed}, key=AK).read())
open(f'{DIR}/sessPT.json', 'w').write(json.dumps({k: sess[k] for k in ['access_token','refresh_token','expires_in','expires_at','token_type','user'] if k in sess}))
def T(**o):
    o.setdefault('currentTradingPrice', None); o.setdefault('entryBrokerage', None); o.setdefault('exitBrokerage', None)
    o.setdefault('fridayClosingPrices', {}); o.setdefault('fridayUsdToInrRates', {}); return o
dow = T(id='t_dow_pt', symbol='DOW-PT', instrument='DOW', direction='Long', dateInitiated='2026-08-25', buyPrice=40000, sellPrice=40250, buyDate='2026-08-25', sellDate='2026-09-09', lotSize=5, numberOfLots=1, status='Closed', currency='USD', usdToInrRate=90, realizationRate=0.8, fridayClosingPrices={'2026-W35': 40100, '2026-W36': 40300})
nif = T(id='t_nif_pt', symbol='NIF-PT', instrument='Futures', direction='Long', dateInitiated='2026-08-31', buyPrice=24400, sellPrice=None, buyDate='2026-08-31', sellDate=None, lotSize=75, numberOfLots=1, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0, fridayClosingPrices={'2026-W36': 24500, '2026-W37': 24450})
nas = T(id='t_nas_pt', symbol='NAS-PT', instrument='Nasdaq', direction='Long', dateInitiated='2026-09-07', buyPrice=20000, sellPrice=None, buyDate='2026-09-07', sellDate=None, lotSize=20, numberOfLots=1, status='CarryForwardLong', currency='USD', usdToInrRate=89, realizationRate=0.8, fridayClosingPrices={'2026-W37': 20050})
tata = T(id='t_tata_pt', symbol='TATA-PT', instrument='NSE Futures', direction='Long', dateInitiated='2026-09-09', buyPrice=8000, sellPrice=None, buyDate='2026-09-09', sellDate=None, lotSize=250, numberOfLots=1, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0)
gift = T(id='t_gift_pt', symbol='GIFT-PT', instrument='Futures', direction='Long', dateInitiated='2026-09-07', buyPrice=24400, sellPrice=None, buyDate='2026-09-07', sellDate=None, lotSize=75, numberOfLots=1, status='CarryForwardLong', currency='INR', usdToInrRate=1, realizationRate=1.0)
post(f'{SB}/rest/v1/trades', [{'user_id': uid, 'data': d} for d in (dow, nif, nas, tata, gift)], pref='return=minimal')
marks = [{'user_id': uid, 'trade_id': d['id'], 'week_key': k, 'close_price': v, 'updated_at': '2026-09-12T00:00:00Z'} for d in (dow, nif, nas) for k, v in d['fridayClosingPrices'].items()]
post(f'{SB}/rest/v1/weekly_marks', marks, pref='return=minimal')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': sorted(set(cur + [email]))}).encode(), method='PUT',
    headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'}), timeout=30)
open(f'{DIR}/pertrade.json', 'w').write(json.dumps({'email': email, 'uid': uid}))
print('seeded', email, uid)
