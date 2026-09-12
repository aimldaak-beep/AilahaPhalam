# Backup — live DB before the Closed-trades-grouped-by-week change (2026-09-12T1049Z)
Display/grouping change only: no trade record, stamp, rate or P&L may change. trades.json / weekly_marks.json /
user_settings.json = full dumps BEFORE the change; realized_before_old_engine.txt = realized()/liveMtm() per trade by
the engine at commit 02a71e3. Gate: scripts/reconcile_backup.ts <live_dump.json> archive/2026-09-12T1049Z_pre_closed_grouping → IDENTICAL (no allowed field changes).
