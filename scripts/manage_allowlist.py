#!/usr/bin/env python3
"""Owner admin channel for the email allowlist (public bucket config/allowlist.json).
Usage: manage_allowlist.py [list | add EMAIL | remove EMAIL | set E1,E2,...]
Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY in env."""
import os, sys, json, urllib.request
SB = os.environ['VITE_SUPABASE_URL'].rstrip('/'); SK = os.environ['SUPABASE_SERVICE_KEY']
OBJ = 'config/allowlist.json'
PUB = f'{SB}/storage/v1/object/public/{OBJ}'

def read():
    try:
        with urllib.request.urlopen(PUB, timeout=30) as r:
            d = json.loads(r.read()); return [e.lower() for e in (d if isinstance(d, list) else d.get('emails', []))]
    except Exception:
        return []

def write(emails):
    body = json.dumps({'emails': sorted(set(e.strip().lower() for e in emails if e.strip()))}).encode()
    req = urllib.request.Request(f'{SB}/storage/v1/object/{OBJ}', data=body, method='PUT',
        headers={'apikey': SK, 'Authorization': f'Bearer {SK}', 'Content-Type': 'application/json', 'x-upsert': 'true'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
cur = read()
if cmd == 'list':
    print(json.dumps(cur))
elif cmd == 'add':
    cur.append(sys.argv[2].lower()); print('HTTP', write(cur), '->', read())
elif cmd == 'remove':
    cur = [e for e in cur if e != sys.argv[2].lower()]; print('HTTP', write(cur), '->', read())
elif cmd == 'set':
    print('HTTP', write(sys.argv[2].split(',')), '->', read())
else:
    print('unknown cmd'); sys.exit(1)
