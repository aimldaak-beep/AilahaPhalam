#!/usr/bin/env python3
import base64, pathlib
S = pathlib.Path('/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad')
def uri(p): return 'data:image/png;base64,' + base64.b64encode(pathlib.Path(p).read_bytes()).decode()
M = S / 'mult-shots'
SHOTS = [
    (M/'02-add-nsefut-form.png', 'Add NSE FUT — editable multiplier, blank on select', 'Multiplier · lot size is an editable input; NSE FUT (INR) leaves it blank so you enter the script size (here 175 for TCS).'),
    (M/'01-seeded-nsefut.png', 'NSE FUT MTM uses the stored ×250', 'RELIANCE-SEED ×250 → MTM +₹12,395, hand-verified from the per-trade multiplier.'),
    (M/'03-whatif-mult.png', 'What-if respects the stored multiplier', 'RELIANCE-SEED what-if exit 1500 → +₹24,783 (computed with ×250, not any instrument default).'),
    (M/'04-after-mult-edit.png', 'Edit multiplier 75→150 → chain recomputes', 'NIFTY-EDIT MTM moves +₹73,920 → +₹1,47,840 when the multiplier doubles.'),
    (M/'06-theme-white.png', 'White theme', 'Both themes render the editable-multiplier forms and columns.'),
]
cards = "\n".join(f'''<figure class="shot"><img loading="lazy" src="{uri(p)}" alt="{t}">
  <figcaption><span class="st">{t}</span><span class="sd">{d}</span></figcaption></figure>''' for p,t,d in SHOTS)
HTML = f'''<title>Editable Multiplier Proof</title>
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
  <div class="eyebrow">Per-trade multiplier · verified on the live URL</div>
  <h1>Editable Multiplier + NSE FUT</h1>
  <p class="sub">The multiplier is a per-trade editable value again (v1 behavior); the engine computes from
     the stored value everywhere. Verified headless on <span class="mono">ailaha-phalam.vercel.app</span>, both themes.</p>
  <div class="meta">
    <span class="chip">bundle <b>index-BQkYopfb.js</b></span>
    <span class="chip">commit <b>04cc4f1</b></span>
    <span class="chip ok">smoke ✓ 5/5</span>
    <span class="chip ok">MTM/what-if hand-verified</span>
  </div>
  <h2>What changed</h2>
  <div class="rules"><ul style="margin:0;padding-left:18px">
    <li><b>Multiplier is editable</b> in Add Trade — auto-filled on instrument change, user-overridable, validated &gt; 0.</li>
    <li><b>NSE FUT</b> — new INR-native instrument; multiplier <b>blank on select</b> so you enter the script's lot size (RELIANCE 250, TCS 175). Brokerage = 0.0003 × turnover.</li>
    <li>The trade <b>stores its own multiplier</b>; MTM, realized, what-if, brokerage, meta, tables and CSV all read the stored per-trade value — the instrument map is only a form default.</li>
    <li>Multiplier is <b>editable in full-Edit</b> on live and closed trades (PIN-gated); saving recomputes the whole chain.</li>
    <li>Journal meta, the Closed table's <b>Mult</b> column, and the CSV <b>Multiplier</b> column all show it.</li>
  </ul></div>
  <h2>Live evidence</h2>
  <p class="lead">Add an NSE FUT with a custom multiplier, verify MTM + what-if use the stored value, and edit an
     existing NIFTY FUT trade's multiplier so the chain recomputes.</p>
  <div class="grid">{cards}</div>
  <footer>Hand-verified: NSE FUT ×250 MTM +₹12,395 = (1450−1400)×250 − 0.0003·turnover; what-if exit 1500 +₹24,783
    nets both legs; NIFTY ×150 = (24500−24000)×150×2 − brokerage. Test user RLS-scoped and deleted; the 3 real AKS trades untouched.</footer>
</div>
'''
out = S / 'proof5.html'; out.write_text(HTML); print('wrote', out, len(HTML), 'bytes')
