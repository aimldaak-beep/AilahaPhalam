#!/usr/bin/env python3
"""Full dump of trades / weekly_marks / user_settings (ALL rows, service key) into the given dir — the
   DATA-SAFETY LAW backup taken BEFORE any change. Usage: python3 scripts/backup_db.py <dir>"""
import os, sys, json, urllib.request
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']; DIR = sys.argv[1]
H = {'apikey': SK, 'Authorization': f'Bearer {SK}'}
for tbl, order in (('trades', 'id'), ('weekly_marks', 'id'), ('user_settings', 'user_id')):
    rows = json.loads(urllib.request.urlopen(urllib.request.Request(f'{SB}/rest/v1/{tbl}?select=*&order={order}&limit=10000', headers=H), timeout=60).read())
    json.dump(rows, open(f'{DIR}/{tbl}.json', 'w'), indent=1); print(tbl, len(rows))
