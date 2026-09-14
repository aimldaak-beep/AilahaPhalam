# Backup — live DB before the stamp-window fixes (2026-09-14T1131Z_pre_stamp_window · 2026-09-14 Mon 17:01 IST)
Full dumps BEFORE the change (trades 20 rows = 19 trades + retired fx_weekly_rates doc row / weekly_marks 5 / user_settings 1)
+ realized_before_old_engine.txt (engine at 853bba4: per-trade realized or live MTM, total ₹20,06,018).
Law: DELETE NOTHING; the 3 live trades (GIFT NIFTY 7-Sep, TATAELXSI 9-Sep, NIKKEI Sun 13-Sep) and all closed history intact.
Gate: scripts/reconcile_backup.ts <live_dump.json> archive/2026-09-14T1131Z_pre_stamp_window strict → IDENTICAL.
Taken with scripts/backup_db.py + scripts/dump_realized.ts.
