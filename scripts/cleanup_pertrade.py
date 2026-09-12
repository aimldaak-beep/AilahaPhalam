#!/usr/bin/env python3
"""Remove the per-trade-FX smoke user (rows, marks, pin, auth user, allowlist entry)."""
import os, json, urllib.request
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; DIR = os.environ['PT_DIR']
H = {'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json'}
def req(url, method='GET', body=None):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=H), timeout=60).read()
info = json.load(open(f'{DIR}/pertrade.json')); uid = info['uid']
for tbl in ('trades', 'weekly_marks', 'user_settings'):
    try: req(f'{SB}/rest/v1/{tbl}?user_id=eq.{uid}', 'DELETE')
    except Exception as e: print('skip', tbl, e)
req(f'{SB}/auth/v1/admin/users/{uid}', 'DELETE')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': sorted(e for e in cur if e != info['email'])}).encode(), method='PUT', headers={**H, 'x-upsert': 'true'}), timeout=30)
print('cleaned', info['email'])
