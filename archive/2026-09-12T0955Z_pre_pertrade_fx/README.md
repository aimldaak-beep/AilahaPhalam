# Backup — live DB before the per-trade FX + weekly-journal change (2026-09-12)
- trades.json: FULL public.trades dump taken 2026-09-12 09:55 UTC, BEFORE any code or data change (19 rows: 18 trades + the fx_weekly_rates store row, owner d0758d86).
- realized_before_old_engine.txt: realized()/liveMtm() of every trade computed by the PRE-CHANGE engine (commit 95b0ee8) on this dump — the reconciliation reference.
- weekly_marks.json / user_settings.json: dumped at 10:30 UTC; neither table was written by the migration (scripts/migrate_per_trade_fx.py PATCHes trades.data only) and the smoke users' rows were deleted.
Reconciliation: scripts/reconcile_backup.ts (trades field diff, close stamps, weekly_marks, closed P&Ls, weekly totals). Ship gate: identical.
