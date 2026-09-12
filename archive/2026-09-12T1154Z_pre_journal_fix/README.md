# Backup — live DB before the journal-logic fix + weekly close-stamp button + Saturday alert (2026-09-12T1154Z)
Full dumps BEFORE the change (trades / weekly_marks / user_settings) + realized_before_old_engine.txt (engine at fec4c04).
Law: DELETE NOTHING; the 2 live trades (TATAELXSI 9-Sep, GIFTNIFTY 7-Sep) and all closed history intact.
Gate: scripts/reconcile_backup.ts <live_dump.json> archive/2026-09-12T1154Z_pre_journal_fix strict → IDENTICAL.
