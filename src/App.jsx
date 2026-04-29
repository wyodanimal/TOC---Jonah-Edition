import { useState, useEffect, useCallback } from "react";

// ── Node shortcodes for pallet ID ─────────────────────────
const NODE_SHORT = {
  floor: "FL", sg4300: "SG43", sg4100: "SG41", sg1300: "SG13", sg1100: "SG11",
  amtu4300: "AM43", amtu4100: "AM41", amtu1300: "AM13", amtu1100: "AM11",
  dd_conformity: "CF", fz_conformity: "CF",
  vl4800: "VL48", vl4700: "VL47", vl1800: "VL18", vl1700: "VL17",
  sc5800: "SC58", sc5700: "SC57", sc2800: "SC28", sc2700: "SC27",
  srm: "SRM",
};

const DD_SRMS = [11,12,13,14,15,16,17];
const FZ_SRMS = [1,2,3,4,5,6,7,8,9,10];

const DD_NODES = [
  { id: "floor",        label: "Floor / Receiving" },
  { id: "sg_lane",      label: "SG",   isLaneSplit: true, options: [{ id: "sg4300", label: "SG 4300" }, { id: "sg4100", label: "SG 4100" }] },
  { id: "amtu_lane",    label: "AMTU", isLaneSplit: true, options: [{ id: "amtu4300", label: "AMTU 4300" }, { id: "amtu4100", label: "AMTU 4100" }] },
  { id: "dd_conformity",label: "DD Conformity", hasReject: true },
  { id: "vl_lane",      label: "VL",   isLaneSplit: true, options: [{ id: "vl4800", label: "VL 4800" }, { id: "vl4700", label: "VL 4700" }] },
  { id: "sc_lane",      label: "SC",   isLaneSplit: true, options: [{ id: "sc5800", label: "SC 5800" }, { id: "sc5700", label: "SC 5700" }] },
  { id: "srm",          label: "SRM",  isSRM: true },
];

const FZ_NODES = [
  { id: "floor",        label: "Floor / Receiving" },
  { id: "sg_lane",      label: "SG",   isLaneSplit: true, options: [{ id: "sg1300", label: "SG 1300" }, { id: "sg1100", label: "SG 1100" }] },
  { id: "amtu_lane",    label: "AMTU", isLaneSplit: true, options: [{ id: "amtu1300", label: "AMTU 1300" }, { id: "amtu1100", label: "AMTU 1100" }] },
  { id: "fz_conformity",label: "FZ Conformity", hasReject: true },
  { id: "vl_lane",      label: "VL",   isColdChainCheck: true, isLaneSplit: true, options: [{ id: "vl1800", label: "VL 1800" }, { id: "vl1700", label: "VL 1700" }] },
  { id: "sc_lane",      label: "SC",   isLaneSplit: true, options: [{ id: "sc2800", label: "SC 2800" }, { id: "sc2700", label: "SC 2700" }] },
  { id: "srm",          label: "SRM",  isSRM: true },
];

const DD_EQUIPMENT = ["SG 4300","SG 4100","AMTU 4300","AMTU 4100","DD Conformity","VL 4800","VL 4700","SC 5800","SC 5700","SRM 11","SRM 12","SRM 13","SRM 14","SRM 15","SRM 16","SRM 17"];
const FZ_EQUIPMENT = ["SG 1300","SG 1100","AMTU 1300","AMTU 1100","FZ Conformity","VL 1800","VL 1700","SC 2800","SC 2700","SRM 1","SRM 2","SRM 3","SRM 4","SRM 5","SRM 6","SRM 7","SRM 8","SRM 9","SRM 10"];
const CONDITIONS   = ["Mostly Receiving","Mostly Shipping","Split"];
const FLAG_REASONS = ["Mechanical breakdown","Partial shutdown","Maintenance / PM","Understaffed","Unknown","Other"];

// ── Colors ────────────────────────────────────────────────
const BG      = "#1a1f2e";
const SURFACE = "#242938";
const CARD    = "#2d3347";
const BORDER  = "#383d52";
const ORANGE  = "#e8760a";
const ORANGE2 = "#f5920d";
const GREEN   = "#4caf7d";
const GREEN2  = "#3a9166";
const RED     = "#e05252";
const BLUE    = "#4a9ede";
const TEXT    = "#e8e6e0";
const MUTED   = "#8b8fa8";
const FAINT   = "#555970";

// ── Helpers ───────────────────────────────────────────────
function fmt(ms) {
  if (!ms || ms < 0) return "--";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60), r = s % 60;
  return m + "m " + r + "s";
}
function fmtTime(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0") + ":" + d.getSeconds().toString().padStart(2,"0");
}

// Daily counter — resets at midnight, stored per day
function getDailyCount(side) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `daily_count_${side}_${today}`;
  const raw = localStorage.getItem(key);
  return raw ? parseInt(raw, 10) : 0;
}
function incrementDailyCount(side) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `daily_count_${side}_${today}`;
  const next = getDailyCount(side) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

// Build pallet ID from taps + side — called when observation completes
// Format: {side}{induct}-{seq}-{startShort}-{endShort}
// e.g.  F13-3-FL-SRM12  or  D43-1-SG43-CF
function buildPalletId(side, taps, srmNumber, seq) {
  const sideChar = side === "FZ" ? "F" : "D";

  // Find induct (SG node)
  const inductKey = Object.keys(taps).find(k => k.startsWith("sg"));
  let inductShort = "";
  if (inductKey) {
    const num = inductKey.replace("sg", "");
    inductShort = num.slice(0, 2); // "13", "11", "43", "41"
  }

  // Sorted tap keys by timestamp
  const sorted = Object.entries(taps).sort((a, b) => a[1] - b[1]);
  const firstKey = sorted[0]?.[0] || "";
  const lastKey  = sorted[sorted.length - 1]?.[0] || "";

  const startShort = NODE_SHORT[firstKey] || firstKey.toUpperCase();
  let endShort = NODE_SHORT[lastKey] || lastKey.toUpperCase();

  // If last node is SRM, append the number
  if (lastKey === "srm" && srmNumber) endShort = `SRM${srmNumber}`;

  const inductPart = inductShort ? inductShort : "";
  const middle = inductPart ? `${sideChar}${inductPart}` : sideChar;

  return `${seq}-${middle}-${startShort}→${endShort}`;
}

function useStorage(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  const set = useCallback((v) => {
    setVal(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, set];
}

// ── UI Components ─────────────────────────────────────────
function LiveTimer({ startTs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!startTs) return null;
  return <span style={{ fontSize: 24, fontWeight: 700, color: ORANGE2 }}>{fmt(now - startTs)}</span>;
}

function Chip({ label, color = "faint" }) {
  const map = {
    orange: { bg: "rgba(232,118,10,0.18)", fg: ORANGE2, br: "rgba(232,118,10,0.35)" },
    green:  { bg: "rgba(76,175,125,0.18)", fg: GREEN,   br: "rgba(76,175,125,0.35)" },
    red:    { bg: "rgba(224,82,82,0.18)",  fg: RED,     br: "rgba(224,82,82,0.35)"  },
    blue:   { bg: "rgba(74,158,222,0.18)", fg: BLUE,    br: "rgba(74,158,222,0.35)" },
    faint:  { bg: "rgba(85,89,112,0.25)",  fg: MUTED,   br: BORDER },
  };
  const c = map[color] || map.faint;
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px", borderRadius: 3, background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>{label}</span>;
}

function SLabel({ children, mt }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: ORANGE, marginBottom: 10, marginTop: mt !== undefined ? mt : 20 }}>{children}</div>;
}

function Hr() { return <div style={{ height: 1, background: BORDER, margin: "18px 0" }} />; }

function Btn({ variant = "default", children, onClick, style, small, disabled }) {
  const v = {
    default: { background: CARD,    color: TEXT,    border: `1px solid ${BORDER}` },
    primary: { background: ORANGE,  color: "#fff",  border: `1px solid ${ORANGE}` },
    success: { background: GREEN2,  color: "#fff",  border: `1px solid ${GREEN2}` },
    danger:  { background: RED,     color: "#fff",  border: `1px solid ${RED}`    },
    outline: { background: "transparent", color: ORANGE2, border: `1px solid ${ORANGE}` },
    ghost:   { background: "transparent", color: MUTED,   border: `1px solid ${BORDER}` },
    active:  { background: "rgba(232,118,10,0.15)", color: ORANGE2, border: `1px solid ${ORANGE}` },
  }[variant] || { background: CARD, color: TEXT, border: `1px solid ${BORDER}` };
  return <button onClick={onClick} disabled={disabled} style={{ ...v, display: "block", width: "100%", padding: small ? "11px 12px" : "15px 12px", fontSize: small ? 12 : 14, fontWeight: 700, fontFamily: "inherit", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", textAlign: "center", marginBottom: small ? 6 : 8, opacity: disabled ? 0.4 : 1, letterSpacing: 0.3, ...style }}>{children}</button>;
}

function NodeBtn({ state = "default", children, onClick }) {
  const s = {
    tapped:  { background: "rgba(76,175,125,0.1)",  border: `2px solid ${GREEN}`,  color: GREEN   },
    current: { background: "rgba(232,118,10,0.1)",  border: `2px solid ${ORANGE}`, color: ORANGE2 },
    default: { background: CARD,                    border: `2px solid ${BORDER}`, color: TEXT    },
  }[state] || { background: CARD, border: `2px solid ${BORDER}`, color: TEXT };
  return <button onClick={onClick} style={{ ...s, display: "block", width: "100%", padding: "20px 12px", fontSize: 15, fontWeight: 700, fontFamily: "inherit", borderRadius: 10, cursor: "pointer", textAlign: "center", marginBottom: 8 }}>{children}</button>;
}

function Card({ children, style }) {
  return <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, ...style }}>{children}</div>;
}

function StatPair({ left, right }) {
  return <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
    {[left, right].filter(Boolean).map((item, i) =>
      <div key={i} style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>{item.label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: item.color || TEXT }}>{item.value}</div>
        {item.sub && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{item.sub}</div>}
      </div>
    )}
  </div>;
}

function ModalWrap({ children }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(10,13,22,0.93)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>{children}</div>;
}

function Confirm({ title, body, onYes, onNo, yesLabel = "Confirm", noLabel = "Cancel", dangerNo }) {
  return <ModalWrap>
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: MUTED, marginBottom: 20, lineHeight: 1.6 }}>{body}</div>}
      <Btn variant="primary" onClick={onYes}>{yesLabel}</Btn>
      <Btn variant={dangerNo ? "danger" : "ghost"} onClick={onNo}>{noLabel}</Btn>
    </div>
  </ModalWrap>;
}

// SRM picker modal
function SRMPicker({ srms, onSelect, onCancel }) {
  return <ModalWrap>
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Which SRM?</div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Select the SRM that received this pallet.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {srms.map(n => <button key={n} onClick={() => onSelect(n)} style={{ background: CARD, border: `2px solid ${BORDER}`, color: TEXT, borderRadius: 8, padding: "16px 8px", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          {n}
        </button>)}
      </div>
      <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
    </div>
  </ModalWrap>;
}

function ColdFlagModal({ elapsed, onSave }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const ta = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "10px 12px", borderRadius: 6, outline: "none", resize: "none", boxSizing: "border-box" };
  return <ModalWrap>
    <div style={{ background: SURFACE, border: `2px solid ${RED}`, borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: RED, marginBottom: 6 }}>⚠ Cold Chain Alert</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: RED, marginBottom: 4 }}>{fmt(elapsed)}</div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 20, lineHeight: 1.5 }}>Elapsed time exceeds threshold. Select a reason to continue.</div>
      <SLabel mt={0}>Reason Required</SLabel>
      {FLAG_REASONS.map(r => <Btn key={r} small variant={reason === r ? "danger" : "default"} onClick={() => setReason(r)}>{r}</Btn>)}
      <textarea rows={2} placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} style={{ ...ta, marginTop: 8, marginBottom: 12 }} />
      <Btn variant="danger" disabled={!reason} onClick={() => onSave({ reason, notes })}>Acknowledge & Continue</Btn>
    </div>
  </ModalWrap>;
}

function Toggle({ on, onToggle, label, danger }) {
  return <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${BORDER}`, cursor: "pointer" }}>
    <span style={{ fontSize: 13, color: on && danger ? RED : TEXT }}>{label}</span>
    <div style={{ width: 42, height: 22, background: on ? (danger ? RED : ORANGE) : FAINT, borderRadius: 11, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 18, height: 18, background: "#fff", borderRadius: 9, transition: "left 0.2s" }} />
    </div>
  </div>;
}

function SessionSetup({ side, onStart }) {
  const [condition, setCondition] = useState("");
  const [offline, setOffline] = useState({});
  const [notes, setNotes] = useState("");
  const [equipOpen, setEquipOpen] = useState(false);
  const equip = side === "DD" ? DD_EQUIPMENT : FZ_EQUIPMENT;
  const offlineCount = Object.values(offline).filter(Boolean).length;
  const ta = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "10px 12px", borderRadius: 6, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 12 };

  return <div>
    <SLabel mt={4}>Operating Condition</SLabel>
    {CONDITIONS.map(c => <Btn key={c} variant={condition === c ? "active" : "default"} onClick={() => setCondition(c)}>{c}</Btn>)}
    <Hr />
    <div onClick={() => setEquipOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "4px 0", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: offlineCount > 0 ? RED : ORANGE }}>Equipment Offline</span>
        {offlineCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(224,82,82,0.18)", color: RED, border: "1px solid rgba(224,82,82,0.35)", borderRadius: 10, padding: "1px 8px" }}>{offlineCount} down</span>}
      </div>
      <span style={{ color: MUTED, fontSize: 14 }}>{equipOpen ? "▲" : "▼"}</span>
    </div>
    {equipOpen && <div style={{ background: SURFACE, borderRadius: 8, padding: "4px 12px", marginBottom: 12, border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 12, color: MUTED, padding: "10px 0 6px" }}>Tag anything down — attaches to all observations this session.</div>
      {equip.map(e => <Toggle key={e} on={offline[e]} onToggle={() => setOffline(p => ({ ...p, [e]: !p[e] }))} label={e} danger />)}
    </div>}
    <Hr />
    <SLabel>Session Notes</SLabel>
    <textarea rows={3} placeholder="Staffing, conditions, anything unusual..." value={notes} onChange={e => setNotes(e.target.value)} style={ta} />
    <Btn variant="primary" disabled={!condition} onClick={() => condition && onStart({ condition, offline, notes, startTime: Date.now() })}>Start Session</Btn>
  </div>;
}

// ── Observer Tab ──────────────────────────────────────────
function ObserverTab({ side, nodes, settings }) {
  const [sessions, setSessions]     = useStorage(`sessions_${side}`, []);
  const [activeSession, setActiveSession] = useState(null);
  const [pallet, setPallet]         = useState(null);
  const [srmNumber, setSrmNumber]   = useState(null);   // which SRM this pallet used
  const [laneSelections, setLaneSelections] = useState({});
  const [confirm, setConfirm]       = useState(null);
  const [coldFlag, setColdFlag]     = useState(null);
  const [slowFlag, setSlowFlag]     = useState(null);
  const [srmPicker, setSrmPicker]   = useState(false);
  const [view, setView]             = useState("setup");

  const srms = side === "DD" ? DD_SRMS : FZ_SRMS;

  const firstTs = useCallback(() => {
    if (!pallet || !Object.keys(pallet.taps).length) return null;
    return Math.min(...Object.values(pallet.taps));
  }, [pallet]);

  const hasTap  = (key) => !!(pallet && pallet.taps[key] !== undefined);
  const getSegStr = (key) => {
    if (!pallet) return "";
    const entries = Object.entries(pallet.taps).sort((a, b) => a[1] - b[1]);
    const idx = entries.findIndex(e => e[0] === key);
    if (idx > 0) return "+" + fmt(entries[idx][1] - entries[idx - 1][1]);
    return "";
  };

  const conformityTapped = () => {
    if (!pallet) return false;
    return pallet.taps[side === "DD" ? "dd_conformity" : "fz_conformity"] !== undefined;
  };

  const doTap = (key, basePallet) => {
    const p = basePallet || pallet;
    const ts = Date.now();
    const prevEntries = Object.entries(p.taps).sort((a, b) => a[1] - b[1]);
    const updated = { ...p, taps: { ...p.taps, [key]: ts } };
    if (prevEntries.length > 0) {
      const seg = ts - prevEntries[prevEntries.length - 1][1];
      if (seg > 20 * 60 * 1000) { setSlowFlag({ key, seg, updated }); return; }
    }
    if ((key === "vl1800" || key === "vl1700") && side === "FZ") {
      const start = Object.keys(p.taps).length > 0 ? Math.min(...Object.values(p.taps)) : ts;
      const elapsed = ts - start;
      const threshold = (Number(settings.coldChainMins) || 30) * 60 * 1000;
      if (elapsed > threshold) { setPallet(updated); setColdFlag({ elapsed }); return; }
    }
    setPallet(updated);
  };

  const tapNode = (key, isSRM) => {
    if (isSRM) {
      // SRM tapped — show picker first
      setSrmPicker(true);
      return;
    }
    if (!pallet) { setConfirm({ type: "newPallet", key }); return; }
    if (hasTap(key)) { setConfirm({ type: "restart" }); return; }
    doTap(key);
  };

  const handleSRMSelect = (num) => {
    setSrmPicker(false);
    setSrmNumber(num);
    const ts = Date.now();
    const updated = pallet ? { ...pallet, taps: { ...pallet.taps, srm: ts } } : { id: "tmp", taps: { srm: ts }, rejected: false, coldChainFlag: null, complete: false };
    setPallet(updated);
  };

  const startPallet = (thenKey) => {
    const p = { id: "PENDING", taps: {}, rejected: false, coldChainFlag: null, complete: false };
    if (thenKey) { setPallet({ ...p, taps: { [thenKey]: Date.now() } }); }
    else { setPallet(p); }
    setSrmNumber(null);
    setLaneSelections({});
  };

  const savePallet = (p, srm) => {
    const seq = incrementDailyCount(side);
    const finalId = buildPalletId(side, p.taps, srm, seq);
    const final = { ...p, id: finalId, srmNumber: srm };
    const s = { ...activeSession, pallets: [...(activeSession.pallets || []), final] };
    setActiveSession(s);
    setSessions(prev => { const idx = prev.findIndex(x => x.id === s.id); if (idx >= 0) { const n = [...prev]; n[idx] = s; return n; } return [...prev, s]; });
    setPallet(null); setSrmNumber(null); setLaneSelections({});
  };

  const completePallet = () => savePallet({ ...pallet, complete: true, endTime: Date.now() }, srmNumber);
  const rejectPallet   = () => savePallet({ ...pallet, rejected: true, complete: true, endTime: Date.now() }, srmNumber);
  const endSession     = () => {
    const s = { ...activeSession, endTime: Date.now() };
    setSessions(prev => { const idx = prev.findIndex(x => x.id === s.id); if (idx >= 0) { const n = [...prev]; n[idx] = s; return n; } return [...prev, s]; });
    setActiveSession(null); setPallet(null); setView("setup");
  };

  if (view === "setup") return <div>
    <SessionSetup side={side} onStart={(cfg) => { setActiveSession({ id: `S${Date.now().toString(36).toUpperCase().slice(-5)}`, side, ...cfg, pallets: [] }); setView("observer"); }} />
    {sessions.length > 0 && <>
      <Hr />
      <SLabel>Recent Sessions</SLabel>
      {sessions.slice(-3).reverse().map(s => <Card key={s.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE2 }}>{s.id}</span>
          <span style={{ fontSize: 11, color: MUTED }}>{new Date(s.startTime).toLocaleDateString()}</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>{s.condition} · {s.pallets?.length || 0} pallets</div>
      </Card>)}
    </>}
  </div>;

  return <div>
    {confirm?.type === "newPallet" && <Confirm title="Start New Pallet?" body="Begin timing a new pallet from this node." yesLabel="Start Pallet"
      onYes={() => { startPallet(confirm.key); setConfirm(null); }} onNo={() => setConfirm(null)} />}
    {confirm?.type === "restart" && <Confirm title="Already Tapped" body="This node was already recorded. Save current pallet and start fresh?" yesLabel="Save & New Pallet" dangerNo
      onYes={() => { completePallet(); startPallet(); setConfirm(null); }} onNo={() => setConfirm(null)} />}
    {coldFlag && <ColdFlagModal elapsed={coldFlag.elapsed} onSave={(data) => { setPallet(p => ({ ...p, coldChainFlag: data })); setColdFlag(null); }} />}
    {slowFlag && <Confirm title="Unusual Segment Time" body={`That segment was ${fmt(slowFlag.seg)}. Keep or discard?`} yesLabel="Keep It" noLabel="Delete It" dangerNo
      onYes={() => { setPallet(slowFlag.updated); setSlowFlag(null); }} onNo={() => setSlowFlag(null)} />}
    {srmPicker && <SRMPicker srms={srms} onSelect={handleSRMSelect} onCancel={() => setSrmPicker(false)} />}

    {/* Session bar */}
    <div style={{ background: SURFACE, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: ORANGE }}>{side === "DD" ? "Dairy / Deli" : "Freezer"}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{activeSession?.condition} · {activeSession?.pallets?.length || 0} pallets</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {pallet && Object.keys(pallet.taps).length > 0 && <LiveTimer startTs={firstTs()} />}
        <Btn variant="ghost" small onClick={endSession} style={{ width: "auto", padding: "8px 14px", marginBottom: 0 }}>End</Btn>
      </div>
    </div>

    {!pallet && <Btn variant="primary" onClick={() => startPallet()}>+ New Pallet</Btn>}

    {pallet && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Live preview of what the ID will be */}
          <Chip label={pallet.id === "PENDING" ? `${side === "FZ" ? "F" : "D"} · In Progress` : pallet.id} color="orange" />
          {srmNumber && <Chip label={`SRM ${srmNumber}`} color="blue" />}
          {pallet.coldChainFlag && <Chip label="Cold Flag" color="red" />}
        </div>
        {conformityTapped() && <Btn variant="danger" small onClick={rejectPallet} style={{ width: "auto", padding: "6px 14px", marginBottom: 0 }}>Reject</Btn>}
      </div>

      {nodes.map((node, idx) => {
        const arrow = idx > 0 && <div style={{ textAlign: "center", color: FAINT, fontSize: 13, margin: "-2px 0 4px" }}>↓</div>;

        // SRM node — special handling
        if (node.isSRM) {
          const srmTapped = hasTap("srm");
          const isNext = !srmTapped && (() => {
            const prev = nodes[idx - 1];
            if (!prev) return true;
            if (prev.isLaneSplit) return prev.options.some(o => hasTap(o.id));
            return hasTap(prev.id);
          })();
          return <div key={node.id}>
            {arrow}
            <NodeBtn state={srmTapped ? "tapped" : isNext ? "current" : "default"} onClick={() => tapNode("srm", true)}>
              <div>{srmTapped ? `SRM ${srmNumber} ✓` : "SRM"}</div>
              {srmTapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400, marginTop: 4 }}>{fmtTime(pallet.taps.srm)}</div>}
              {srmTapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400 }}>{getSegStr("srm")}</div>}
            </NodeBtn>
          </div>;
        }

        if (node.isLaneSplit) return <div key={node.id}>
          {arrow}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {node.options.map(opt => {
              const tapped = hasTap(opt.id);
              return <NodeBtn key={opt.id} state={tapped ? "tapped" : "default"} onClick={() => { if (tapped) return; setLaneSelections(p => ({ ...p, [node.id]: opt.id })); tapNode(opt.id, false); }}>
                <div>{opt.label}</div>
                {tapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400, marginTop: 4 }}>{fmtTime(pallet.taps[opt.id])}</div>}
                {tapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400 }}>{getSegStr(opt.id)}</div>}
              </NodeBtn>;
            })}
          </div>
        </div>;

        const tapped = hasTap(node.id);
        const isNext = !tapped && (idx === 0 || (() => {
          const prev = nodes[idx - 1];
          if (!prev) return true;
          if (prev.isLaneSplit) return prev.options.some(o => hasTap(o.id));
          return hasTap(prev.id);
        })());

        return <div key={node.id}>
          {arrow}
          <NodeBtn state={tapped ? "tapped" : isNext ? "current" : "default"} onClick={() => tapNode(node.id, false)}>
            <div>{node.label}</div>
            {tapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400, marginTop: 4 }}>{fmtTime(pallet.taps[node.id])}</div>}
            {tapped && <div style={{ fontSize: 11, color: GREEN, fontWeight: 400 }}>{getSegStr(node.id)}</div>}
          </NodeBtn>
        </div>;
      })}

      <div style={{ marginTop: 12 }}>
        <Btn variant="success" onClick={completePallet}>Complete Observation</Btn>
        <Btn variant="ghost" small onClick={() => { setPallet(null); setSrmNumber(null); setLaneSelections({}); }}>Cancel / Discard</Btn>
      </div>
    </>}
    <div style={{ height: 24 }} />
  </div>;
}

// ── Man Hour Card ─────────────────────────────────────────
function ManHourCard({ people, elapsedMs, palletCount, label }) {
  if (!people || !elapsedMs || elapsedMs <= 0) return null;
  const hrs = elapsedMs / 3600000;
  const manHrs = Number(people) * hrs;
  const perPallet = palletCount > 0 ? manHrs / palletCount : null;
  return <div style={{ background: "rgba(76,175,125,0.07)", border: `1px solid ${GREEN2}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: GREEN, marginBottom: 12 }}>{label}</div>
    <StatPair
      left={{ label: "Man-Hrs Total", value: manHrs.toFixed(2), color: GREEN }}
      right={{ label: "Per Pallet", value: perPallet ? perPallet.toFixed(3) : "--", color: perPallet ? ORANGE2 : MUTED }}
    />
    <div style={{ fontSize: 11, color: MUTED }}>{people} people · {fmt(elapsedMs)} · {palletCount} pallets</div>
  </div>;
}

// ── Dock Tab ──────────────────────────────────────────────
function DockTab({ settings }) {
  const [sessions, setSessions] = useStorage("dock_sessions", []);
  const [mode, setMode]         = useState(null);
  const [meta, setMeta]         = useState({ side: "FZ", door: "", people: "2", induct: "SG 1300", desc: "" });
  const [batch, setBatch]       = useState(Array(5).fill(null).map((_, i) => ({ id: i + 1, floorTs: null, inductTs: null })));
  const [single, setSingle]     = useState({ floor: null, induct: null });
  const [batchStart, setBatchStart] = useState(null);
  const [now, setNow]           = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const INDUCT = { FZ: ["SG 1300","SG 1100"], DD: ["SG 4300","SG 4100"] };
  const completedBatch = batch.filter(p => p.floorTs && p.inductTs);
  const batchElapsed = batchStart ? now - batchStart : 0;
  const ta  = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "10px 12px", borderRadius: 6, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 12 };
  const inp = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "10px 12px", borderRadius: 6, outline: "none", marginBottom: 8, boxSizing: "border-box" };

  const saveSession = () => {
    const sessionElapsed = mode === "batch" && batchStart ? Date.now() - batchStart : (single.induct && single.floor ? single.induct - single.floor : 0);
    const palletCount = mode === "batch" ? completedBatch.length : 1;
    const manHrsTotal = (Number(meta.people) * sessionElapsed) / 3600000;
    const manHrsPerPallet = palletCount > 0 ? manHrsTotal / palletCount : null;
    setSessions(p => [...p, { id: `DK${Date.now().toString(36).toUpperCase().slice(-5)}`, ts: Date.now(), meta, mode, data: mode === "single" ? single : batch.filter(p => p.floorTs || p.inductTs), sessionElapsed, palletCount, manHrsTotal, manHrsPerPallet }]);
    setMode(null); setSingle({ floor: null, induct: null });
    setBatch(Array(5).fill(null).map((_, i) => ({ id: i + 1, floorTs: null, inductTs: null })));
    setBatchStart(null); setMeta({ side: "FZ", door: "", people: "2", induct: "SG 1300", desc: "" });
  };

  if (!mode) return <div>
    <SLabel mt={4}>Side</SLabel>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
      {["FZ","DD"].map(s => <Btn key={s} small variant={meta.side === s ? "active" : "default"} onClick={() => setMeta(p => ({ ...p, side: s, induct: INDUCT[s][0] }))}>{s === "FZ" ? "Freezer" : "Dairy / Deli"}</Btn>)}
    </div>
    <SLabel>Door #</SLabel>
    <input style={inp} type="text" placeholder="Door number..." value={meta.door} onChange={e => setMeta(p => ({ ...p, door: e.target.value }))} />
    <SLabel>People Unloading</SLabel>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 4 }}>
      {["1","2","3","4","5"].map(n => <Btn key={n} small variant={meta.people === n ? "active" : "default"} onClick={() => setMeta(p => ({ ...p, people: n }))} style={{ marginBottom: 0, padding: "12px 4px" }}>{n}</Btn>)}
    </div>
    <SLabel>Induction Point</SLabel>
    {(INDUCT[meta.side] || []).map(o => <Btn key={o} small variant={meta.induct === o ? "active" : "default"} onClick={() => setMeta(p => ({ ...p, induct: o }))}>{o}</Btn>)}
    <Hr />
    <Btn variant="primary" onClick={() => setMode("single")}>Single Pallet</Btn>
    <Btn variant="outline" onClick={() => setMode("batch")}>Batch Mode — up to 5</Btn>
    {sessions.length > 0 && <>
      <Hr />
      <SLabel>Recent Sessions</SLabel>
      {sessions.slice(-3).reverse().map(s => <Card key={s.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE2 }}>{s.id}</span>
          <Chip label={s.meta.side} color={s.meta.side === "FZ" ? "blue" : "orange"} />
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>Door {s.meta.door} · {s.meta.people} people · {s.palletCount} pallets</div>
        {s.manHrsPerPallet != null && <div style={{ fontSize: 12, color: GREEN, marginTop: 4 }}>{s.manHrsPerPallet.toFixed(3)} man-hrs/pallet</div>}
      </Card>)}
    </>}
  </div>;

  if (mode === "single") return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Chip label="Single" color="orange" />
        <Chip label={`${meta.side} · Door ${meta.door || "?"} · ${meta.people}p`} color="faint" />
      </div>
      <Btn variant="ghost" small onClick={() => setMode(null)} style={{ width: "auto", padding: "6px 12px", marginBottom: 0 }}>Back</Btn>
    </div>
    {single.floor && single.induct && <ManHourCard people={meta.people} elapsedMs={single.induct - single.floor} palletCount={1} label="Results" />}
    {single.floor && !single.induct && <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>ELAPSED</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: ORANGE2 }}>{fmt(now - single.floor)}</div>
    </div>}
    <NodeBtn state={single.floor ? "tapped" : "current"} onClick={() => setSingle(p => ({ ...p, floor: p.floor || Date.now() }))}>
      {single.floor ? `Floor ✓   ${fmtTime(single.floor)}` : "Tap — Floor Hit"}
    </NodeBtn>
    <div style={{ textAlign: "center", color: FAINT, fontSize: 13, margin: "-2px 0 4px" }}>↓</div>
    <NodeBtn state={single.induct ? "tapped" : single.floor ? "current" : "default"} onClick={() => single.floor && setSingle(p => ({ ...p, induct: p.induct || Date.now() }))}>
      {single.induct ? `Induct ✓   ${fmtTime(single.induct)}` : "Tap — Induction"}
    </NodeBtn>
    {single.floor && single.induct && <>
      <Hr />
      <SLabel>Load Description</SLabel>
      <textarea rows={2} placeholder="Enter after unloading..." value={meta.desc} onChange={e => setMeta(p => ({ ...p, desc: e.target.value }))} style={ta} />
      <Btn variant="primary" onClick={saveSession}>Save Session</Btn>
    </>}
  </div>;

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <Chip label="Batch" color="orange" />
        <Chip label={`${meta.side} · Door ${meta.door || "?"} · ${meta.people}p`} color="faint" />
      </div>
      <Btn variant="ghost" small onClick={() => setMode(null)} style={{ width: "auto", padding: "6px 12px", marginBottom: 0 }}>Back</Btn>
    </div>
    {batchStart && <ManHourCard people={meta.people} elapsedMs={batchElapsed} palletCount={completedBatch.length} label="Live Metrics" />}
    {batch.map((p, i) => <Card key={p.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Pallet {p.id}</span>
        {p.floorTs && p.inductTs && <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{fmt(p.inductTs - p.floorTs)}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Btn small variant={p.floorTs ? "success" : "primary"} style={{ marginBottom: 0 }}
          onClick={() => { if (!batchStart) setBatchStart(Date.now()); setBatch(prev => { const n = [...prev]; n[i] = { ...n[i], floorTs: n[i].floorTs || Date.now() }; return n; }); }}>
          {p.floorTs ? "Floor ✓" : "Floor"}
        </Btn>
        <Btn small variant={p.inductTs ? "success" : p.floorTs ? "primary" : "ghost"} disabled={!p.floorTs} style={{ marginBottom: 0 }}
          onClick={() => p.floorTs && setBatch(prev => { const n = [...prev]; n[i] = { ...n[i], inductTs: n[i].inductTs || Date.now() }; return n; })}>
          {p.inductTs ? "Induct ✓" : "Induct"}
        </Btn>
      </div>
    </Card>)}
    <Hr />
    {completedBatch.length > 0 && batchStart && <ManHourCard people={meta.people} elapsedMs={Date.now() - batchStart} palletCount={completedBatch.length} label="Session Summary" />}
    <SLabel>Load Description</SLabel>
    <textarea rows={2} placeholder="Enter after unloading..." value={meta.desc} onChange={e => setMeta(p => ({ ...p, desc: e.target.value }))} style={ta} />
    <Btn variant="primary" onClick={saveSession}>Save Session</Btn>
  </div>;
}

// ── History Tab ───────────────────────────────────────────
function HistoryTab() {
  const [ddSessions] = useStorage("sessions_DD", []);
  const [fzSessions] = useStorage("sessions_FZ", []);
  const [dockSessions] = useStorage("dock_sessions", []);
  const allPallets = [
    ...ddSessions.flatMap(s => s.pallets.map(p => ({ ...p, side: "DD", condition: s.condition }))),
    ...fzSessions.flatMap(s => s.pallets.map(p => ({ ...p, side: "FZ", condition: s.condition }))),
  ].sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
  const totalTime = (p) => { const v = Object.values(p.taps || {}); return v.length < 2 ? null : Math.max(...v) - Math.min(...v); };

  return <div>
    <SLabel mt={4}>Pallet Log ({allPallets.length})</SLabel>
    {allPallets.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: "24px 0", textAlign: "center" }}>No observations yet.</div>}
    {allPallets.slice(0, 30).map((p, i) => <Card key={i} style={{ borderLeft: `3px solid ${p.coldChainFlag ? RED : p.complete && !p.rejected ? GREEN : BORDER}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: ORANGE2, letterSpacing: 0.5 }}>{p.id}</span>
        <div style={{ display: "flex", gap: 5 }}>

          {p.rejected && <Chip label="Rejected" color="red" />}
          {p.coldChainFlag && <Chip label="Cold Flag" color="red" />}
        </div>
      </div>
      <div style={{ fontSize: 12, color: MUTED }}>{p.condition} · {Object.keys(p.taps || {}).length} nodes · {fmt(totalTime(p))}</div>
      {p.endTime && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{new Date(p.endTime).toLocaleString()}</div>}
    </Card>)}
    <Hr />
    <SLabel>Dock Sessions ({dockSessions.length})</SLabel>
    {dockSessions.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: "12px 0" }}>No dock sessions yet.</div>}
    {dockSessions.slice(-10).reverse().map(s => <Card key={s.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE2 }}>{s.id}</span>
        <Chip label={s.meta.side} color={s.meta.side === "FZ" ? "blue" : "orange"} />
      </div>
      <div style={{ fontSize: 12, color: MUTED }}>Door {s.meta.door} · {s.meta.people} people · {s.palletCount} pallets</div>
      {s.manHrsPerPallet != null && <div style={{ fontSize: 12, color: GREEN, marginTop: 4 }}>{s.manHrsPerPallet.toFixed(3)} man-hrs/pallet · {s.manHrsTotal?.toFixed(2)} total</div>}
      {s.meta.desc && <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>{s.meta.desc}</div>}
    </Card>)}
    <div style={{ height: 24 }} />
  </div>;
}

// ── Settings Tab ──────────────────────────────────────────
function SettingsTab({ settings, setSettings }) {
  const inp = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "10px 12px", borderRadius: 6, outline: "none", marginBottom: 12, boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 6 };
  return <div>
    <SLabel mt={4}>User & System</SLabel>
    {[
      { key: "userId",        label: "User ID",                    placeholder: "Your ID or code" },
      { key: "coldChainMins", label: "Cold Chain Threshold (min)", placeholder: "30", type: "number" },
      { key: "ddCraneShared", label: "DD Shared SRM #",            placeholder: "14" },
      { key: "fzCraneShared", label: "FZ Shared SRM #",            placeholder: "5"  },
    ].map(f => <div key={f.key}><label style={lbl}>{f.label}</label><input style={inp} type={f.type || "text"} placeholder={f.placeholder} value={settings[f.key] || ""} onChange={e => setSettings(p => ({ ...p, [f.key]: e.target.value }))} /></div>)}
    <Hr />
    <SLabel>Design Rates — Dairy / Deli (pallets/hr)</SLabel>
    {CONDITIONS.map(c => <div key={"dd_"+c}><label style={lbl}>{c}</label><input style={inp} type="number" placeholder="Not set — pending manufacturer data" value={settings["dd_rate_"+c] || ""} onChange={e => setSettings(p => ({ ...p, ["dd_rate_"+c]: e.target.value }))} /></div>)}
    <SLabel>Design Rates — Freezer (pallets/hr)</SLabel>
    {CONDITIONS.map(c => <div key={"fz_"+c}><label style={lbl}>{c}</label><input style={inp} type="number" placeholder="Not set — pending manufacturer data" value={settings["fz_rate_"+c] || ""} onChange={e => setSettings(p => ({ ...p, ["fz_rate_"+c]: e.target.value }))} /></div>)}
    <Hr />
    <div style={{ fontSize: 11, color: FAINT, textAlign: "center" }}>TOC Jonah · The Jonah Edition v3.0 · Local storage · Google Sheets sync coming</div>
    <div style={{ height: 24 }} />
  </div>;
}


// ── Summary Tab ───────────────────────────────────────────
function SummaryTab() {
  const [ddSessions] = useStorage('sessions_DD', []);
  const [fzSessions] = useStorage('sessions_FZ', []);
  const [dockSessions] = useStorage('dock_sessions', []);

  const ddPallets = ddSessions.flatMap(s => s.pallets.map(p => ({ ...p, side: 'DD', condition: s.condition, sessionId: s.id })));
  const fzPallets = fzSessions.flatMap(s => s.pallets.map(p => ({ ...p, side: 'FZ', condition: s.condition, sessionId: s.id })));
  const allPallets = [...ddPallets, ...fzPallets];

  const totalTime = (p) => { const v = Object.values(p.taps || {}); return v.length < 2 ? null : Math.max(...v) - Math.min(...v); };
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const fmtMin = (ms) => ms ? (ms / 60000).toFixed(1) + " min" : "--";

  const times = allPallets.map(p => totalTime(p)).filter(Boolean);
  const ddTimes = ddPallets.map(p => totalTime(p)).filter(Boolean);
  const fzTimes = fzPallets.map(p => totalTime(p)).filter(Boolean);
  const flags = allPallets.filter(p => p.coldChainFlag);
  const rejected = allPallets.filter(p => p.rejected);

  // SRM breakdown
  const srmCounts = {};
  const srmTimes = {};
  allPallets.forEach(p => {
    if (p.srmNumber) {
      const k = `SRM ${p.srmNumber}`;
      srmCounts[k] = (srmCounts[k] || 0) + 1;
      const t = totalTime(p);
      if (t) { if (!srmTimes[k]) srmTimes[k] = []; srmTimes[k].push(t); }
    }
  });

  // Condition breakdown
  const byCondition = {};
  allPallets.forEach(p => {
    if (!p.condition) return;
    if (!byCondition[p.condition]) byCondition[p.condition] = [];
    const t = totalTime(p);
    if (t) byCondition[p.condition].push(t);
  });

  // Per-side condition breakdown
  const bySideCondition = {};
  [{label: 'DD', pallets: ddPallets}, {label: 'FZ', pallets: fzPallets}].forEach(({label, pallets}) => {
    CONDITIONS.forEach(c => {
      const pts = pallets.filter(p => p.condition === c).map(p => totalTime(p)).filter(Boolean);
      if (pts.length) bySideCondition[`${label} · ${c}`] = pts;
    });
  });

  // Dock summary
  const totalManHrs = dockSessions.reduce((a, s) => a + (s.manHrsTotal || 0), 0);
  const avgManHrsPerPallet = dockSessions.filter(s => s.manHrsPerPallet).map(s => s.manHrsPerPallet);

  // CSV export
  const downloadCSV = () => {
    const rows = [
      ['Pallet ID', 'Side', 'Condition', 'Session ID', 'Start Node', 'End Node', 'SRM #', 'Total Time (min)', 'Nodes Tapped', 'Cold Flag', 'Rejected', 'Timestamp'],
    ];
    allPallets.forEach(p => {
      const sorted = Object.entries(p.taps || {}).sort((a, b) => a[1] - b[1]);
      const startNode = sorted[0]?.[0] || '';
      const endNode = sorted[sorted.length - 1]?.[0] || '';
      const t = totalTime(p);
      rows.push([
        p.id || '',
        p.side || '',
        p.condition || '',
        p.sessionId || '',
        startNode,
        endNode,
        p.srmNumber || '',
        t ? (t / 60000).toFixed(2) : '',
        Object.keys(p.taps || {}).length,
        p.coldChainFlag ? 'YES' : 'NO',
        p.rejected ? 'YES' : 'NO',
        p.endTime ? new Date(p.endTime).toISOString() : '',
      ]);
    });
    // Dock rows
    rows.push([]);
    rows.push(['--- DOCK SESSIONS ---']);
    rows.push(['Session ID', 'Side', 'Door', 'People', 'Mode', 'Pallets', 'Elapsed (min)', 'Man-Hrs Total', 'Man-Hrs Per Pallet', 'Load Description', 'Date']);
    dockSessions.forEach(s => {
      rows.push([
        s.id || '',
        s.meta?.side || '',
        s.meta?.door || '',
        s.meta?.people || '',
        s.mode || '',
        s.palletCount || '',
        s.sessionElapsed ? (s.sessionElapsed / 60000).toFixed(2) : '',
        s.manHrsTotal ? s.manHrsTotal.toFixed(3) : '',
        s.manHrsPerPallet ? s.manHrsPerPallet.toFixed(3) : '',
        s.meta?.desc || '',
        s.ts ? new Date(s.ts).toISOString() : '',
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, "'")}"`).join(',')).join('
');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jonah-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
      <SLabel mt={0}>Overview</SLabel>
      <Btn variant="primary" small onClick={downloadCSV} style={{ width: 'auto', padding: '8px 16px', marginBottom: 0 }}>⬇ Export CSV</Btn>
    </div>

    {/* Top stat cards */}
    <StatPair
      left={{ label: 'Total Pallets', value: allPallets.length, color: TEXT }}
      right={{ label: 'Avg Transit', value: fmtMin(avg(times)), color: ORANGE2 }}
    />
    <StatPair
      left={{ label: 'Cold Flags', value: flags.length, color: flags.length > 0 ? RED : GREEN }}
      right={{ label: 'Rejections', value: rejected.length, color: rejected.length > 0 ? RED : GREEN }}
    />
    <StatPair
      left={{ label: 'DD Pallets', value: ddPallets.length, color: ORANGE2, sub: `Avg ${fmtMin(avg(ddTimes))}` }}
      right={{ label: 'FZ Pallets', value: fzPallets.length, color: BLUE, sub: `Avg ${fmtMin(avg(fzTimes))}` }}
    />

    <Hr />
    <SLabel>By Condition</SLabel>
    {Object.entries(bySideCondition).length === 0 && <div style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>No data yet.</div>}
    {Object.entries(bySideCondition).map(([label, times]) => {
      const a = avg(times);
      return <Card key={label} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE2 }}>{fmtMin(a)}</span>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{times.length} observations · min {fmtMin(Math.min(...times))} · max {fmtMin(Math.max(...times))}</div>
      </Card>;
    })}

    <Hr />
    <SLabel>By SRM</SLabel>
    {Object.keys(srmCounts).length === 0 && <div style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>No SRM data yet.</div>}
    {Object.entries(srmCounts).sort((a, b) => {
      const na = parseInt(a[0].replace('SRM ', ''));
      const nb = parseInt(b[0].replace('SRM ', ''));
      return na - nb;
    }).map(([srm, count]) => {
      const times = srmTimes[srm] || [];
      const a = avg(times);
      return <Card key={srm} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>{srm}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE2 }}>{fmtMin(a)}</span>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{count} pallets · min {fmtMin(Math.min(...times))} · max {fmtMin(Math.max(...times))}</div>
      </Card>;
    })}

    <Hr />
    <SLabel>Dock / Man-Hours</SLabel>
    <StatPair
      left={{ label: 'Dock Sessions', value: dockSessions.length, color: TEXT }}
      right={{ label: 'Total Man-Hrs', value: totalManHrs.toFixed(2), color: GREEN }}
    />
    {avgManHrsPerPallet.length > 0 && <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Avg Man-Hrs / Pallet</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: ORANGE2 }}>{avg(avgManHrsPerPallet).toFixed(3)}</span>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>across {avgManHrsPerPallet.length} sessions</div>
    </Card>}

    <div style={{ height: 24 }} />
  </div>;
}

// ── App Shell ─────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dd");
  const [settings, setSettings] = useStorage("jonah_settings", { coldChainMins: 30, userId: "", ddCraneShared: "14", fzCraneShared: "5" });
  const tabs = [{ id:"dd", label:"D/D" }, { id:"fz", label:"FZ" }, { id:"dock", label:"Dock" }, { id:"history", label:"Log" }, { id:"summary", label:"Sum" }, { id:"settings", label:"Set" }];

  return <div style={{ maxWidth: 440, margin: "0 auto", background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", color: TEXT, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
    <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, background: ORANGE, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>J</span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, letterSpacing: 0.3 }}>TOC Jonah · The Jonah Edition</div>
          <div style={{ fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: "uppercase" }}>System Observer</div>
        </div>
      </div>
      {settings.userId && <Chip label={settings.userId} color="orange" />}
    </div>
    <div style={{ display: "flex", background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
      {tabs.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "11px 4px", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: tab === t.id ? ORANGE : MUTED, cursor: "pointer", borderBottom: tab === t.id ? `2px solid ${ORANGE}` : "2px solid transparent" }}>{t.label}</div>)}
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 0" }}>
      {tab === "dd"       && <ObserverTab side="DD" nodes={DD_NODES} settings={settings} />}
      {tab === "fz"       && <ObserverTab side="FZ" nodes={FZ_NODES} settings={settings} />}
      {tab === "dock"     && <DockTab settings={settings} />}
      {tab === "history"  && <HistoryTab />}
      {tab === "summary"  && <SummaryTab />}
      {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
    </div>
  </div>;
}
