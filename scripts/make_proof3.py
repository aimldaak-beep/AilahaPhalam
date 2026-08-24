#!/usr/bin/env python3
import base64, pathlib
S = pathlib.Path('/tmp/claude-1000/-mnt-c-WINDOWS-system32/8b009f8e-8382-4f2b-96a9-9d6c44db17a1/scratchpad')
def uri(p): return 'data:image/png;base64,' + base64.b64encode(pathlib.Path(p).read_bytes()).decode()
G = S / 'grid-shots'
SHOTS = [
    (G/'grid-1280-forest.png', '1280px · Forest', '3 cards, wildly different meta lengths — ENTRY, P&L and actions align to the pixel.'),
    (G/'grid-1280-white.png', '1280px · White', 'Same alignment, green/red P&L; Delete in loss red.'),
    (G/'grid-1600-forest.png', '1600px · Forest', 'The column uses the extra width; every value keeps its fixed place.'),
    (G/'grid-1600-white.png', '1600px · White', 'Long symbol ellipsis-guarded; zone tracks unchanged.'),
]
MEAS = [
    ('1280 · Forest', '70 / 70 / 70', '0.0', '0.0', '0.0', 'none'),
    ('1280 · White', '70 / 70 / 70', '0.0', '0.0', '0.0', 'none'),
    ('1600 · Forest', '230 / 230 / 230', '0.0', '0.0', '0.0', 'none'),
    ('1600 · White', '230 / 230 / 230', '0.0', '0.0', '0.0', 'none'),
]
mrows = "\n".join(f'<tr><td>{a}</td><td class="mono">{b}</td><td class="mono">{c}</td><td class="mono">{d}</td><td class="mono">{e}</td><td class="mono">{f}</td></tr>' for a,b,c,d,e,f in MEAS)
cards = "\n".join(f'''<figure class="shot"><img loading="lazy" src="{uri(p)}" alt="{t}">
  <figcaption><span class="st">{t}</span><span class="sd">{d}</span></figcaption></figure>''' for p,t,d in SHOTS)

HTML = f'''<title>Layout System Proof</title>
<style>
:root {{ --bg:#f7f6f2; --panel:#fff; --ink:#17181a; --faint:#6d726c; --hair:#e2e1db; --gold:#b8892a; --good:#0a7d4f; --shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px rgba(0,0,0,.06); }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#121712; --panel:#1a201a; --ink:#e9ede7; --faint:#8fa284; --hair:#2b3421; --gold:#efc44f; --good:#7fb79a; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.5); }} }}
:root[data-theme="dark"] {{ --bg:#121712; --panel:#1a201a; --ink:#e9ede7; --faint:#8fa284; --hair:#2b3421; --gold:#efc44f; --good:#7fb79a; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.5); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.55; -webkit-font-smoothing:antialiased; }}
.wrap {{ max-width:1120px; margin:0 auto; padding:56px 24px 96px; }}
.eyebrow {{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); font-weight:700; }}
h1 {{ font-size:clamp(26px,4vw,40px); margin:.25em 0 .1em; letter-spacing:-.01em; }}
.sub {{ color:var(--faint); font-size:15px; max-width:72ch; }}
.meta {{ display:flex; flex-wrap:wrap; gap:8px 10px; margin:20px 0 4px; }}
.chip {{ font-size:12px; padding:4px 11px; border:1px solid var(--hair); border-radius:999px; color:var(--faint); background:var(--panel); }} .chip b {{ color:var(--ink); font-weight:600; }} .chip.ok {{ color:var(--good); }}
h2 {{ font-size:20px; margin:48px 0 6px; }} .lead {{ color:var(--faint); font-size:14.5px; max-width:74ch; margin-bottom:14px; }}
.zones {{ background:var(--panel); border:1px solid var(--hair); border-left:3px solid var(--good); border-radius:10px; padding:16px 18px; box-shadow:var(--shadow); font-size:14px; }}
.zones code {{ font-family:ui-monospace,monospace; font-size:.9em; color:var(--gold); }}
.tbl-scroll {{ overflow-x:auto; border:1px solid var(--hair); border-radius:12px; box-shadow:var(--shadow); background:var(--panel); margin-top:8px; }}
table {{ border-collapse:collapse; width:100%; min-width:640px; font-size:13px; }}
th {{ text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); font-weight:600; padding:12px 14px; border-bottom:1px solid var(--hair); }}
td {{ padding:10px 14px; border-bottom:1px solid var(--hair); }} tr:last-child td {{ border-bottom:none; }}
.mono {{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:8px; }}
@media (max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} }}
.shot img {{ width:100%; height:auto; border:1px solid var(--hair); border-radius:10px; box-shadow:var(--shadow); background:#000; }}
.shot figcaption {{ margin-top:8px; display:flex; flex-direction:column; gap:2px; }}
.st {{ font-weight:600; font-size:14.5px; }} .sd {{ color:var(--faint); font-size:12.5px; }}
footer {{ margin-top:52px; padding-top:20px; border-top:1px solid var(--hair); color:var(--faint); font-size:12.5px; }}
</style>
<div class="wrap">
  <div class="eyebrow">Layout system pass · verified on the live URL</div>
  <h1>Fixed Invisible Grid</h1>
  <p class="sub">Flex-wrap anatomy replaced by a CSS grid: every value gets a fixed PLACE, identical across all
     trades. No visible gridlines. Verified headless on <span class="mono">ailaha-phalam.vercel.app</span> at
     1280px and 1600px, both themes, with 3 dummy trades of wildly different meta lengths (now removed).</p>
  <div class="meta">
    <span class="chip">bundle <b>index-8_qAa7GG.js</b></span>
    <span class="chip">commit <b>04a849e</b></span>
    <span class="chip">column <b>1140px</b> content-box</span>
    <span class="chip ok">smoke ✓ 20/20</span>
  </div>

  <h2>The card = three fixed zones</h2>
  <div class="zones">
    <b>Zone 1 — identity</b> · <code>grid 200px | 1fr | 380px</code> — SYMBOL (20/600) · meta (15 faint/sage) ·
      four uniform 84px ghost actions <code>What-if · Edit · Close · Delete</code>, never wrapping, never moving.<br><br>
    <b>Zone 2 — numbers</b> · <code>grid repeat(4, 220px)</code> — labeled slots, tiny uppercase label over mono
      value: ENTRY · BROKERAGE (entry leg, legacy formula, $/₹) · CURRENT P&amp;L (22/600, profit/loss) · CLOSED VALUE.<br><br>
    <b>Zone 3 — weekly ledger</b> · indent 200 · <code>grid 160 | 150 | 100 | 150</code> — every week row column-perfect.<br><br>
    What-if / Edit / inline-close / exit inputs open INSIDE the grid cells — the card grows, columns never move.
    Journal rows share the discipline (<code>30 | 200 | 130 | 130 | 90 | 1fr | 150</code>); week-close panel on the 220px rhythm.
  </div>

  <h2>Alignment — measured (bounding-box x, 3 cards)</h2>
  <p class="lead">Pixel-x of the ENTRY value and the pinned buttons, across all three cards. A spread of 0.0px means
     perfect column alignment regardless of meta length.</p>
  <div class="tbl-scroll"><table>
    <thead><tr><th>Viewport · theme</th><th>ENTRY x (3 cards)</th><th>ENTRY spread</th><th>P&amp;L spread</th><th>What-if spread</th><th>H-overflow</th></tr></thead>
    <tbody>{mrows}</tbody>
  </table></div>

  <h2>Screenshots (live URL)</h2>
  <div class="grid">{cards}</div>

  <footer>Grid tracks are identical on every card, so ENTRY sits under ENTRY and P&amp;L under P&amp;L no matter how
    long the meta line is. Long symbols ellipsis-guard in the fixed 200px identity cell. Test user RLS-scoped and
    deleted after; the 3 real AKS trades were untouched.</footer>
</div>
'''
out = S / 'proof3.html'; out.write_text(HTML); print('wrote', out, len(HTML), 'bytes')
