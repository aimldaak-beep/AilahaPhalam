import { useState, useMemo } from "react";

/* ————————————————————————————————————————————————
   AILAHA PHALAM v2.6 — weekly clubbing + selection everywhere + Excel download suite
   WHITE  : green profit · red loss
   FOREST : flat gold profit · neutral grey loss
            secondary text = sage (never the loss grey)
   Theme switcher lives in the nav, after Add trade.
———————————————————————————————————————————————— */

const THEMES = {
  white: {
    name: "White", bg: "#FFFFFF", ink: "#17181A", faint: "#878B87", hair: "#E7E8E5",
    profit: "#0A7D4F", loss: "#C2402E", swatch: "#FFFFFF",
  },
  forest: {
    name: "Forest", bg: "#121712", ink: "#E9EDE7", faint: "#8FA284", hair: "#27301F",
    profit: "#EFC44F", loss: "#ABB0AA", swatch: "#121712",
  },
};

const INSTR = {
  DOW: { mult: 5, ccy: "USD" }, NASDAQ: { mult: 20, ccy: "USD" }, SNP: { mult: 50, ccy: "USD" },
  NIKKEI: { mult: 100, ccy: "USD" }, GIFTNIFTY: { mult: 50, ccy: "USD" }, "NIFTY FUT": { mult: 75, ccy: "INR" },
};

const inr = (v) => "₹" + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const signed = (v) => (v >= 0 ? "+" : "−") + inr(v);
const nf = (v) => (+v).toLocaleString("en-IN");
const WEEKS = { 33: "W33 · 10–16 Aug", 34: "W34 · 17–23 Aug", 35: "W35 · 24–30 Aug" };
const CUR_WEEK = 35;
const dayOf = (d) => parseInt(d);            /* demo: all dates in Aug */
const weekOf = (d) => { const n = dayOf(d); return n >= 24 ? 35 : n >= 17 ? 34 : n >= 10 ? 33 : 32; };
const heldDays = (o, c) => Math.max(dayOf(c) - dayOf(o), 0);
const SZ = { hero: 58, big: 46, num: 17, numSm: 15, meta: 13, label: 12, btn: 14, symbol: 18 };

export default function AilahaPhalam() {
  const [themeKey, setThemeKey] = useState("forest");
  const t = THEMES[themeKey];
  const [view, setView] = useState("live");
  const [rates, setRates] = useState({ 33: 83.1, 34: 83.24 });
  const [rateEdit, setRateEdit] = useState(null);
  const [live, setLive] = useState([
    { id: 1, opened: "11 Aug", sym: "GIFTNIFTY", instr: "GIFTNIFTY", side: "LONG", qty: 2, entry: 25180, real: 0.8,
      weeks: [{ w: 33, close: 25342 }, { w: 34, close: 25255 }] },
    { id: 2, opened: "18 Aug", sym: "NKD-U26", instr: "NIKKEI", side: "SHORT", qty: 1, entry: 42480, real: 1.0,
      weeks: [{ w: 34, close: 42210 }] },
    { id: 3, opened: "24 Aug", sym: "NIFTY25SEP", instr: "NIFTY FUT", side: "LONG", qty: 4, entry: 24880, real: 0.8, weeks: [] },
  ]);
  const [closed, setClosed] = useState([
    { id: 11, opened: "11 Aug", closedOn: "21 Aug", sym: "NQ-U26", instr: "NASDAQ", side: "LONG", qty: 3, entry: 23890, exit: 24012, real: 0.8, rateW: 34 },
    { id: 12, opened: "18 Aug", closedOn: "20 Aug", sym: "ES-U26", instr: "SNP", side: "SHORT", qty: 2, entry: 6488, exit: 6451, real: 1.0, rateW: 34 },
    { id: 13, opened: "07 Aug", closedOn: "14 Aug", sym: "GIFTNIFTY", instr: "GIFTNIFTY", side: "LONG", qty: 1, entry: 24980, exit: 25162, real: 0.8, rateW: 33 },
    { id: 14, opened: "05 Aug", closedOn: "12 Aug", sym: "NIFTY25AUG", instr: "NIFTY FUT", side: "LONG", qty: 2, entry: 24610, exit: 24548, real: 1.0, rateW: 33 },
  ]);
  const [sel, setSel] = useState([]);
  const [satOpen, setSatOpen] = useState(true);
  const [satVals, setSatVals] = useState({});
  const [satRate, setSatRate] = useState("83.24");
  const [closing, setClosing] = useState(null);
  const [pinOk, setPinOk] = useState(false);
  const [pinAsk, setPinAsk] = useState(null);
  const [pinVal, setPinVal] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlMode, setDlMode] = useState("all");           /* all | selected | range */
  const [dlFrom, setDlFrom] = useState("10");
  const [dlTo, setDlTo] = useState("30");
  const [form, setForm] = useState({ sym: "", instr: "DOW", side: "LONG", qty: "1", price: "", date: "24-08-2026", ccy: "USD", real: 0.8, brok: "" });

  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontVariantNumeric: "tabular-nums" };
  const sans = { fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" };
  const pl = (v) => (v >= 0 ? t.profit : t.loss);

  const fxOf = (instr, w) => (INSTR[instr].ccy === "USD" ? (rates[w] ?? rates[CUR_WEEK - 1] ?? 83.24) : 1);
  const dir = (s) => (s === "LONG" ? 1 : -1);
  const conv = (pts, tr, w) => Math.round(pts * INSTR[tr.instr].mult * tr.qty * fxOf(tr.instr, w) * tr.real);
  const mtmRows = (tr) => { const rows = []; let ref = tr.entry;
    for (const wk of tr.weeks) { rows.push({ w: wk.w, close: wk.close, val: conv((wk.close - ref) * dir(tr.side), tr, wk.w) }); ref = wk.close; }
    return rows; };
  const liveMtm = (tr) => mtmRows(tr).reduce((s, r) => s + r.val, 0);
  const totalLive = useMemo(() => live.reduce((s, tr) => s + liveMtm(tr), 0), [live, rates]);
  const realized = (tr) => conv((tr.exit - tr.entry) * dir(tr.side), tr, tr.rateW);
  const totalClosed = useMemo(() => closed.reduce((s, tr) => s + realized(tr), 0), [closed, rates]);
  const selSum = useMemo(() => closed.filter((tr) => sel.includes(tr.id)).reduce((s, tr) => s + realized(tr), 0), [sel, closed, rates]);

  const saveSaturday = () => {
    if (satRate) setRates((r) => ({ ...r, [CUR_WEEK]: +satRate }));
    setLive((p) => p.map((tr) => satVals[tr.id] ? { ...tr, weeks: [...tr.weeks, { w: CUR_WEEK, close: +satVals[tr.id] }] } : tr));
    setSatVals({}); setSatOpen(false);
  };
  const closeTrade = () => {
    const tr = live.find((x) => x.id === closing.id);
    if (!tr || !closing.px) return;
    setClosed((p) => [{ ...tr, exit: +closing.px, closedOn: "24 Aug", rateW: CUR_WEEK }, ...p]);
    setLive((p) => p.filter((x) => x.id !== closing.id)); setClosing(null);
  };
  const deploy = () => {
    if (!form.sym || !form.price) return;
    setLive((p) => [...p, { id: Date.now(), opened: "24 Aug", sym: form.sym.toUpperCase(), instr: form.instr, side: form.side, qty: +form.qty || 1, entry: +form.price, real: form.ccy === "INR" ? 1.0 : form.real, weeks: [] }]);
    setForm({ ...form, sym: "", price: "" }); setView("live");
  };
  const askPin = (action, id) => { setPinAsk({ action, id }); setPinVal(""); };
  const proceed = (ask) => {
    if (ask.action === "edit") { const tr = closed.find((x) => x.id === ask.id); setEditRow({ id: ask.id, exit: String(tr.exit) }); }
    else { setClosed((p) => p.filter((x) => x.id !== ask.id)); setSel((s) => s.filter((i) => i !== ask.id)); }
  };
  const submitPin = () => { if (pinVal.length >= 4) { setPinOk(true); proceed(pinAsk); setPinAsk(null); } };
  const act = (action, id) => { pinOk ? proceed({ action, id }) : askPin(action, id); };
  const saveEdit = () => { setClosed((p) => p.map((x) => (x.id === editRow.id ? { ...x, exit: +editRow.exit } : x))); setEditRow(null); };

  const downloadExcel = () => {
    let rows = closed;
    if (dlMode === "selected") rows = closed.filter((tr) => sel.includes(tr.id));
    if (dlMode === "range") rows = closed.filter((tr) => dayOf(tr.closedOn) >= +dlFrom && dayOf(tr.closedOn) <= +dlTo);
    if (!rows.length) return;
    const head = ["Symbol","Instrument","Side","Lots","Entry","Exit","Initiated","Closed","Held (days)","Week","Currency","Share","P&L (INR)"];
    const lines = rows.map((tr) => [
      tr.sym, tr.instr, tr.side, tr.qty, tr.entry, tr.exit, tr.opened, tr.closedOn,
      heldDays(tr.opened, tr.closedOn), (WEEKS[weekOf(tr.closedOn)] || ""), INSTR[tr.instr].ccy,
      (tr.real * 100) + "%", realized(tr),
    ].join(","));
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ailaha_phalam_trades_" + dlMode + ".csv";
    a.click(); URL.revokeObjectURL(a.href);
    setDlOpen(false);
  };

  const DownloadPanel = () => (
    <span style={{ position: "relative" }}>
      <button onClick={() => setDlOpen(!dlOpen)}
        style={{ ...sans, fontSize: 13, fontWeight: 600, color: t.ink, background: "none", border: "1px solid " + t.hair, borderRadius: 3, padding: "6px 14px", cursor: "pointer" }}>
        Download as Excel
      </button>
      {dlOpen && (
        <span style={{ position: "absolute", right: 0, top: 38, zIndex: 5, background: t.bg, border: "1px solid " + t.hair, borderRadius: 5, padding: "16px 18px", width: 270, display: "block", boxShadow: "0 8px 28px rgba(0,0,0,0.28)" }}>
          {[
            { k: "all", label: "Complete history (" + closed.length + " trades)" },
            { k: "selected", label: "Selected trades (" + sel.length + ")" },
            { k: "range", label: "Date range" },
          ].map((o) => (
            <span key={o.k} onClick={() => setDlMode(o.k)}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", cursor: "pointer" }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid " + (dlMode === o.k ? t.ink : t.hair), background: dlMode === o.k ? t.ink : "none", display: "inline-block" }} />
              <span style={{ fontSize: 14, color: dlMode === o.k ? t.ink : t.faint }}>{o.label}</span>
            </span>
          ))}
          {dlMode === "range" && (
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", margin: "8px 0 4px 24px" }}>
              <input value={dlFrom} onChange={(e) => setDlFrom(e.target.value.replace(/\D/g, ""))}
                style={{ ...mono, fontSize: 15, width: 40, border: "none", borderBottom: "1px solid " + t.hair, outline: "none", background: "none", color: t.ink, textAlign: "center" }} />
              <span style={{ fontSize: 13, color: t.faint }}>to</span>
              <input value={dlTo} onChange={(e) => setDlTo(e.target.value.replace(/\D/g, ""))}
                style={{ ...mono, fontSize: 15, width: 40, border: "none", borderBottom: "1px solid " + t.hair, outline: "none", background: "none", color: t.ink, textAlign: "center" }} />
              <span style={{ fontSize: 13, color: t.faint }}>Aug</span>
            </span>
          )}
          <button onClick={downloadExcel}
            disabled={dlMode === "selected" && sel.length === 0}
            style={{ ...sans, marginTop: 12, width: "100%", fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "9px 0", cursor: "pointer", opacity: dlMode === "selected" && sel.length === 0 ? 0.45 : 1 }}>
            Download
          </button>
        </span>
      )}
    </span>
  );

  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)} style={{ ...sans, background: "none", border: "none", cursor: "pointer",
      fontSize: 14, padding: "6px 2px", color: view === id ? t.ink : t.faint,
      borderBottom: view === id ? ("1px solid " + t.ink) : "1px solid transparent" }}>{label}</button>
  );
  const th = (h, right) => (
    <th key={h} style={{ ...sans, fontSize: SZ.label, fontWeight: 500, color: t.faint, letterSpacing: "0.05em",
      textTransform: "uppercase", padding: "14px 0 10px", textAlign: right ? "right" : "left", borderBottom: "1px solid " + t.hair }}>{h}</th>
  );
  const td = (extra = {}) => ({ ...mono, fontSize: SZ.num, padding: "15px 0", borderBottom: "1px solid " + t.hair, ...extra });
  const lbl = { ...sans, fontSize: SZ.label, fontWeight: 500, color: t.faint, letterSpacing: "0.05em", textTransform: "uppercase", display: "block", marginBottom: 6 };
  const inp = { ...mono, fontSize: SZ.num, border: "none", borderBottom: "1px solid " + t.hair, outline: "none", background: "none", color: t.ink, padding: "6px 0", width: "100%" };
  const toggle = (on) => ({ ...sans, fontSize: SZ.btn - 1, fontWeight: 600, padding: "8px 15px", borderRadius: 3, cursor: "pointer",
    border: "1px solid " + (on ? t.ink : t.hair), background: on ? t.ink : "none", color: on ? t.bg : t.faint });
  const ghost = { ...sans, fontSize: 13, color: t.faint, background: "none", border: "1px solid " + t.hair, borderRadius: 3, padding: "5px 12px", cursor: "pointer" };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.ink, ...sans, transition: "background 180ms, color 180ms" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>

        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 48 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.06em" }}>AILAHA PHALAM</div>
            <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 2 }}>Monday 24 August 2026 · {WEEKS[CUR_WEEK]}</div>
          </div>
          <nav style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <Tab id="live" label="Live trades" />
            <Tab id="journal" label="Journal" />
            <Tab id="closedv" label="Closed trades" />
            <Tab id="add" label="Add trade" />
            {/* THEME — after Add trade */}
            <span style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6 }}>
              <span style={{ fontSize: SZ.label, color: t.faint, letterSpacing: "0.05em", textTransform: "uppercase" }}>Theme</span>
              {Object.entries(THEMES).map(([k, th2]) => (
                <button key={k} onClick={() => setThemeKey(k)} title={th2.name}
                  style={{ width: 22, height: 22, borderRadius: "50%", cursor: "pointer", background: th2.swatch,
                    border: "2px solid " + (themeKey === k ? t.ink : t.hair) }} />
              ))}
            </span>
          </nav>
        </header>

        {/* PIN modal */}
        {pinAsk && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <div style={{ background: t.bg, borderRadius: 6, padding: "26px 30px", width: 320, border: "1px solid " + t.hair }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Enter PIN</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4 }}>
                {pinAsk.action === "delete" ? "Deleting a closed trade." : "Editing a closed trade."} Demo accepts any 4+ digits — the real PIN is set at deploy.
              </div>
              <input autoFocus type="password" inputMode="numeric" value={pinVal}
                onChange={(e) => setPinVal(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submitPin()}
                style={{ ...mono, fontSize: 22, letterSpacing: "0.4em", width: "100%", marginTop: 18, border: "none", borderBottom: "1px solid " + t.ink, outline: "none", background: "none", color: t.ink, textAlign: "center", padding: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 22 }}>
                <button onClick={() => setPinAsk(null)} style={{ ...sans, fontSize: 13, color: t.faint, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                <button onClick={submitPin} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "8px 18px", cursor: "pointer" }}>Unlock</button>
              </div>
            </div>
          </div>
        )}

        {/* ————— LIVE ————— */}
        {view === "live" && (
          <>
            {satOpen && live.length > 0 && (
              <div style={{ border: "1px solid " + t.ink, borderRadius: 4, padding: "18px 20px", marginBottom: 40 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Week close — {WEEKS[CUR_WEEK]}</div>
                <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 4, marginBottom: 14 }}>Asked every Saturday evening. Closing values stamp the week's MTM.</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "7px 0", borderBottom: "1px solid " + t.hair, marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, width: 140 }}>USD / INR</span>
                  <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>last week {rates[CUR_WEEK - 1]}</span>
                  <input value={satRate} onChange={(e) => setSatRate(e.target.value.replace(/[^\d.]/g, ""))}
                    style={{ ...mono, fontSize: SZ.num, border: "none", borderBottom: "1px solid " + t.hair, outline: "none", background: "none", color: t.ink, width: 100 }} />
                </div>
                {live.map((tr) => (
                  <div key={tr.id} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "7px 0" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, width: 140 }}>{tr.sym}</span>
                    <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>last {nf(tr.weeks.length ? tr.weeks[tr.weeks.length - 1].close : tr.entry)}</span>
                    <input placeholder="closing value" value={satVals[tr.id] || ""}
                      onChange={(e) => setSatVals({ ...satVals, [tr.id]: e.target.value.replace(/[^\d.]/g, "") })}
                      style={{ ...mono, fontSize: SZ.num, border: "none", borderBottom: "1px solid " + t.hair, outline: "none", background: "none", color: t.ink, width: 130 }} />
                  </div>
                ))}
                <div style={{ marginTop: 16, display: "flex", gap: 16 }}>
                  <button onClick={saveSaturday} style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "9px 20px", cursor: "pointer" }}>Save week close</button>
                  <button onClick={() => setSatOpen(false)} style={{ ...sans, fontSize: SZ.btn, color: t.faint, background: "none", border: "none", cursor: "pointer" }}>Later</button>
                </div>
              </div>
            )}

            <div style={{ fontSize: SZ.meta, color: t.faint, marginBottom: 8 }}>Open MTM · {live.length} live · after profit share</div>
            <div style={{ ...mono, fontSize: SZ.hero, lineHeight: 1, fontWeight: 500, color: pl(totalLive) }}>{signed(totalLive)}</div>

            <div style={{ height: 1, background: t.hair, margin: "36px 0 0" }} />

            {live.map((tr) => {
              const rows = mtmRows(tr); const m = liveMtm(tr);
              return (
                <div key={tr.id} style={{ borderBottom: "1px solid " + t.hair, padding: "22px 0" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontSize: SZ.symbol, fontWeight: 600 }}>{tr.sym}</span>
                    <span style={{ fontSize: SZ.meta, color: t.faint }}>
                      {tr.instr} ×{INSTR[tr.instr].mult} · {tr.side} · {tr.qty} lot{tr.qty > 1 ? "s" : ""} · {INSTR[tr.instr].ccy} · share {tr.real * 100}% · opened {tr.opened}
                    </span>
                    <span style={{ ...mono, fontSize: SZ.num, color: t.faint }}>entry {nf(tr.entry)}</span>
                    <span style={{ ...mono, fontSize: 20, fontWeight: 600, marginLeft: "auto", color: rows.length ? pl(m) : t.faint }}>{rows.length ? signed(m) : "—"}</span>
                    {closing && closing.id === tr.id ? (
                      <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <input autoFocus placeholder="exit" value={closing.px}
                          onChange={(e) => setClosing({ ...closing, px: e.target.value.replace(/[^\d.]/g, "") })}
                          onKeyDown={(e) => e.key === "Enter" && closeTrade()}
                          style={{ ...mono, fontSize: SZ.num, width: 100, border: "none", borderBottom: "1px solid " + t.ink, outline: "none", background: "none", color: t.ink }} />
                        <button onClick={closeTrade} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "6px 13px", cursor: "pointer" }}>Close</button>
                      </span>
                    ) : (
                      <button onClick={() => setClosing({ id: tr.id, px: "" })} style={ghost}>Close</button>
                    )}
                  </div>

                  {rows.length > 0 ? (
                    <div style={{ marginTop: 15 }}>
                      {rows.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 18, padding: "6px 0", alignItems: "baseline" }}>
                          <span style={{ fontSize: SZ.meta, color: t.faint, width: 140 }}>{WEEKS[r.w]}</span>
                          <span style={{ ...mono, fontSize: SZ.numSm + 1, color: t.faint }}>close {nf(r.close)}</span>
                          {INSTR[tr.instr].ccy === "USD" && (
                            rateEdit === (tr.id + "-" + r.w) ? (
                              <input autoFocus value={rates[r.w]}
                                onChange={(e) => setRates({ ...rates, [r.w]: +e.target.value.replace(/[^\d.]/g, "") || 0 })}
                                onBlur={() => setRateEdit(null)} onKeyDown={(e) => e.key === "Enter" && setRateEdit(null)}
                                style={{ ...mono, fontSize: SZ.numSm, width: 66, border: "none", borderBottom: "1px solid " + t.ink, outline: "none", background: "none", color: t.ink }} />
                            ) : (
                              <button onClick={() => setRateEdit(tr.id + "-" + r.w)} title="Edit this week's USD rate"
                                style={{ ...mono, fontSize: SZ.numSm, color: t.faint, background: "none", border: "none", cursor: "pointer", borderBottom: "1px dashed " + t.hair, padding: 0 }}>
                                @{rates[r.w]}
                              </button>
                            )
                          )}
                          <span style={{ ...mono, fontSize: SZ.num, fontWeight: 500, color: pl(r.val) }}>{signed(r.val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 12 }}>opened this week — first close stamps Saturday</div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ————— JOURNAL — weeks club the closed trades by closing date ————— */}
        {view === "journal" && (() => {
          const byWeek = {};
          closed.forEach((tr) => { const w = weekOf(tr.closedOn); (byWeek[w] = byWeek[w] || []).push(tr); });
          const weeksDesc = Object.keys(byWeek).map(Number).sort((a, b) => b - a);
          return (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: SZ.meta, color: t.faint }}>Journal · realized by closing week · after share</span>
                <DownloadPanel />
              </div>
              <div style={{ ...mono, fontSize: 40, lineHeight: 1, fontWeight: 500, color: pl(totalClosed), marginBottom: 6 }}>{signed(totalClosed)}</div>
              <div style={{ fontSize: SZ.meta, color: t.faint, marginBottom: 20 }}>A trade lives in the week it CLOSED — that is the week its profit belongs to.</div>
              {sel.length > 0 && (
                <div style={{ marginBottom: 24, padding: "13px 17px", border: "1px solid " + t.ink, borderRadius: 4, display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{sel.length} selected</span>
                  <span style={{ ...mono, fontSize: 22, fontWeight: 600, color: pl(selSum) }}>{signed(selSum)}</span>
                  <button onClick={() => setSel([])} style={{ ...sans, marginLeft: "auto", fontSize: 13, color: t.faint, background: "none", border: "none", cursor: "pointer" }}>clear</button>
                </div>
              )}

              {weeksDesc.map((w) => {
                const trs = byWeek[w].slice().sort((a, b) => dayOf(b.closedOn) - dayOf(a.closedOn));
                const wkTotal = trs.reduce((s, tr) => s + realized(tr), 0);
                return (
                  <div key={w} style={{ marginBottom: 34 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 16, paddingBottom: 10, borderBottom: "1px solid " + t.ink }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{WEEKS[w] || ("Week " + w)}</span>
                      <span style={{ fontSize: SZ.meta, color: t.faint }}>{trs.length} trade{trs.length > 1 ? "s" : ""}</span>
                      <span style={{ ...mono, fontSize: 20, fontWeight: 600, marginLeft: "auto", color: pl(wkTotal) }}>{signed(wkTotal)}</span>
                    </div>
                    {trs.map((tr) => {
                      const p = realized(tr); const held = heldDays(tr.opened, tr.closedOn);
                      return (
                        <div key={tr.id} style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "13px 0", borderBottom: "1px solid " + t.hair, flexWrap: "wrap" }}>
                          <span onClick={() => setSel((s) => s.includes(tr.id) ? s.filter((i) => i !== tr.id) : [...s, tr.id])}
                            style={{ display: "inline-block", width: 15, height: 15, borderRadius: 3, cursor: "pointer", alignSelf: "center",
                              border: "1.5px solid " + (sel.includes(tr.id) ? t.ink : t.hair), background: sel.includes(tr.id) ? t.ink : "none" }} />
                          <span style={{ ...sans, fontSize: SZ.num, fontWeight: 600, width: 130 }}>{tr.sym}</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>initiated {tr.opened}</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>closed {tr.closedOn}</span>
                          <span style={{ ...mono, fontSize: SZ.numSm, color: t.faint }}>held {held}d</span>
                          <span style={{ fontSize: SZ.meta, color: t.faint }}>{tr.side} · {tr.qty} lot{tr.qty > 1 ? "s" : ""} · share {tr.real * 100}%</span>
                          <span style={{ ...mono, fontSize: SZ.num, fontWeight: 600, marginLeft: "auto", color: pl(p) }}>{signed(p)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {weeksDesc.length === 0 && <div style={{ fontSize: 14, color: t.faint }}>No closed trades yet — the journal fills as trades close.</div>}
            </>
          );
        })()}

        {/* ————— CLOSED ————— */}
        {view === "closedv" && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: SZ.meta, color: t.faint }}>Realized · {closed.length} trades · after share</span>
              <DownloadPanel />
            </div>
            <div style={{ ...mono, fontSize: SZ.big, lineHeight: 1, fontWeight: 500, color: pl(totalClosed) }}>{signed(totalClosed)}</div>

            {sel.length > 0 && (
              <div style={{ marginTop: 18, padding: "13px 17px", border: "1px solid " + t.ink, borderRadius: 4, display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{sel.length} selected</span>
                <span style={{ ...mono, fontSize: 22, fontWeight: 600, color: pl(selSum) }}>{signed(selSum)}</span>
                <button onClick={() => setSel([])} style={{ ...sans, marginLeft: "auto", fontSize: 13, color: t.faint, background: "none", border: "none", cursor: "pointer" }}>clear</button>
              </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
              <thead><tr>
                <th style={{ borderBottom: "1px solid " + t.hair, width: 36 }} />
                {th("Closed")}{th("Symbol")}{th("Side")}{th("Qty", 1)}{th("Entry", 1)}{th("Exit", 1)}{th("Share", 1)}{th("P&L", 1)}
                <th style={{ borderBottom: "1px solid " + t.hair, width: 110 }} />
              </tr></thead>
              <tbody>
                {closed.map((tr) => {
                  const p = realized(tr); const on = sel.includes(tr.id); const editing = editRow && editRow.id === tr.id;
                  return (
                    <tr key={tr.id} style={{ background: on ? (themeKey === "white" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.045)") : "transparent" }}>
                      <td style={{ borderBottom: "1px solid " + t.hair, cursor: "pointer" }}
                        onClick={() => setSel((s) => on ? s.filter((i) => i !== tr.id) : [...s, tr.id])}>
                        <span style={{ display: "inline-block", width: 15, height: 15, borderRadius: 3, border: "1.5px solid " + (on ? t.ink : t.hair), background: on ? t.ink : "none" }} />
                      </td>
                      <td style={td({ color: t.faint, fontSize: SZ.numSm })}>{tr.closedOn}</td>
                      <td style={{ ...td(), ...sans, fontWeight: 600, fontSize: SZ.num }}>{tr.sym}</td>
                      <td style={{ ...td(), ...sans, fontSize: 14, color: tr.side === "LONG" ? t.ink : t.faint }}>{tr.side}</td>
                      <td style={td({ textAlign: "right" })}>{tr.qty}</td>
                      <td style={td({ textAlign: "right" })}>{nf(tr.entry)}</td>
                      <td style={td({ textAlign: "right" })}>
                        {editing ? (
                          <input autoFocus value={editRow.exit}
                            onChange={(e) => setEditRow({ ...editRow, exit: e.target.value.replace(/[^\d.]/g, "") })}
                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                            style={{ ...mono, fontSize: SZ.num, width: 92, textAlign: "right", border: "none", borderBottom: "1px solid " + t.ink, outline: "none", background: "none", color: t.ink }} />
                        ) : nf(tr.exit)}
                      </td>
                      <td style={td({ textAlign: "right", fontSize: 14, color: t.faint })}>{tr.real * 100}%</td>
                      <td style={td({ textAlign: "right", fontWeight: 600, color: pl(p) })}>{signed(p)}</td>
                      <td style={{ ...td(), textAlign: "right" }}>
                        {editing ? (
                          <button onClick={saveEdit} style={{ ...sans, fontSize: 13, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "5px 12px", cursor: "pointer" }}>Save</button>
                        ) : (
                          <span style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button onClick={() => act("edit", tr.id)} style={{ ...sans, fontSize: 13, color: t.faint, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                            <button onClick={() => act("delete", tr.id)} style={{ ...sans, fontSize: 13, color: themeKey === "white" ? t.loss : t.ink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: SZ.meta, color: t.faint, marginTop: 14 }}>
              Checkbox sums selected trades. Edit and Delete sit behind the PIN{pinOk ? " — unlocked this session" : ""}.
            </div>
          </>
        )}

        {/* ————— ADD ————— */}
        {view === "add" && (
          <div style={{ maxWidth: 580 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Initiate new contract</div>
              <div style={{ ...mono, fontSize: SZ.meta, color: t.faint }}>{WEEKS[CUR_WEEK]}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 30px" }}>
              <div><label style={lbl}>Symbol / security</label>
                <input placeholder="e.g. NIFTY25S" value={form.sym} onChange={(e) => setForm({ ...form, sym: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Instrument</label>
                <select value={form.instr} onChange={(e) => setForm({ ...form, instr: e.target.value, ccy: INSTR[e.target.value].ccy })}
                  style={{ ...inp, ...sans, fontSize: SZ.num - 1, cursor: "pointer", background: t.bg }}>
                  {Object.keys(INSTR).map((k) => <option key={k}>{k}</option>)}
                </select></div>
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                <button onClick={() => setForm({ ...form, side: "LONG" })} style={toggle(form.side === "LONG")}>LONG · buy first</button>
                <button onClick={() => setForm({ ...form, side: "SHORT" })} style={toggle(form.side === "SHORT")}>SHORT · sell first</button>
              </div>
              <div><label style={lbl}>{form.side === "LONG" ? "Buy" : "Sell"} price</label>
                <input placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })} style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div><label style={lbl}>Multiplier</label><div style={{ ...mono, fontSize: SZ.num, padding: "6px 0" }}>×{INSTR[form.instr].mult}</div></div>
                <div><label style={lbl}>Lots</label>
                  <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value.replace(/\D/g, "") })} style={inp} /></div>
              </div>
              <div><label style={lbl}>Initiation date</label>
                <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Accounting currency</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setForm({ ...form, ccy: "INR" })} style={toggle(form.ccy === "INR")}>₹ INR</button>
                  <button onClick={() => setForm({ ...form, ccy: "USD" })} style={toggle(form.ccy === "USD")}>$ USD</button>
                </div></div>
              <div><label style={lbl}>Realization · profit share</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setForm({ ...form, real: 1.0 })} style={toggle(form.real === 1.0)}>FULL 1.0</button>
                  <button onClick={() => setForm({ ...form, real: 0.8 })} style={toggle(form.real === 0.8)}>80% 0.8</button>
                </div>
                <div style={{ fontSize: SZ.label, color: t.faint, marginTop: 6 }}>MTM and realized P&L both wear this.</div></div>
              <div><label style={lbl}>Entry-leg brokerage ($, optional)</label>
                <input placeholder="blank = auto formula (legacy)" value={form.brok}
                  onChange={(e) => setForm({ ...form, brok: e.target.value.replace(/[^\d.]/g, "") })} style={inp} />
                <div style={{ fontSize: SZ.label, color: t.faint, marginTop: 6 }}>Charged this week. Exit leg at close.</div></div>
              {form.ccy === "USD" && (
                <div style={{ gridColumn: "1 / -1", fontSize: SZ.meta, color: t.faint }}>
                  USD → ₹ converts at each week's closing rate (this week's asked Saturday · last week {rates[CUR_WEEK - 1]}).
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 36, paddingTop: 20, borderTop: "1px solid " + t.hair }}>
              <button onClick={() => setForm({ ...form, sym: "", price: "" })}
                style={{ ...sans, fontSize: SZ.btn, color: t.faint, background: "none", border: "1px solid " + t.hair, borderRadius: 3, padding: "10px 20px", cursor: "pointer" }}>Cancel</button>
              <button onClick={deploy}
                style={{ ...sans, fontSize: SZ.btn, fontWeight: 600, background: t.ink, color: t.bg, border: "none", borderRadius: 3, padding: "10px 24px", cursor: "pointer" }}>Confirm &amp; deploy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
