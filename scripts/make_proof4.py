#!/usr/bin/env python3
import base64, pathlib
S = pathlib.Path('/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad')
def uri(p): return 'data:image/png;base64,' + base64.b64encode(pathlib.Path(p).read_bytes()).decode()
E = S / 'edit-shots'
SHOTS = [
    (E/'01-live-edit-allfields.png', 'Live Edit — every field', 'Symbol · Instrument (dropdown, re-auto-fills multiplier) · Side · Lots · Entry · Init date · Currency · Realization · Entry brokerage — inline in the grid cells; weekly ledger preserved below.'),
    (E/'02-edit-confirm.png', 'Instrument change → one confirm', '“Recomputes all P&L for this trade — proceed?” before saving.'),
    (E/'03-after-live-edit.png', 'MTM chain recomputes', 'After Proceed: total = +₹16,92,604 — matches the independent hand-calc under NASDAQ ×20, 5 lots, entry 25,000.'),
    (E/'04-closed-edit-allfields.png', 'Closed Edit — all fields + exit/closed-date', 'Everything above PLUS Exit price · Exit brokerage · Closed date, in an expanded grid row.'),
    (E/'05-journal-W35.png', 'Closed date moved → journal re-files', 'Closed date 23→25 Aug moves the trade from the W34 chapter to W35; held-days 12→14.'),
    (E/'07-theme-forest.png', 'Both themes', 'Forest and White both render the full-field grids.'),
]
cards = "\n".join(f'''<figure class="shot"><img loading="lazy" src="{uri(p)}" alt="{t}">
  <figcaption><span class="st">{t}</span><span class="sd">{d}</span></figcaption></figure>''' for p,t,d in SHOTS)

HTML = f'''<title>Full Edit Law Proof</title>
<style>
:root {{ --bg:#f7f6f2; --panel:#fff; --ink:#17181a; --faint:#6d726c; --hair:#e2e1db; --gold:#b8892a; --good:#0a7d4f; --shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px rgba(0,0,0,.06); }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#121712; --panel:#1a201a; --ink:#e9ede7; --faint:#8fa284; --hair:#2b3421; --gold:#efc44f; --good:#7fb79a; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.5); }} }}
:root[data-theme="dark"] {{ --bg:#121712; --panel:#1a201a; --ink:#e9ede7; --faint:#8fa284; --hair:#2b3421; --gold:#efc44f; --good:#7fb79a; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.5); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; -webkit-font-smoothing:antialiased; }}
.wrap {{ max-width:1120px; margin:0 auto; padding:56px 24px 96px; }}
.eyebrow {{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); font-weight:700; }}
h1 {{ font-size:clamp(26px,4vw,40px); margin:.25em 0 .1em; }} .sub {{ color:var(--faint); font-size:15px; max-width:72ch; }}
.meta {{ display:flex; flex-wrap:wrap; gap:8px 10px; margin:20px 0 4px; }}
.chip {{ font-size:12px; padding:4px 11px; border:1px solid var(--hair); border-radius:999px; color:var(--faint); background:var(--panel); }} .chip b {{ color:var(--ink); font-weight:600; }} .chip.ok {{ color:var(--good); }}
h2 {{ font-size:20px; margin:46px 0 6px; }} .lead {{ color:var(--faint); font-size:14.5px; max-width:74ch; margin-bottom:14px; }}
.rules {{ background:var(--panel); border:1px solid var(--hair); border-left:3px solid var(--good); border-radius:10px; padding:16px 18px; box-shadow:var(--shadow); font-size:14px; }}
.rules li {{ margin:5px 0; }} .mono {{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:8px; }}
@media (max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} }}
.shot img {{ width:100%; height:auto; border:1px solid var(--hair); border-radius:10px; box-shadow:var(--shadow); background:#000; }}
.shot figcaption {{ margin-top:8px; display:flex; flex-direction:column; gap:2px; }} .st {{ font-weight:600; font-size:14.5px; }} .sd {{ color:var(--faint); font-size:12.5px; }}
footer {{ margin-top:52px; padding-top:20px; border-top:1px solid var(--hair); color:var(--faint); font-size:12.5px; }}
</style>
<div class="wrap">
  <div class="eyebrow">Full edit law · verified on the live URL</div>
  <h1>Edit Opens Every Field</h1>
  <p class="sub">Both panels, PIN-gated, inside the grid cells from the layout pass. Verified headless on
     <span class="mono">ailaha-phalam.vercel.app</span>, both themes.</p>
  <div class="meta">
    <span class="chip">bundle <b>index-CB6BIhok.js</b></span>
    <span class="chip">commit <b>6f6cd57</b></span>
    <span class="chip ok">smoke ✓ 6/6</span>
    <span class="chip ok">MTM hand-verified · +₹16,92,604</span>
  </div>

  <h2>The law</h2>
  <div class="rules"><ul style="margin:0;padding-left:18px">
    <li><b>Live Edit</b> — all initiation fields: symbol · instrument (dropdown, re-auto-fills multiplier) · side · lots · entry · init date · currency · realization · entry-leg brokerage. Save recomputes the whole weekly MTM chain (multiplier, rate-usage, realization).</li>
    <li><b>Closed Edit</b> — everything above PLUS exit price · exit-leg brokerage · closed date. Save recomputes realized P&L + held-days and re-files the trade into the correct journal week (journal = closing-date law).</li>
    <li>One Save commits all changed fields <b>atomically</b>; Esc cancels.</li>
    <li>Instrument or currency change → one confirm line before saving.</li>
    <li>Week-identity integrity: weekly marks earlier than the (new) initiation week are removed on save, noted in the confirm.</li>
    <li>PIN gates every edit (set-on-first-use, unlocked for the session).</li>
  </ul></div>

  <h2>Live evidence</h2>
  <p class="lead">Edit a live trade's instrument + lots + entry → MTM recomputes to the hand-verified figure; move a closed
     trade's closed date across a week boundary → it re-files to the right journal week and held-days updates.</p>
  <div class="grid">{cards}</div>

  <footer>The recomputed +₹16,92,604 equals an independent per-week calculation: W33 net (entry-leg brokerage) +
    W34 net, at NASDAQ ×20, 5 lots, entry 25,000, 0.8 realization. Test user RLS-scoped and deleted after; the 3 real
    AKS trades were untouched.</footer>
</div>
'''
out = S / 'proof4.html'; out.write_text(HTML); print('wrote', out, len(HTML), 'bytes')
