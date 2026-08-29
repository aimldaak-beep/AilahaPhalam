#!/usr/bin/env python3
"""Remove the two Saturday-voice smoke users (rows, marks, auth users, allowlist entries)."""
import os, json, urllib.request
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']
DIR = os.environ['SV_DIR']
H = {'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json'}
def req(url, method='GET', body=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=H)
    return urllib.request.urlopen(r, timeout=60).read()
info = json.load(open(f'{DIR}/satvoice.json'))
emails = []
for u in info.values():
    uid = u['uid']; emails.append(u['email'])
    for tbl in ('trades', 'weekly_marks', 'user_settings'):
        try: req(f'{SB}/rest/v1/{tbl}?user_id=eq.{uid}', 'DELETE')
        except Exception as e: print('skip', tbl, e)
    req(f'{SB}/auth/v1/admin/users/{uid}', 'DELETE')
cur = json.loads(urllib.request.urlopen(f'{SB}/storage/v1/object/public/config/allowlist.json', timeout=30).read())['emails']
cur = sorted(e for e in cur if e not in emails)
urllib.request.urlopen(urllib.request.Request(f"{SB}/storage/v1/object/config/allowlist.json", data=json.dumps({'emails': cur}).encode(), method='PUT',
    headers={**H, 'x-upsert': 'true'}), timeout=30)
print('cleaned', emails)
