import { useState, useEffect, useCallback } from "react";

// ── Lane definitions with lock logic ─────────────────────
// Lane A = left lane (4300/1300), Lane B = right lane (4100/1100)
const DD_LANE_MAP = {
  sg4300: "A", sg4100: "B",
  amtu4300: "A", amtu4100: "B",
  vl4800: "A", vl4700: "B",
  sc5800: "A", sc5700: "B",
};
const FZ_LANE_MAP = {
  sg1300: "A", sg1100: "B",
  amtu1300: "A", amtu1100: "B",
  vl1800: "A", vl1700: "B",
  sc2800: "A", sc2700: "B",
};

// Default SRM assignments per shuttle — configurable in settings
const DEFAULT_SRM_ASSIGNMENTS = {
  sc5800: [15, 16, 17, 14],   // DD left shuttle + shared 14
  sc5700: [11, 12, 13, 14],   // DD right shuttle + shared 14
  sc2800: [6, 7, 8, 9, 10, 5], // FZ left shuttle + shared 5
  sc2700: [1, 2, 3, 4, 5],    // FZ right shuttle + shared 5
};

const DD_NODES = [
  { id: "floor",         label: "Floor / Receiving" },
  { id: "sg_lane",       label: "SG",   isLaneSplit: true, options: [{ id: "sg4300", label: "SG 4300", lane: "A" }, { id: "sg4100", label: "SG 4100", lane: "B" }] },
  { id: "amtu_lane",     label: "AMTU", isLaneSplit: true, options: [{ id: "amtu4300", label: "AMTU 4300", lane: "A" }, { id: "amtu4100", label: "AMTU 4100", lane: "B" }] },
  { id: "dd_conformity", label: "DD Conformity", hasReject: true },
  { id: "vl_lane",       label: "VL",   isLaneSplit: true, options: [{ id: "vl4800", label: "VL 4800", lane: "A" }, { id: "vl4700", label: "VL 4700", lane: "B" }] },
  { id: "sc_lane",       label: "SC",   isLaneSplit: true, options: [{ id: "sc5800", label: "SC 5800", lane: "A" }, { id: "sc5700", label: "SC 5700", lane: "B" }] },
  { id: "srm",           label: "SRM",  isSRM: true },
];

const FZ_NODES = [
  { id: "floor",         label: "Floor / Receiving" },
  { id: "sg_lane",       label: "SG",   isLaneSplit: true, options: [{ id: "sg1300", label: "SG 1300", lane: "A" }, { id: "sg1100", label: "SG 1100", lane: "B" }] },
  { id: "amtu_lane",     label: "AMTU", isLaneSplit: true, options: [{ id: "amtu1300", label: "AMTU 1300", lane: "A" }, { id: "amtu1100", label: "AMTU 1100", lane: "B" }] },
  { id: "fz_conformity", label: "FZ Conformity", hasReject: true },
  { id: "vl_lane",       label: "VL",   isColdChainCheck: true, isLaneSplit: true, options: [{ id: "vl1800", label: "VL 1800", lane: "A" }, { id: "vl1700", label: "VL 1700", lane: "B" }] },
  { id: "sc_lane",       label: "SC",   isLaneSplit: true, options: [{ id: "sc2800", label: "SC 2800", lane: "A" }, { id: "sc2700", label: "SC 2700", lane: "B" }] },
  { id: "srm",           label: "SRM",  isSRM: true },
];

const DD_EQUIPMENT = ["SG 4300","SG 4100","AMTU 4300","AMTU 4100","DD Conformity","VL 4800","VL 4700","SC 5800","SC 5700","SRM 11","SRM 12","SRM 13","SRM 14","SRM 15","SRM 16","SRM 17"];
const FZ_EQUIPMENT = ["SG 1300","SG 1100","AMTU 1300","AMTU 1100","FZ Conformity","VL 1800","VL 1700","SC 2800","SC 2700","SRM 1","SRM 2","SRM 3","SRM 4","SRM 5","SRM 6","SRM 7","SRM 8","SRM 9","SRM 10"];
const CONDITIONS   = ["Mostly Receiving","Mostly Shipping","Split"];
const FLAG_REASONS = ["Mechanical breakdown","Partial shutdown","Maintenance / PM","Understaffed","Unknown","Other"];

const DD_SEGMENTS = [
  { key: "floor->sg",        label: "Floor → SG",        from: ["floor"],                    to: ["sg4300","sg4100"] },
  { key: "sg->amtu",         label: "SG → AMTU",          from: ["sg4300","sg4100"],          to: ["amtu4300","amtu4100"] },
  { key: "amtu->conformity", label: "AMTU → Conformity",  from: ["amtu4300","amtu4100"],      to: ["dd_conformity"] },
  { key: "conformity->vl",   label: "Conformity → VL",    from: ["dd_conformity"],            to: ["vl4800","vl4700"] },
  { key: "vl->sc",           label: "VL → SC",            from: ["vl4800","vl4700"],          to: ["sc5800","sc5700"] },
  { key: "sc->srm",          label: "SC → SRM",           from: ["sc5800","sc5700"],          to: ["srm"] },
];
const FZ_SEGMENTS = [
  { key: "floor->sg",        label: "Floor → SG",        from: ["floor"],                    to: ["sg1300","sg1100"] },
  { key: "sg->amtu",         label: "SG → AMTU",          from: ["sg1300","sg1100"],          to: ["amtu1300","amtu1100"] },
  { key: "amtu->conformity", label: "AMTU → Conformity",  from: ["amtu1300","amtu1100"],      to: ["fz_conformity"] },
  { key: "conformity->vl",   label: "Conformity → VL",    from: ["fz_conformity"],            to: ["vl1800","vl1700"] },
  { key: "vl->sc",           label: "VL → SC",            from: ["vl1800","vl1700"],          to: ["sc2800","sc2700"] },
  { key: "sc->srm",          label: "SC → SRM",           from: ["sc2800","sc2700"],          to: ["srm"] },
];

const NODE_SHORT = {
  floor:"FL", sg4300:"SG43", sg4100:"SG41", sg1300:"SG13", sg1100:"SG11",
  amtu4300:"AM43", amtu4100:"AM41", amtu1300:"AM13", amtu1100:"AM11",
  dd_conformity:"CF", fz_conformity:"CF",
  vl4800:"VL48", vl4700:"VL47", vl1800:"VL18", vl1700:"VL17",
  sc5800:"SC58", sc5700:"SC57", sc2800:"SC28", sc2700:"SC27",
  srm:"SRM",
};

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyL1gPRqiWdDpLyRY7eUXjHADAXyG7pOf3kFmnHZDyJDrnFZKPa6Pu7VTsMlrv25G7T/exec";

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
function getDailyCount(side) {
  const today = new Date().toISOString().slice(0,10);
  const raw = localStorage.getItem("daily_count_" + side + "_" + today);
  return raw ? parseInt(raw,10) : 0;
}
function incrementDailyCount(side) {
  const today = new Date().toISOString().slice(0,10);
  const next = getDailyCount(side) + 1;
  localStorage.setItem("daily_count_" + side + "_" + today, String(next));
  return next;
}
function buildPalletId(side, taps, srmNumber, seq) {
  const sideChar = side === "FZ" ? "F" : "D";
  const inductKey = Object.keys(taps).find(k => k.startsWith("sg"));
  let inductShort = "";
  if (inductKey) inductShort = inductKey.replace("sg","").slice(0,2);
  const sorted = Object.entries(taps).sort((a,b) => a[1]-b[1]);
  const firstKey = sorted[0]?.[0] || "";
  const lastKey  = sorted[sorted.length-1]?.[0] || "";
  const startShort = NODE_SHORT[firstKey] || firstKey.toUpperCase();
  let endShort = NODE_SHORT[lastKey] || lastKey.toUpperCase();
  if (lastKey === "srm" && srmNumber) endShort = "SRM" + srmNumber;
  const middle = inductShort ? sideChar + inductShort : sideChar;
  return seq + "-" + middle + "-" + startShort + "→" + endShort;
}
function getSegmentTime(taps, fromKeys, toKeys) {
  const fromTs = fromKeys.map(k => taps[k]).filter(Boolean);
  const toTs   = toKeys.map(k => taps[k]).filter(Boolean);
  if (!fromTs.length || !toTs.length) return null;
  return Math.min(...toTs) - Math.min(...fromTs);
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

async function syncToSheets(ddSessions, fzSessions, dockSessions) {
  const allPallets = [
    ...ddSessions.flatMap(s => s.pallets.map(p => ({ ...p, side:"DD", condition:s.condition, sessionId:s.id, offlineEquip:s.offline||{} }))),
    ...fzSessions.flatMap(s => s.pallets.map(p => ({ ...p, side:"FZ", condition:s.condition, sessionId:s.id, offlineEquip:s.offline||{} }))),
  ];
  const palletRows = allPallets.map(p => {
    const taps = p.taps || {};
    const vals = Object.values(taps);
    const totalMs = vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null;
    const segs = p.side === "DD" ? DD_SEGMENTS : FZ_SEGMENTS;
    const segTimes = segs.map(seg => { const st = getSegmentTime(taps,seg.from,seg.to); return st ? (st/60000).toFixed(3) : ""; });
    const fmtTs = (k) => taps[k] ? new Date(taps[k]).toISOString() : "";
    const offlineList = Object.entries(p.offlineEquip||{}).filter(e=>e[1]).map(e=>e[0]).join("; ");
    return [p.id||"",p.side||"",p.condition||"",p.sessionId||"",p.srmNumber||"",
      p.coldChainFlag?"YES":"NO", p.coldChainFlag?(p.coldChainFlag.reason||""):"", p.rejected?"YES":"NO",
      totalMs?(totalMs/60000).toFixed(3):"",
      fmtTs("floor"),fmtTs("sg4300"),fmtTs("sg4100"),fmtTs("sg1300"),fmtTs("sg1100"),
      fmtTs("amtu4300"),fmtTs("amtu4100"),fmtTs("amtu1300"),fmtTs("amtu1100"),
      fmtTs("dd_conformity")||fmtTs("fz_conformity"),
      fmtTs("vl4800"),fmtTs("vl4700"),fmtTs("vl1800"),fmtTs("vl1700"),
      fmtTs("sc5800"),fmtTs("sc5700"),fmtTs("sc2800"),fmtTs("sc2700"),fmtTs("srm"),
      ...segTimes, offlineList];
  });
  const dockRows = dockSessions.map(s => [
    s.id||"",s.meta?.side||"",s.meta?.door||"",s.meta?.people||"",s.mode||"",s.palletCount||"",
    s.sessionElapsed?(s.sessionElapsed/60000).toFixed(2):"",
    s.manHrsTotal?s.manHrsTotal.toFixed(3):"",
    s.manHrsPerPallet?s.manHrsPerPallet.toFixed(3):"",
    s.meta?.desc||"",s.ts?new Date(s.ts).toISOString():"",
  ]);
  const results = await Promise.all([
    fetch(APPS_SCRIPT_URL,{method:"POST",body:JSON.stringify({type:"pallets",rows:palletRows})}),
    fetch(APPS_SCRIPT_URL,{method:"POST",body:JSON.stringify({type:"dock",rows:dockRows})}),
  ]);
  return results.every(r => r.ok);
}

// ── UI Components ─────────────────────────────────────────
function LiveTimer({ startTs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(i); },[]);
  if (!startTs) return null;
  return <span style={{ fontSize:24,fontWeight:700,color:ORANGE2 }}>{fmt(now-startTs)}</span>;
}

function Chip({ label, color="faint" }) {
  const map = {
    orange:{bg:"rgba(232,118,10,0.18)",fg:ORANGE2,br:"rgba(232,118,10,0.35)"},
    green: {bg:"rgba(76,175,125,0.18)", fg:GREEN,  br:"rgba(76,175,125,0.35)"},
    red:   {bg:"rgba(224,82,82,0.18)",  fg:RED,    br:"rgba(224,82,82,0.35)"},
    blue:  {bg:"rgba(74,158,222,0.18)", fg:BLUE,   br:"rgba(74,158,222,0.35)"},
    faint: {bg:"rgba(85,89,112,0.25)",  fg:MUTED,  br:BORDER},
  };
  const c = map[color]||map.faint;
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",padding:"3px 8px",borderRadius:3,background:c.bg,color:c.fg,border:"1px solid "+c.br}}>{label}</span>;
}

function SLabel({ children, mt }) {
  return <div style={{fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:ORANGE,marginBottom:10,marginTop:mt!==undefined?mt:20}}>{children}</div>;
}
function Hr() { return <div style={{height:1,background:BORDER,margin:"18px 0"}}/>; }

function Btn({ variant="default", children, onClick, style, small, disabled }) {
  const v = {
    default:{background:CARD,   color:TEXT,   border:"1px solid "+BORDER},
    primary:{background:ORANGE, color:"#fff", border:"1px solid "+ORANGE},
    success:{background:GREEN2, color:"#fff", border:"1px solid "+GREEN2},
    danger: {background:RED,    color:"#fff", border:"1px solid "+RED},
    outline:{background:"transparent",color:ORANGE2,border:"1px solid "+ORANGE},
    ghost:  {background:"transparent",color:MUTED,  border:"1px solid "+BORDER},
    active: {background:"rgba(232,118,10,0.15)",color:ORANGE2,border:"1px solid "+ORANGE},
    locked: {background:CARD,   color:FAINT,  border:"1px solid "+BORDER},
  }[variant]||{background:CARD,color:TEXT,border:"1px solid "+BORDER};
  return <button onClick={onClick} disabled={disabled} style={{...v,display:"block",width:"100%",padding:small?"11px 12px":"15px 12px",fontSize:small?12:14,fontWeight:700,fontFamily:"inherit",borderRadius:8,cursor:disabled?"not-allowed":"pointer",textAlign:"center",marginBottom:small?6:8,opacity:disabled?0.4:1,letterSpacing:0.3,...style}}>{children}</button>;
}

function NodeBtn({ state="default", children, onClick, disabled }) {
  const s = {
    tapped: {background:"rgba(76,175,125,0.1)", border:"2px solid "+GREEN,  color:GREEN},
    current:{background:"rgba(232,118,10,0.1)", border:"2px solid "+ORANGE, color:ORANGE2},
    locked: {background:"rgba(0,0,0,0.1)",      border:"2px solid "+FAINT,  color:FAINT},
    default:{background:CARD,                   border:"2px solid "+BORDER, color:TEXT},
  }[state]||{background:CARD,border:"2px solid "+BORDER,color:TEXT};
  return <button onClick={disabled?undefined:onClick} style={{...s,display:"block",width:"100%",padding:"20px 12px",fontSize:15,fontWeight:700,fontFamily:"inherit",borderRadius:10,cursor:disabled?"not-allowed":"pointer",textAlign:"center",marginBottom:8,opacity:disabled&&state!=="tapped"?0.4:1}}>{children}</button>;
}

function Card({ children, style }) {
  return <div style={{background:CARD,border:"1px solid "+BORDER,borderRadius:10,padding:"14px 16px",marginBottom:10,...style}}>{children}</div>;
}

function StatPair({ left, right }) {
  return <div style={{display:"flex",gap:10,marginBottom:12}}>
    {[left,right].filter(Boolean).map((item,i) =>
      <div key={i} style={{flex:1,background:SURFACE,border:"1px solid "+BORDER,borderRadius:8,padding:"12px 14px"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:MUTED,marginBottom:6}}>{item.label}</div>
        <div style={{fontSize:20,fontWeight:700,color:item.color||TEXT}}>{item.value}</div>
        {item.sub&&<div style={{fontSize:11,color:FAINT,marginTop:2}}>{item.sub}</div>}
      </div>
    )}
  </div>;
}

function ModalWrap({ children }) {
  return <div style={{position:"fixed",inset:0,background:"rgba(10,13,22,0.93)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>{children}</div>;
}

function Confirm({ title, body, onYes, onNo, yesLabel="Confirm", noLabel="Cancel", dangerNo }) {
  return <ModalWrap>
    <div style={{background:SURFACE,border:"1px solid "+BORDER,borderRadius:14,padding:24,width:"100%",maxWidth:360}}>
      <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:8}}>{title}</div>
      {body&&<div style={{fontSize:13,color:MUTED,marginBottom:20,lineHeight:1.6}}>{body}</div>}
      <Btn variant="primary" onClick={onYes}>{yesLabel}</Btn>
      <Btn variant={dangerNo?"danger":"ghost"} onClick={onNo}>{noLabel}</Btn>
    </div>
  </ModalWrap>;
}

function SRMPicker({ srms, onSelect, onCancel }) {
  return <ModalWrap>
    <div style={{background:SURFACE,border:"1px solid "+BORDER,borderRadius:14,padding:24,width:"100%",maxWidth:360}}>
      <div style={{fontSize:17,fontWeight:700,color:TEXT,marginBottom:6}}>Which SRM?</div>
      <div style={{fontSize:13,color:MUTED,marginBottom:20}}>Select the SRM that received this pallet.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
        {srms.map(n => <button key={n} onClick={() => onSelect(n)} style={{background:CARD,border:"2px solid "+BORDER,color:TEXT,borderRadius:8,padding:"16px 8px",fontSize:16,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{n}</button>)}
      </div>
      <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
    </div>
  </ModalWrap>;
}

function ColdFlagModal({ elapsed, onSave }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const ta = {width:"100%",background:CARD,border:"1px solid "+BORDER,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"10px 12px",borderRadius:6,outline:"none",resize:"none",boxSizing:"border-box"};
  return <ModalWrap>
    <div style={{background:SURFACE,border:"2px solid "+RED,borderRadius:14,padding:24,width:"100%",maxWidth:360}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:RED,marginBottom:6}}>⚠ Cold Chain Alert</div>
      <div style={{fontSize:28,fontWeight:700,color:RED,marginBottom:4}}>{fmt(elapsed)}</div>
      <div style={{fontSize:13,color:MUTED,marginBottom:20,lineHeight:1.5}}>Elapsed time exceeds threshold. Select a reason to continue.</div>
      <SLabel mt={0}>Reason Required</SLabel>
      {FLAG_REASONS.map(r => <Btn key={r} small variant={reason===r?"danger":"default"} onClick={() => setReason(r)}>{r}</Btn>)}
      <textarea rows={2} placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} style={{...ta,marginTop:8,marginBottom:12}}/>
      <Btn variant="danger" disabled={!reason} onClick={() => onSave({reason,notes})}>Acknowledge & Continue</Btn>
    </div>
  </ModalWrap>;
}

function Toggle({ on, onToggle, label, danger }) {
  return <div onClick={onToggle} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid "+BORDER,cursor:"pointer"}}>
    <span style={{fontSize:13,color:on&&danger?RED:TEXT}}>{label}</span>
    <div style={{width:42,height:22,background:on?(danger?RED:ORANGE):FAINT,borderRadius:11,position:"relative",transition:"background 0.2s",flexShrink:0}}>
      <div style={{position:"absolute",top:2,left:on?22:2,width:18,height:18,background:"#fff",borderRadius:9,transition:"left 0.2s"}}/>
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
  const ta = {width:"100%",background:CARD,border:"1px solid "+BORDER,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"10px 12px",borderRadius:6,outline:"none",resize:"none",boxSizing:"border-box",marginBottom:12};
  return <div>
    <SLabel mt={4}>Operating Condition</SLabel>
    {CONDITIONS.map(c => <Btn key={c} variant={condition===c?"active":"default"} onClick={() => setCondition(c)}>{c}</Btn>)}
    <Hr/>
    <div onClick={() => setEquipOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",padding:"4px 0",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:offlineCount>0?RED:ORANGE}}>Equipment Offline</span>
        {offlineCount>0&&<span style={{fontSize:11,fontWeight:700,background:"rgba(224,82,82,0.18)",color:RED,border:"1px solid rgba(224,82,82,0.35)",borderRadius:10,padding:"1px 8px"}}>{offlineCount} down</span>}
      </div>
      <span style={{color:MUTED,fontSize:14}}>{equipOpen?"▲":"▼"}</span>
    </div>
    {equipOpen&&<div style={{background:SURFACE,borderRadius:8,padding:"4px 12px",marginBottom:12,border:"1px solid "+BORDER}}>
      <div style={{fontSize:12,color:MUTED,padding:"10px 0 6px"}}>Tag anything down — attaches to all observations this session.</div>
      {equip.map(e => <Toggle key={e} on={offline[e]} onToggle={() => setOffline(p=>({...p,[e]:!p[e]}))} label={e} danger/>)}
    </div>}
    <Hr/>
    <SLabel>Session Notes</SLabel>
    <textarea rows={3} placeholder="Staffing, conditions, anything unusual..." value={notes} onChange={e => setNotes(e.target.value)} style={ta}/>
    <Btn variant="primary" disabled={!condition} onClick={() => condition&&onStart({condition,offline,notes,startTime:Date.now()})}>Start Session</Btn>
  </div>;
}

// ── Observer Tab ──────────────────────────────────────────
function ObserverTab({ side, nodes, settings }) {
  const [sessions, setSessions] = useStorage("sessions_"+side, []);
  const [activeSession, setActiveSession] = useState(null);
  const [pallet, setPallet] = useState(null);
  const [lockedLane, setLockedLane] = useState(null); // "A" or "B"
  const [lockedSC, setLockedSC] = useState(null);     // "sc5800" etc
  const [srmNumber, setSrmNumber] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [coldFlag, setColdFlag] = useState(null);
  const [slowFlag, setSlowFlag] = useState(null);
  const [srmPicker, setSrmPicker] = useState(false);
  const [view, setView] = useState("setup");
  const [errors, setErrors] = useState([]);          // [{start, end, note}]
  const [errorActive, setErrorActive] = useState(false);
  const [errorStart, setErrorStart] = useState(null);
  const [errorNote, setErrorNote] = useState("");
  const [errorTick, setErrorTick] = useState(0);
  useEffect(() => {
    if (!errorActive) return;
    const i = setInterval(() => setErrorTick(t => t+1), 1000);
    return () => clearInterval(i);
  }, [errorActive]);

  const laneMap = side === "DD" ? DD_LANE_MAP : FZ_LANE_MAP;

  // Get SRMs for the currently locked shuttle car
  const getSRMsForCurrentLane = () => {
    if (!lockedSC) return side === "DD" ? [11,12,13,14,15,16,17] : [1,2,3,4,5,6,7,8,9,10];
    // Try settings first, then defaults
    const settingsKey = "srm_" + lockedSC;
    if (settings[settingsKey]) {
      return settings[settingsKey].split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    }
    return DEFAULT_SRM_ASSIGNMENTS[lockedSC] || [];
  };

  const startError = () => {
    setErrorActive(true);
    setErrorStart(Date.now());
    setErrorNote("");
  };
  const stopError = () => {
    if (!errorStart) return;
    const err = { start: errorStart, end: Date.now(), duration: Date.now() - errorStart, note: errorNote };
    setErrors(prev => [...prev, err]);
    // Attach errors to pallet
    if (pallet) {
      setPallet(p => ({ ...p, errors: [...(p.errors||[]), err] }));
    }
    setErrorActive(false);
    setErrorStart(null);
    setErrorNote("");
  };

  const firstTs = useCallback(() => {
    if (!pallet||!Object.keys(pallet.taps).length) return null;
    return Math.min(...Object.values(pallet.taps));
  },[pallet]);

  const hasTap = (key) => !!(pallet&&pallet.taps[key]!==undefined);

  const getSegStr = (key) => {
    if (!pallet) return "";
    const entries = Object.entries(pallet.taps).sort((a,b)=>a[1]-b[1]);
    const idx = entries.findIndex(e=>e[0]===key);
    if (idx>0) return "+"+fmt(entries[idx][1]-entries[idx-1][1]);
    return "";
  };

  const conformityTapped = () => {
    if (!pallet) return false;
    return pallet.taps[side==="DD"?"dd_conformity":"fz_conformity"]!==undefined;
  };

  // Determine if a lane option is locked out
  const isLaneLocked = (optId) => {
    if (!lockedLane) return false;
    // VL options are never locked out — lane resets at conformity and re-locks when VL is tapped
    if (optId.startsWith("vl")) {
      const anyVLTapped = pallet && Object.keys(pallet.taps).some(k => k.startsWith("vl"));
      if (!anyVLTapped) return false; // no VL tapped yet — both VLs available
    }
    const optLane = laneMap[optId];
    return optLane && optLane !== lockedLane;
  };

  const doTap = (key, basePallet) => {
    const p = basePallet||pallet;
    const ts = Date.now();
    const prevEntries = Object.entries(p.taps).sort((a,b)=>a[1]-b[1]);
    const updated = {...p,taps:{...p.taps,[key]:ts}};
    // Lane lock logic:
    // - Tapping SG or AMTU locks the lane
    // - Tapping Conformity RESETS the lane lock (both VLs become available)
    // - Tapping a VL re-locks the lane for SC and SRM
    const nodeLane = laneMap[key];
    const conformityK = side === "DD" ? "dd_conformity" : "fz_conformity";
    if (key === conformityK) {
      setLockedLane(null); // free the lane at conformity
    } else if (nodeLane && key.startsWith("vl")) {
      setLockedLane(nodeLane); // re-lock once VL is chosen
    } else if (nodeLane && !lockedLane) {
      setLockedLane(nodeLane); // initial lock on SG/AMTU
    }
    // Lock SC if this is a shuttle car tap
    if (key.startsWith("sc")) setLockedSC(key);

    if (prevEntries.length>0) {
      const seg = ts-prevEntries[prevEntries.length-1][1];
      if (seg>20*60*1000) { setSlowFlag({key,seg,updated}); return; }
    }
    if ((key==="vl1800"||key==="vl1700")&&side==="FZ") {
      const start = Object.keys(p.taps).length>0?Math.min(...Object.values(p.taps)):ts;
      const elapsed = ts-start;
      const threshold = (Number(settings.coldChainMins)||30)*60*1000;
      if (elapsed>threshold) { setPallet(updated); setColdFlag({elapsed}); return; }
    }
    setPallet(updated);
  };

  const tapNode = (key, isSRM) => {
    if (isSRM) { setSrmPicker(true); return; }
    if (!pallet) { setConfirm({type:"newPallet",key}); return; }
    if (hasTap(key)) { setConfirm({type:"restart"}); return; }
    doTap(key);
  };

  const handleSRMSelect = (num) => {
    setSrmPicker(false);
    setSrmNumber(num);
    const ts = Date.now();
    const updated = pallet
      ? {...pallet,taps:{...pallet.taps,srm:ts}}
      : {id:"PENDING",taps:{srm:ts},rejected:false,coldChainFlag:null,complete:false};
    setPallet(updated);
  };

  const startPallet = (thenKey) => {
    const p = {id:"PENDING",taps:{},rejected:false,coldChainFlag:null,complete:false,errors:[]};
    setLockedLane(null);
    setLockedSC(null);
    setSrmNumber(null);
    setErrors([]);
    setErrorActive(false);
    setErrorStart(null);
    if (thenKey) {
      const nodeLane = laneMap[thenKey];
      if (nodeLane) setLockedLane(nodeLane);
      setPallet({...p,taps:{[thenKey]:Date.now()}});
    } else {
      setPallet(p);
    }
  };

  const savePallet = (p, srm) => {
    const seq = incrementDailyCount(side);
    const finalId = buildPalletId(side,p.taps,srm,seq);
    const final = {...p,id:finalId,srmNumber:srm};
    const s = {...activeSession,pallets:[...(activeSession.pallets||[]),final]};
    setActiveSession(s);
    setSessions(prev => { const idx=prev.findIndex(x=>x.id===s.id); if(idx>=0){const n=[...prev];n[idx]=s;return n;} return [...prev,s]; });
    setPallet(null); setLockedLane(null); setLockedSC(null); setSrmNumber(null);
  };

  const completePallet = () => savePallet({...pallet,complete:true,endTime:Date.now()},srmNumber);
  const rejectPallet   = () => savePallet({...pallet,rejected:true,complete:true,endTime:Date.now()},srmNumber);
  const endSession = () => {
    const s = {...activeSession,endTime:Date.now()};
    setSessions(prev => { const idx=prev.findIndex(x=>x.id===s.id); if(idx>=0){const n=[...prev];n[idx]=s;return n;} return [...prev,s]; });
    setActiveSession(null); setPallet(null); setLockedLane(null); setLockedSC(null); setView("setup");
  };

  if (view==="setup") return <div>
    <SessionSetup side={side} onStart={(cfg) => { setActiveSession({id:"S"+Date.now().toString(36).toUpperCase().slice(-5),side,...cfg,pallets:[]}); setView("observer"); }}/>
    {sessions.length>0&&<><Hr/><SLabel>Recent Sessions</SLabel>
      {sessions.slice(-3).reverse().map(s => <Card key={s.id}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:13,fontWeight:700,color:ORANGE2}}>{s.id}</span>
          <span style={{fontSize:11,color:MUTED}}>{new Date(s.startTime).toLocaleDateString()}</span>
        </div>
        <div style={{fontSize:12,color:MUTED}}>{s.condition} · {s.pallets?.length||0} pallets</div>
      </Card>)}
    </>}
  </div>;

  return <div>
    {confirm?.type==="newPallet"&&<Confirm title="Start New Pallet?" body="Begin timing a new pallet from this node." yesLabel="Start Pallet"
      onYes={() => { startPallet(confirm.key); setConfirm(null); }} onNo={() => setConfirm(null)}/>}
    {confirm?.type==="restart"&&<Confirm title="Already Tapped" body="This node was already recorded. Save current pallet and start fresh?" yesLabel="Save & New Pallet" dangerNo
      onYes={() => { completePallet(); startPallet(); setConfirm(null); }} onNo={() => setConfirm(null)}/>}
    {coldFlag&&<ColdFlagModal elapsed={coldFlag.elapsed} onSave={(data) => { setPallet(p=>({...p,coldChainFlag:data})); setColdFlag(null); }}/>}
    {slowFlag&&<Confirm title="Unusual Segment Time" body={"That segment was "+fmt(slowFlag.seg)+". Keep or discard?"} yesLabel="Keep It" noLabel="Delete It" dangerNo
      onYes={() => { setPallet(slowFlag.updated); setSlowFlag(null); }} onNo={() => setSlowFlag(null)}/>}
    {srmPicker&&<SRMPicker srms={getSRMsForCurrentLane()} onSelect={handleSRMSelect} onCancel={() => setSrmPicker(false)}/>}

    <div style={{background:SURFACE,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:ORANGE}}>{side==="DD"?"Dairy / Deli":"Freezer"}</div>
        <div style={{fontSize:12,color:MUTED,marginTop:2}}>{activeSession?.condition} · {activeSession?.pallets?.length||0} pallets
          {lockedLane&&<span style={{color:ORANGE2,marginLeft:8}}>Lane {lockedLane}</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {pallet&&Object.keys(pallet.taps).length>0&&<LiveTimer startTs={firstTs()}/>}
        <Btn variant="ghost" small onClick={endSession} style={{width:"auto",padding:"8px 14px",marginBottom:0}}>End</Btn>
      </div>
    </div>

    {!pallet&&<Btn variant="primary" onClick={() => startPallet()}>+ New Pallet</Btn>}

    {pallet&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <Chip label={pallet.id==="PENDING"?(side==="FZ"?"F":"D")+" · In Progress":pallet.id} color="orange"/>
          {srmNumber&&<Chip label={"SRM "+srmNumber} color="blue"/>}
          {pallet.coldChainFlag&&<Chip label="Cold Flag" color="red"/>}
          {errors.length>0&&<Chip label={errors.length+" error"+(errors.length>1?"s":"")} color="red"/>}
        </div>
        {conformityTapped()&&<Btn variant="danger" small onClick={rejectPallet} style={{width:"auto",padding:"6px 14px",marginBottom:0}}>Reject</Btn>}
      </div>

      {/* Error timer */}
      {errorActive
        ? <div style={{background:"rgba(224,82,82,0.12)",border:"2px solid "+RED,borderRadius:8,padding:"10px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:RED}}>⚠ Error Timer Running</div>
                <div style={{fontSize:22,fontWeight:700,color:RED,fontFamily:"monospace"}}>{fmt(errorStart?Date.now()-errorStart:0)}</div>
              </div>
              <button onClick={stopError} style={{background:RED,color:"#fff",border:"none",borderRadius:8,padding:"12px 16px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Clear Error</button>
            </div>
            <input type="text" placeholder="Optional note..." value={errorNote} onChange={e=>setErrorNote(e.target.value)}
              style={{width:"100%",background:"rgba(0,0,0,0.2)",border:"1px solid rgba(224,82,82,0.4)",color:TEXT,fontFamily:"inherit",fontSize:12,padding:"8px 10px",borderRadius:6,outline:"none",boxSizing:"border-box"}}/>
          </div>
        : <button onClick={startError} style={{display:"block",width:"100%",background:"transparent",border:"1px solid "+RED,color:RED,borderRadius:8,padding:"10px 12px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",textAlign:"center",marginBottom:12,letterSpacing:0.5}}>
            + Log Error {errors.length>0&&"("+errors.length+" logged)"}
          </button>
      }
      {errors.length>0&&!errorActive&&<div style={{marginBottom:12}}>
        {errors.map((e,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MUTED,padding:"4px 0",borderBottom:"1px solid "+BORDER}}>
          <span>Error {i+1}{e.note?" — "+e.note:""}</span>
          <span style={{color:RED,fontWeight:700}}>{fmt(e.duration)}</span>
        </div>)}
      </div>}

      {nodes.map((node,idx) => {
        const arrow = idx>0&&<div style={{textAlign:"center",color:FAINT,fontSize:13,margin:"-2px 0 4px"}}>↓</div>;

        if (node.isSRM) {
          const srmTapped = hasTap("srm");
          const isNext = !srmTapped&&(()=>{const prev=nodes[idx-1];if(!prev)return true;if(prev.isLaneSplit)return prev.options.some(o=>hasTap(o.id));return hasTap(prev.id);})();
          return <div key={node.id}>
            {arrow}
            <NodeBtn state={srmTapped?"tapped":isNext?"current":"default"} onClick={() => tapNode("srm",true)}>
              <div>{srmTapped?"SRM "+srmNumber+" ✓":"SRM"}</div>
              {srmTapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400,marginTop:4}}>{fmtTime(pallet.taps.srm)}</div>}
              {srmTapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400}}>{getSegStr("srm")}</div>}
            </NodeBtn>
          </div>;
        }

        if (node.isLaneSplit) return <div key={node.id}>
          {arrow}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {node.options.map(opt => {
              const tapped = hasTap(opt.id);
              const locked = isLaneLocked(opt.id);
              return <NodeBtn key={opt.id} state={tapped?"tapped":locked?"locked":"default"}
                disabled={locked} onClick={() => { if(tapped||locked)return; tapNode(opt.id,false); }}>
                <div>{opt.label}</div>
                {tapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400,marginTop:4}}>{fmtTime(pallet.taps[opt.id])}</div>}
                {tapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400}}>{getSegStr(opt.id)}</div>}
                {locked&&<div style={{fontSize:10,color:FAINT,marginTop:4}}>locked</div>}
              </NodeBtn>;
            })}
          </div>
        </div>;

        const tapped = hasTap(node.id);
        const isNext = !tapped&&(idx===0||(()=>{const prev=nodes[idx-1];if(!prev)return true;if(prev.isLaneSplit)return prev.options.some(o=>hasTap(o.id));return hasTap(prev.id);})());
        return <div key={node.id}>
          {arrow}
          <NodeBtn state={tapped?"tapped":isNext?"current":"default"} onClick={() => tapNode(node.id,false)}>
            <div>{node.label}</div>
            {tapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400,marginTop:4}}>{fmtTime(pallet.taps[node.id])}</div>}
            {tapped&&<div style={{fontSize:11,color:GREEN,fontWeight:400}}>{getSegStr(node.id)}</div>}
          </NodeBtn>
        </div>;
      })}

      <div style={{marginTop:12}}>
        <Btn variant="success" onClick={completePallet}>Complete Observation</Btn>
        <Btn variant="ghost" small onClick={() => { setPallet(null); setLockedLane(null); setLockedSC(null); setSrmNumber(null); setErrors([]); setErrorActive(false); }}>Cancel / Discard</Btn>
      </div>
    </>}
    <div style={{height:24}}/>
  </div>;
}

// ── Man Hour Card ─────────────────────────────────────────
function ManHourCard({ people, elapsedMs, palletCount, label }) {
  if (!people||!elapsedMs||elapsedMs<=0) return null;
  const hrs = elapsedMs/3600000;
  const manHrs = Number(people)*hrs;
  const perPallet = palletCount>0?manHrs/palletCount:null;
  return <div style={{background:"rgba(76,175,125,0.07)",border:"1px solid "+GREEN2,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:GREEN,marginBottom:12}}>{label}</div>
    <StatPair
      left={{label:"Man-Hrs Total",value:manHrs.toFixed(2),color:GREEN}}
      right={{label:"Per Pallet",value:perPallet?perPallet.toFixed(3):"--",color:perPallet?ORANGE2:MUTED}}
    />
    <div style={{fontSize:11,color:MUTED}}>{people} people · {fmt(elapsedMs)} · {palletCount} pallets</div>
  </div>;
}

// ── FDD Receiving Tab ─────────────────────────────────────
function UnloadingTab({ settings }) {
  const [sessions,setSessions] = useStorage("dock_sessions",[]);
  const [mode,setMode] = useState(null);
  const [meta,setMeta] = useState({side:"FZ",door:"",people:"2",induct:"SG 1300",desc:""});
  const [batch,setBatch] = useState(Array(5).fill(null).map((_,i)=>({id:i+1,floorTs:null,inductTs:null})));
  const [single,setSingle] = useState({floor:null,induct:null});
  const [batchStart,setBatchStart] = useState(null);
  const [now,setNow] = useState(Date.now());
  const [crewGaps,setCrewGaps] = useState([]);
  const [gapActive,setGapActive] = useState(false);
  const [gapStart,setGapStart] = useState(null);
  useEffect(()=>{const i=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(i);},[]);

  const startGap = () => { setGapActive(true); setGapStart(Date.now()); };
  const stopGap  = () => {
    if (!gapStart) return;
    setCrewGaps(prev => [...prev, {start:gapStart,end:Date.now(),duration:Date.now()-gapStart}]);
    setGapActive(false); setGapStart(null);
  };
  const totalGapTime = crewGaps.reduce((a,g)=>a+g.duration,0);

  const INDUCT = {FZ:["SG 1300","SG 1100"],DD:["SG 4300","SG 4100"]};
  const completedBatch = batch.filter(p=>p.floorTs&&p.inductTs);
  const batchElapsed = batchStart?now-batchStart:0;
  const ta  = {width:"100%",background:CARD,border:"1px solid "+BORDER,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"10px 12px",borderRadius:6,outline:"none",resize:"none",boxSizing:"border-box",marginBottom:12};
  const inp = {width:"100%",background:CARD,border:"1px solid "+BORDER,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"10px 12px",borderRadius:6,outline:"none",marginBottom:8,boxSizing:"border-box"};

  const saveSession = () => {
    const sessionElapsed = mode==="batch"&&batchStart?Date.now()-batchStart:(single.induct&&single.floor?single.induct-single.floor:0);
    const palletCount = mode==="batch"?completedBatch.length:1;
    const manHrsTotal = (Number(meta.people)*sessionElapsed)/3600000;
    const manHrsPerPallet = palletCount>0?manHrsTotal/palletCount:null;
    setSessions(p=>[...p,{id:"DK"+Date.now().toString(36).toUpperCase().slice(-5),ts:Date.now(),meta,mode,
      data:mode==="single"?single:batch.filter(p=>p.floorTs||p.inductTs),
      sessionElapsed,palletCount,manHrsTotal,manHrsPerPallet,
      crewGaps,totalGapTime:crewGaps.reduce((a,g)=>a+g.duration,0)}]);
    setMode(null); setSingle({floor:null,induct:null});
    setBatch(Array(5).fill(null).map((_,i)=>({id:i+1,floorTs:null,inductTs:null})));
    setBatchStart(null); setMeta({side:"FZ",door:"",people:"2",induct:"SG 1300",desc:""});
    setCrewGaps([]); setGapActive(false); setGapStart(null);
  };

  if (!mode) return <div>
    <SLabel mt={4}>Side</SLabel>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
      {["FZ","DD"].map(s=><Btn key={s} small variant={meta.side===s?"active":"default"} onClick={()=>setMeta(p=>({...p,side:s,induct:INDUCT[s][0]}))}>{s==="FZ"?"Freezer":"Dairy / Deli"}</Btn>)}
    </div>
    <SLabel>Door #</SLabel>
    <input style={inp} type="text" placeholder="Door number..." value={meta.door} onChange={e=>setMeta(p=>({...p,door:e.target.value}))}/>
    <SLabel>People Unloading</SLabel>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:4}}>
      {["1","2","3","4","5"].map(n=><Btn key={n} small variant={meta.people===n?"active":"default"} onClick={()=>setMeta(p=>({...p,people:n}))} style={{marginBottom:0,padding:"12px 4px"}}>{n}</Btn>)}
    </div>
    <SLabel>Induction Point</SLabel>
    {(INDUCT[meta.side]||[]).map(o=><Btn key={o} small variant={meta.induct===o?"active":"default"} onClick={()=>setMeta(p=>({...p,induct:o}))}>{o}</Btn>)}
    <Hr/>
    <Btn variant="primary" onClick={()=>setMode("single")}>Single Pallet</Btn>
    <Btn variant="outline" onClick={()=>setMode("batch")}>Batch Mode — up to 5</Btn>
    {sessions.length>0&&<><Hr/><SLabel>Recent Sessions</SLabel>
      {sessions.slice(-3).reverse().map(s=><Card key={s.id}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:13,fontWeight:700,color:ORANGE2}}>{s.id}</span>
          <Chip label={s.meta.side} color={s.meta.side==="FZ"?"blue":"orange"}/>
        </div>
        <div style={{fontSize:12,color:MUTED}}>Door {s.meta.door} · {s.meta.people} people · {s.palletCount} pallets</div>
        {s.manHrsPerPallet!=null&&<div style={{fontSize:12,color:GREEN,marginTop:4}}>{s.manHrsPerPallet.toFixed(3)} man-hrs/pallet</div>}
      </Card>)}
    </>}
  </div>;

  if (mode==="single") return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{display:"flex",gap:6}}>
        <Chip label="Single" color="orange"/>
        <Chip label={meta.side+" · Door "+(meta.door||"?")+" · "+meta.people+"p"} color="faint"/>
      </div>
      <Btn variant="ghost" small onClick={()=>setMode(null)} style={{width:"auto",padding:"6px 12px",marginBottom:0}}>Back</Btn>
    </div>
    {single.floor&&single.induct&&<ManHourCard people={meta.people} elapsedMs={single.induct-single.floor} palletCount={1} label="Results"/>}
    {single.floor&&!single.induct&&<div style={{textAlign:"center",padding:"8px 0 16px"}}>
      <div style={{fontSize:11,color:MUTED,marginBottom:4}}>ELAPSED</div>
      <div style={{fontSize:32,fontWeight:700,color:ORANGE2}}>{fmt(now-single.floor)}</div>
    </div>}
    <NodeBtn state={single.floor?"tapped":"current"} onClick={()=>setSingle(p=>({...p,floor:p.floor||Date.now()}))}>
      {single.floor?"Floor ✓   "+fmtTime(single.floor):"Tap — Floor Hit"}
    </NodeBtn>
    <div style={{textAlign:"center",color:FAINT,fontSize:13,margin:"-2px 0 4px"}}>↓</div>
    <NodeBtn state={single.induct?"tapped":single.floor?"current":"default"} onClick={()=>single.floor&&setSingle(p=>({...p,induct:p.induct||Date.now()}))}>
      {single.induct?"Induct ✓   "+fmtTime(single.induct):"Tap — Induction"}
    </NodeBtn>
    {single.floor&&single.induct&&<><Hr/>
      <SLabel>Load Description</SLabel>
      <textarea rows={2} placeholder="Enter after unloading..." value={meta.desc} onChange={e=>setMeta(p=>({...p,desc:e.target.value}))} style={ta}/>
      <Btn variant="primary" onClick={saveSession}>Save Session</Btn>
    </>}
    <Hr/>
    <SLabel>Crew Gaps</SLabel>
    {gapActive
      ? <div style={{background:"rgba(224,82,82,0.12)",border:"2px solid "+RED,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:RED,textTransform:"uppercase",letterSpacing:1}}>Crew Gone</div>
              <div style={{fontSize:22,fontWeight:700,color:RED,fontFamily:"monospace"}}>{fmt(gapStart?now-gapStart:0)}</div>
            </div>
            <button onClick={stopGap} style={{background:GREEN2,color:"#fff",border:"none",borderRadius:8,padding:"12px 16px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Crew Back</button>
          </div>
        </div>
      : <button onClick={startGap} style={{display:"block",width:"100%",background:"transparent",border:"1px solid "+RED,color:RED,borderRadius:8,padding:"10px 12px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",textAlign:"center",marginBottom:8}}>
          + Crew Left {crewGaps.length>0&&"("+crewGaps.length+" gap"+(crewGaps.length>1?"s":"")+", "+fmt(totalGapTime)+" total)"}
        </button>
    }
    {crewGaps.map((g,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MUTED,padding:"4px 0",borderBottom:"1px solid "+BORDER}}>
      <span>Gap {i+1} — {new Date(g.start).toLocaleTimeString()}</span>
      <span style={{color:RED,fontWeight:700}}>{fmt(g.duration)}</span>
    </div>)}
  </div>;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{display:"flex",gap:6}}>
        <Chip label="Batch" color="orange"/>
        <Chip label={meta.side+" · Door "+(meta.door||"?")+" · "+meta.people+"p"} color="faint"/>
      </div>
      <Btn variant="ghost" small onClick={()=>setMode(null)} style={{width:"auto",padding:"6px 12px",marginBottom:0}}>Back</Btn>
    </div>
    {batchStart&&<ManHourCard people={meta.people} elapsedMs={batchElapsed} palletCount={completedBatch.length} label="Live Metrics"/>}
    {batch.map((p,i)=><Card key={p.id}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:700,color:TEXT}}>Pallet {p.id}</span>
        {p.floorTs&&p.inductTs&&<span style={{fontSize:13,fontWeight:700,color:GREEN}}>{fmt(p.inductTs-p.floorTs)}</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Btn small variant={p.floorTs?"success":"primary"} style={{marginBottom:0}}
          onClick={()=>{if(!batchStart)setBatchStart(Date.now());setBatch(prev=>{const n=[...prev];n[i]={...n[i],floorTs:n[i].floorTs||Date.now()};return n;});}}>
          {p.floorTs?"Floor ✓":"Floor"}
        </Btn>
        <Btn small variant={p.inductTs?"success":p.floorTs?"primary":"ghost"} disabled={!p.floorTs} style={{marginBottom:0}}
          onClick={()=>p.floorTs&&setBatch(prev=>{const n=[...prev];n[i]={...n[i],inductTs:n[i].inductTs||Date.now()};return n;})}>
          {p.inductTs?"Induct ✓":"Induct"}
        </Btn>
      </div>
    </Card>)}
    <Hr/>
    {completedBatch.length>0&&batchStart&&<ManHourCard people={meta.people} elapsedMs={Date.now()-batchStart} palletCount={completedBatch.length} label="Session Summary"/>}
    <SLabel>Crew Gaps</SLabel>
    {gapActive
      ? <div style={{background:"rgba(224,82,82,0.12)",border:"2px solid "+RED,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:RED,textTransform:"uppercase",letterSpacing:1}}>Crew Gone</div>
              <div style={{fontSize:22,fontWeight:700,color:RED,fontFamily:"monospace"}}>{fmt(gapStart?now-gapStart:0)}</div>
            </div>
            <button onClick={stopGap} style={{background:GREEN2,color:"#fff",border:"none",borderRadius:8,padding:"12px 16px",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Crew Back</button>
          </div>
        </div>
      : <button onClick={startGap} style={{display:"block",width:"100%",background:"transparent",border:"1px solid "+RED,color:RED,borderRadius:8,padding:"10px 12px",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",textAlign:"center",marginBottom:8}}>
          + Crew Left {crewGaps.length>0&&"("+crewGaps.length+" gap"+(crewGaps.length>1?"s":"")+", "+fmt(totalGapTime)+" total)"}
        </button>
    }
    {crewGaps.map((g,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MUTED,padding:"4px 0",borderBottom:"1px solid "+BORDER}}>
      <span>Gap {i+1} — {new Date(g.start).toLocaleTimeString()}</span>
      <span style={{color:RED,fontWeight:700}}>{fmt(g.duration)}</span>
    </div>)}
    <Hr/>
    <SLabel>Load Description</SLabel>
    <textarea rows={2} placeholder="Enter after unloading..." value={meta.desc} onChange={e=>setMeta(p=>({...p,desc:e.target.value}))} style={ta}/>
    <Btn variant="primary" onClick={saveSession}>Save Session</Btn>
  </div>;
}

// ── History / Log Tab ─────────────────────────────────────
function HistoryTab() {
  const [ddSessions,setDdSessions] = useStorage("sessions_DD",[]);
  const [fzSessions,setFzSessions] = useStorage("sessions_FZ",[]);
  const [dockSessions,setDockSessions] = useStorage("dock_sessions",[]);
  const [confirmDelete,setConfirmDelete] = useState(null);
  const [activeTab,setActiveTab] = useState("sessions");

  const totalTime = (p)=>{const v=Object.values(p.taps||{});return v.length<2?null:Math.max(...v)-Math.min(...v);};

  const allSessions = [
    ...ddSessions.map(s=>({...s,sideLabel:"DD"})),
    ...fzSessions.map(s=>({...s,sideLabel:"FZ"})),
  ].sort((a,b)=>(b.startTime||0)-(a.startTime||0));

  const deleteSession = (session) => {
    if (session.sideLabel==="DD") setDdSessions(prev=>prev.filter(s=>s.id!==session.id));
    else setFzSessions(prev=>prev.filter(s=>s.id!==session.id));
    setConfirmDelete(null);
  };
  const deletePallet = (session, palletId) => {
    const updater = prev=>prev.map(s=>s.id===session.id?{...s,pallets:s.pallets.filter(p=>p.id!==palletId)}:s);
    if (session.sideLabel==="DD") setDdSessions(updater); else setFzSessions(updater);
    setConfirmDelete(null);
  };
  const deleteDockSession = (id) => { setDockSessions(prev=>prev.filter(s=>s.id!==id)); setConfirmDelete(null); };

  return <div>
    {confirmDelete?.type==="session"&&<Confirm title="Delete Session?"
      body={"Permanently delete session "+confirmDelete.session.id+" and all "+(confirmDelete.session.pallets?.length||0)+" pallets?"}
      yesLabel="Delete Session" noLabel="Cancel"
      onYes={()=>deleteSession(confirmDelete.session)} onNo={()=>setConfirmDelete(null)}/>}
    {confirmDelete?.type==="pallet"&&<Confirm title="Delete Pallet?"
      body={"Permanently delete observation "+confirmDelete.palletId+"?"}
      yesLabel="Delete Pallet" noLabel="Cancel"
      onYes={()=>deletePallet(confirmDelete.session,confirmDelete.palletId)} onNo={()=>setConfirmDelete(null)}/>}
    {confirmDelete?.type==="dock"&&<Confirm title="Delete Dock Session?"
      body={"Permanently delete session "+confirmDelete.id+"?"}
      yesLabel="Delete" noLabel="Cancel"
      onYes={()=>deleteDockSession(confirmDelete.id)} onNo={()=>setConfirmDelete(null)}/>}

    <div style={{display:"flex",gap:6,marginTop:16,marginBottom:16}}>
      {["sessions","dock"].map(t=>(
        <button key={t} onClick={()=>setActiveTab(t)} style={{padding:"8px 18px",fontSize:12,fontWeight:700,fontFamily:"inherit",borderRadius:6,cursor:"pointer",
          border:"1px solid "+(activeTab===t?ORANGE:BORDER),background:activeTab===t?"rgba(232,118,10,0.15)":CARD,color:activeTab===t?ORANGE2:MUTED}}>
          {t==="sessions"?"Observer Sessions":"FDD Receiving"}
        </button>
      ))}
    </div>

    {activeTab==="sessions"&&<>
      <SLabel mt={0}>Sessions ({allSessions.length})</SLabel>
      {allSessions.length===0&&<div style={{color:MUTED,fontSize:13,padding:"24px 0",textAlign:"center"}}>No sessions yet.</div>}
      {allSessions.map(s=>(
        <Card key={s.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <Chip label={s.sideLabel} color={s.sideLabel==="DD"?"orange":"blue"}/>
              <span style={{fontSize:12,fontWeight:700,color:ORANGE2}}>{s.id}</span>
            </div>
            <Btn variant="danger" small onClick={()=>setConfirmDelete({type:"session",session:s})}
              style={{width:"auto",padding:"4px 10px",marginBottom:0,fontSize:11}}>Delete Session</Btn>
          </div>
          <div style={{fontSize:12,color:MUTED,marginBottom:8}}>{s.condition} · {s.pallets?.length||0} pallets · {new Date(s.startTime).toLocaleDateString()}</div>
          {s.pallets?.map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 10px",background:SURFACE,borderRadius:6,marginBottom:4}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TEXT}}>{p.id}</div>
                <div style={{fontSize:10,color:MUTED}}>{Object.keys(p.taps||{}).length} nodes · {fmt(totalTime(p))}{p.rejected?" · REJECTED":""}{p.coldChainFlag?" · COLD FLAG":""}</div>
              </div>
              <button onClick={()=>setConfirmDelete({type:"pallet",session:s,palletId:p.id})}
                style={{background:"transparent",border:"1px solid "+BORDER,color:MUTED,fontSize:10,fontWeight:700,padding:"4px 8px",borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>
                Delete
              </button>
            </div>
          ))}
        </Card>
      ))}
    </>}

    {activeTab==="dock"&&<>
      <SLabel mt={0}>FDD Receiving Sessions ({dockSessions.length})</SLabel>
      {dockSessions.length===0&&<div style={{color:MUTED,fontSize:13,padding:"12px 0"}}>No sessions yet.</div>}
      {dockSessions.slice().reverse().map(s=>(
        <Card key={s.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <Chip label={s.meta.side} color={s.meta.side==="FZ"?"blue":"orange"}/>
              <span style={{fontSize:13,fontWeight:700,color:ORANGE2}}>{s.id}</span>
            </div>
            <Btn variant="danger" small onClick={()=>setConfirmDelete({type:"dock",id:s.id})}
              style={{width:"auto",padding:"4px 10px",marginBottom:0,fontSize:11}}>Delete</Btn>
          </div>
          <div style={{fontSize:12,color:MUTED}}>Door {s.meta.door} · {s.meta.people} people · {s.palletCount} pallets</div>
          {s.manHrsPerPallet!=null&&<div style={{fontSize:12,color:GREEN,marginTop:4}}>{s.manHrsPerPallet.toFixed(3)} man-hrs/pallet · {s.manHrsTotal?.toFixed(2)} total</div>}
          {s.meta.desc&&<div style={{fontSize:11,color:FAINT,marginTop:4}}>{s.meta.desc}</div>}
        </Card>
      ))}
    </>}
    <div style={{height:24}}/>
  </div>;
}

// ── Segment Bar ───────────────────────────────────────────
function SegmentBar({ label, avgMs, minMs, maxMs, barMax, count, isMax }) {
  const pct = barMax>0?(avgMs/barMax)*100:0;
  const fmtSeg = (ms) => ms?(ms/60000).toFixed(2)+" min":"--";
  return <div style={{marginBottom:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
      <span style={{fontSize:12,fontWeight:700,color:isMax?RED:TEXT}}>{label}</span>
      <span style={{fontSize:11,color:MUTED}}>{count} obs</span>
    </div>
    <div style={{height:6,background:BORDER,borderRadius:3,marginBottom:6}}>
      <div style={{height:6,width:pct+"%",background:isMax?RED:ORANGE,borderRadius:3,transition:"width 0.3s"}}/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
      <div style={{background:SURFACE,borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
        <div style={{fontSize:9,color:MUTED,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Min</div>
        <div style={{fontSize:13,fontWeight:700,color:GREEN}}>{fmtSeg(minMs)}</div>
      </div>
      <div style={{background:SURFACE,borderRadius:6,padding:"6px 8px",textAlign:"center",border:"1px solid "+(isMax?RED:ORANGE)}}>
        <div style={{fontSize:9,color:MUTED,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Avg</div>
        <div style={{fontSize:13,fontWeight:700,color:isMax?RED:ORANGE2}}>{fmtSeg(avgMs)}</div>
      </div>
      <div style={{background:SURFACE,borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
        <div style={{fontSize:9,color:MUTED,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Max</div>
        <div style={{fontSize:13,fontWeight:700,color:RED}}>{fmtSeg(maxMs)}</div>
      </div>
    </div>
  </div>;
}

// ── Summary Tab ───────────────────────────────────────────
function SummaryTab() {
  const [ddSessions] = useStorage("sessions_DD",[]);
  const [fzSessions] = useStorage("sessions_FZ",[]);
  const [dockSessions] = useStorage("dock_sessions",[]);
  const [sideView,setSideView] = useState("DD");
  const [jonahMode,setJonahMode] = useState(null);
  const [jonahScope,setJonahScope] = useState(null);
  const [jonahResponse,setJonahResponse] = useState(null);
  const [jonahLoading,setJonahLoading] = useState(false);
  const [jonahError,setJonahError] = useState(null);

  const ddPallets = ddSessions.flatMap(s=>s.pallets.map(p=>({...p,side:"DD",condition:s.condition,sessionId:s.id,offlineEquip:s.offline||{}})));
  const fzPallets = fzSessions.flatMap(s=>s.pallets.map(p=>({...p,side:"FZ",condition:s.condition,sessionId:s.id,offlineEquip:s.offline||{}})));
  const allPallets = [...ddPallets,...fzPallets];

  const totalTime = (p)=>{const v=Object.values(p.taps||{});return v.length<2?null:Math.max(...v)-Math.min(...v);};
  const avg = (arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  const fmtMin = (ms)=>ms?(ms/60000).toFixed(1)+" min":"--";

  const activePallets = sideView==="DD"?ddPallets:fzPallets;
  const segments = sideView==="DD"?DD_SEGMENTS:FZ_SEGMENTS;

  const segData = segments.map(seg=>{
    const times = activePallets.map(p=>getSegmentTime(p.taps||{},seg.from,seg.to)).filter(t=>t!==null&&t>0);
    return {...seg,times,avg:avg(times),count:times.length};
  }).filter(s=>s.count>0);

  const maxAvg = segData.length?Math.max(...segData.map(s=>s.avg||0)):0;

  const srmMap = {};
  activePallets.forEach(p=>{
    if (!p.srmNumber) return;
    const k="SRM "+p.srmNumber;
    if (!srmMap[k]) srmMap[k]={count:0,times:[]};
    srmMap[k].count++;
    const t=totalTime(p);
    if (t) srmMap[k].times.push(t);
  });

  const coldFlags = allPallets.filter(p=>p.coldChainFlag).length;
  const rejected  = allPallets.filter(p=>p.rejected).length;
  const totalManHrs = dockSessions.reduce((a,s)=>a+(s.manHrsTotal||0),0);
  const mhpp = dockSessions.filter(s=>s.manHrsPerPallet).map(s=>s.manHrsPerPallet);

  const allSessions = [
    ...ddSessions.map(s=>({...s,sideLabel:"DD"})),
    ...fzSessions.map(s=>({...s,sideLabel:"FZ"})),
  ].sort((a,b)=>(b.startTime||0)-(a.startTime||0));
  const allPalletsFlat = allSessions.flatMap(s=>(s.pallets||[]).map(p=>({...p,side:s.sideLabel})));

  const SYSTEM_CONTEXT = `You are Jonah, the expert from the Theory of Constraints. You observe warehouse mechanized conveyor systems and help find constraints using the Socratic method — you ask pointed questions and share observations, you do not give direct orders.

CRITICAL SYSTEM FACTS you must always respect:
- This warehouse has TWO completely independent mechanized systems: Dairy/Deli (DD) and Freezer (FZ)
- DD and FZ do NOT interact in any way — no shared equipment, no crossover, no causal relationship whatsoever
- A constraint or issue on FZ has ZERO effect on DD performance and vice versa — never suggest otherwise
- Each side has its own: Induction (SG lanes), AMTU, Conformity check, VL vertical lifts, SC shuttle cars, and SRMs (Storage/Retrieval Machines)
- DD SRMs are numbered 11-17. SRM 14 is shared between DD shuttle cars SC 5800 (serves SRMs 15,16,17,14) and SC 5700 (serves SRMs 11,12,13,14)
- FZ SRMs are numbered 1-10. SRM 5 is shared between FZ shuttle cars SC 2800 (serves SRMs 6,7,8,9,10,5) and SC 2700 (serves SRMs 1,2,3,4,5)
- Pallet flow: Floor → SG induction → AMTU → Conformity → VL → SC shuttle → SRM
- Once a pallet enters a lane (e.g. SG 4300), it stays in that lane through AMTU. At Conformity it can go to either VL. Once a VL is chosen, the SC and SRM options are locked to that lane.

Speak in Jonah's voice: direct, curious, Socratic. Point at the data. Ask what the observer actually sees. Surface the constraint. Times are in minutes.`;

  const fmtSeg = (ms)=>ms!=null?(ms/60000).toFixed(2)+" min":"no data";
  const fmtAvg = (arr)=>arr.length?(arr.reduce((a,b)=>a+b,0)/arr.length/60000).toFixed(2)+" min":"no data";

  const buildDataPackage = (mode, scope) => {
    if (mode==="overall") {
      const ddSegs = DD_SEGMENTS.map(seg=>{
        const times=ddPallets.map(p=>getSegmentTime(p.taps||{},seg.from,seg.to)).filter(t=>t&&t>0);
        return seg.label+": avg="+fmtAvg(times)+" min="+fmtSeg(times.length?Math.min(...times):null)+" max="+fmtSeg(times.length?Math.max(...times):null)+" n="+times.length;
      });
      const fzSegs = FZ_SEGMENTS.map(seg=>{
        const times=fzPallets.map(p=>getSegmentTime(p.taps||{},seg.from,seg.to)).filter(t=>t&&t>0);
        return seg.label+": avg="+fmtAvg(times)+" min="+fmtSeg(times.length?Math.min(...times):null)+" max="+fmtSeg(times.length?Math.max(...times):null)+" n="+times.length;
      });
      const srmDD={};ddPallets.forEach(p=>{if(!p.srmNumber)return;const k="SRM "+p.srmNumber;if(!srmDD[k])srmDD[k]={count:0,times:[]};srmDD[k].count++;const t=totalTime(p);if(t)srmDD[k].times.push(t);});
      const srmFZ={};fzPallets.forEach(p=>{if(!p.srmNumber)return;const k="SRM "+p.srmNumber;if(!srmFZ[k])srmFZ[k]={count:0,times:[]};srmFZ[k].count++;const t=totalTime(p);if(t)srmFZ[k].times.push(t);});
      const ddTimes=ddPallets.map(p=>totalTime(p)).filter(Boolean);
      const fzTimes=fzPallets.map(p=>totalTime(p)).filter(Boolean);
      return "OVERALL SYSTEM ANALYSIS\n\nDAIRY/DELI (independent system):\nTotal: "+ddPallets.length+" pallets | Avg full transit: "+fmtAvg(ddTimes)+"\nCold flags: "+ddPallets.filter(p=>p.coldChainFlag).length+" | Rejections: "+ddPallets.filter(p=>p.rejected).length+"\nSegments: "+ddSegs.join(" | ")+"\nSRM distribution: "+Object.entries(srmDD).map(([k,v])=>k+": "+v.count+" pallets avg "+fmtAvg(v.times)).join(", ")+"\n\nFREEZER (independent system — no relation to DD):\nTotal: "+fzPallets.length+" pallets | Avg full transit: "+fmtAvg(fzTimes)+"\nCold flags: "+fzPallets.filter(p=>p.coldChainFlag).length+" | Rejections: "+fzPallets.filter(p=>p.rejected).length+"\nSegments: "+fzSegs.join(" | ")+"\nSRM distribution: "+Object.entries(srmFZ).map(([k,v])=>k+": "+v.count+" pallets avg "+fmtAvg(v.times)).join(", ")+"\n\nDock receiving: "+dockSessions.length+" sessions, "+dockSessions.reduce((a,s)=>a+(s.manHrsTotal||0),0).toFixed(2)+" total man-hrs\n\nAnalyze each system independently. Where are the constraints? What should the observer look at next?";
    }
    if (mode==="session"&&scope) {
      const s=scope;
      const side=s.side||s.sideLabel;
      const segs=side==="DD"?DD_SEGMENTS:FZ_SEGMENTS;
      const palletDetails=(s.pallets||[]).map((p,i)=>{
        const segTimes=segs.map(seg=>{const t=getSegmentTime(p.taps||{},seg.from,seg.to);return seg.label+": "+fmtSeg(t);}).join(", ");
        return "Pallet "+(i+1)+" ("+p.id+"): total="+fmtSeg(totalTime(p))+" | "+segTimes+(p.srmNumber?" | SRM "+p.srmNumber:"")+(p.rejected?" | REJECTED":"")+(p.coldChainFlag?" | COLD FLAG ("+p.coldChainFlag.reason+")":"");
      });
      const offline=Object.entries(s.offline||{}).filter(e=>e[1]).map(e=>e[0]).join(", ")||"none";
      return "SESSION ANALYSIS\n\nSystem: "+side+" ("+( side==="DD"?"Dairy/Deli":"Freezer")+", independent system)\nSession: "+s.id+" | Condition: "+s.condition+" | Date: "+new Date(s.startTime).toLocaleDateString()+"\nEquipment offline: "+offline+"\nNotes: "+(s.notes||"none")+"\n\n"+palletDetails.join("\n")+"\n\nAnalyze this session. What patterns stand out? Which segments are slow? Any outliers worth investigating?";
    }
    if (mode==="pallet"&&scope) {
      const p=scope;
      const side=p.side;
      const segs=side==="DD"?DD_SEGMENTS:FZ_SEGMENTS;
      const segTimes=segs.map(seg=>{const t=getSegmentTime(p.taps||{},seg.from,seg.to);return seg.label+": "+fmtSeg(t);}).join("\n");
      const sorted=Object.entries(p.taps||{}).sort((a,b)=>a[1]-b[1]);
      return "SINGLE PALLET ANALYSIS\n\nSystem: "+side+" ("+( side==="DD"?"Dairy/Deli":"Freezer")+")\nPallet: "+p.id+" | Condition: "+p.condition+"\nTotal transit: "+fmtSeg(totalTime(p))+"\nSRM: "+(p.srmNumber?"SRM "+p.srmNumber:"not recorded")+"\nRejected: "+(p.rejected?"YES":"NO")+"\nCold flag: "+(p.coldChainFlag?"YES — "+p.coldChainFlag.reason:"NO")+"\n\nTap sequence: "+sorted.map(([k,v])=>k+" at "+new Date(v).toLocaleTimeString()).join(" → ")+"\n\nSegments:\n"+segTimes+"\n\nWhere did this pallet slow down? What questions does this raise?";
    }
    return null;
  };

  const askJonah = async () => {
    const dataStr = buildDataPackage(jonahMode,jonahScope);
    if (!dataStr) return;
    setJonahLoading(true); setJonahResponse(null); setJonahError(null);
    try {
      const payload = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_CONTEXT,
        messages: [{ role: "user", content: dataStr }]
      };
      const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent("https://api.anthropic.com/v1/messages");
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "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",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      let text = "";
      if (data.content && Array.isArray(data.content)) {
        text = data.content.map(c => c.text || "").join("").trim();
      } else if (data.error) {
        text = "Error: " + (data.error.message || JSON.stringify(data.error));
      }
      if (text) {
        setJonahResponse(text);
      } else {
        setJonahError("No response. Try again.");
      }
    } catch(e) {
      setJonahError("Could not reach Jonah: " + e.message);
    }
    setJonahLoading(false);
  };

  const downloadCSV = () => {
    const rows=[["Pallet ID","Side","Condition","Session ID","SRM #","Cold Flag","Cold Flag Reason","Rejected","Total Time (min)","Floor TS","SG43 TS","SG41 TS","SG13 TS","SG11 TS","AMTU43 TS","AMTU41 TS","AMTU13 TS","AMTU11 TS","Conformity TS","VL48 TS","VL47 TS","VL18 TS","VL17 TS","SC58 TS","SC57 TS","SC28 TS","SC27 TS","SRM TS","Seg Floor→SG (min)","Seg SG→AMTU (min)","Seg AMTU→Conf (min)","Seg Conf→VL (min)","Seg VL→SC (min)","Seg SC→SRM (min)","Equipment Offline","Timestamp"]];
    allPallets.forEach(p=>{
      const taps=p.taps||{};const vals=Object.values(taps);const totalMs=vals.length>=2?Math.max(...vals)-Math.min(...vals):null;
      const segs=p.side==="DD"?DD_SEGMENTS:FZ_SEGMENTS;
      const segTimes=segs.map(seg=>{const st=getSegmentTime(taps,seg.from,seg.to);return st?(st/60000).toFixed(3):"";});
      const fmtTs=(k)=>taps[k]?new Date(taps[k]).toISOString():"";
      const offlineList=Object.entries(p.offlineEquip||{}).filter(e=>e[1]).map(e=>e[0]).join("; ");
      rows.push([p.id||"",p.side||"",p.condition||"",p.sessionId||"",p.srmNumber||"",p.coldChainFlag?"YES":"NO",p.coldChainFlag?(p.coldChainFlag.reason||""):"",p.rejected?"YES":"NO",totalMs?(totalMs/60000).toFixed(3):"",fmtTs("floor"),fmtTs("sg4300"),fmtTs("sg4100"),fmtTs("sg1300"),fmtTs("sg1100"),fmtTs("amtu4300"),fmtTs("amtu4100"),fmtTs("amtu1300"),fmtTs("amtu1100"),fmtTs("dd_conformity")||fmtTs("fz_conformity"),fmtTs("vl4800"),fmtTs("vl4700"),fmtTs("vl1800"),fmtTs("vl1700"),fmtTs("sc5800"),fmtTs("sc5700"),fmtTs("sc2800"),fmtTs("sc2700"),fmtTs("srm"),...segTimes,offlineList,p.endTime?new Date(p.endTime).toISOString():""]);
    });
    rows.push([]);rows.push(["--- FDD RECEIVING SESSIONS ---"]);
    rows.push(["Session ID","Side","Door","People","Mode","Pallets","Elapsed (min)","Man-Hrs Total","Man-Hrs Per Pallet","Load Description","Date"]);
    dockSessions.forEach(s=>{rows.push([s.id||"",s.meta?.side||"",s.meta?.door||"",s.meta?.people||"",s.mode||"",s.palletCount||"",s.sessionElapsed?(s.sessionElapsed/60000).toFixed(2):"",s.manHrsTotal?s.manHrsTotal.toFixed(3):"",s.manHrsPerPallet?s.manHrsPerPallet.toFixed(3):"",s.meta?.desc||"",s.ts?new Date(s.ts).toISOString():""]);});
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,"'")+'"').join(",")).join(String.fromCharCode(10));
    const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="jonah-export-"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url);
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",gap:6}}>
        {["DD","FZ"].map(s=>(
          <button key={s} onClick={()=>setSideView(s)} style={{padding:"8px 18px",fontSize:12,fontWeight:700,fontFamily:"inherit",borderRadius:6,cursor:"pointer",border:"1px solid "+(sideView===s?ORANGE:BORDER),background:sideView===s?"rgba(232,118,10,0.15)":CARD,color:sideView===s?ORANGE2:MUTED}}>
            {s==="DD"?"Dairy/Deli":"Freezer"}
          </button>
        ))}
      </div>
      <Btn variant="primary" small onClick={downloadCSV} style={{width:"auto",padding:"8px 16px",marginBottom:0}}>Export CSV</Btn>
    </div>

    {/* ASK JONAH */}
    <div style={{background:"rgba(232,118,10,0.06)",border:"1px solid "+ORANGE,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:ORANGE2}}>Ask Jonah</div>
          <div style={{fontSize:11,color:MUTED}}>AI analysis · Theory of Constraints</div>
        </div>
        {jonahResponse&&<button onClick={()=>{setJonahResponse(null);setJonahMode(null);setJonahScope(null);}}
          style={{background:"transparent",border:"none",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        {["overall","session","pallet"].map(m=>(
          <button key={m} onClick={()=>{setJonahMode(m);setJonahScope(null);setJonahResponse(null);}} style={{padding:"8px 14px",fontSize:11,fontWeight:700,fontFamily:"inherit",borderRadius:6,cursor:"pointer",border:"1px solid "+(jonahMode===m?ORANGE:BORDER),background:jonahMode===m?"rgba(232,118,10,0.15)":CARD,color:jonahMode===m?ORANGE2:MUTED,textTransform:"capitalize"}}>
            {m==="overall"?"Overall":m==="session"?"By Session":"By Pallet"}
          </button>
        ))}
      </div>
      {jonahMode==="session"&&<div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:MUTED,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Select Session</div>
        {allSessions.length===0&&<div style={{fontSize:12,color:MUTED}}>No sessions yet.</div>}
        {allSessions.slice(0,10).map(s=>(
          <div key={s.id} onClick={()=>setJonahScope(s)} style={{padding:"8px 10px",borderRadius:6,marginBottom:4,cursor:"pointer",background:jonahScope?.id===s.id?"rgba(232,118,10,0.15)":SURFACE,border:"1px solid "+(jonahScope?.id===s.id?ORANGE:BORDER)}}>
            <span style={{fontSize:12,fontWeight:700,color:jonahScope?.id===s.id?ORANGE2:TEXT}}>{s.id}</span>
            <span style={{fontSize:11,color:MUTED,marginLeft:8}}>{s.sideLabel} · {s.condition} · {s.pallets?.length||0} pallets</span>
          </div>
        ))}
      </div>}
      {jonahMode==="pallet"&&<div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:MUTED,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Select Pallet</div>
        {allPalletsFlat.length===0&&<div style={{fontSize:12,color:MUTED}}>No pallets yet.</div>}
        {allPalletsFlat.slice(0,15).map((p,i)=>(
          <div key={i} onClick={()=>setJonahScope(p)} style={{padding:"8px 10px",borderRadius:6,marginBottom:4,cursor:"pointer",background:jonahScope?.id===p.id?"rgba(232,118,10,0.15)":SURFACE,border:"1px solid "+(jonahScope?.id===p.id?ORANGE:BORDER)}}>
            <span style={{fontSize:12,fontWeight:700,color:jonahScope?.id===p.id?ORANGE2:TEXT}}>{p.id}</span>
            <span style={{fontSize:11,color:MUTED,marginLeft:8}}>{p.side} · {p.condition}</span>
          </div>
        ))}
      </div>}
      <Btn variant="primary" onClick={askJonah} disabled={jonahLoading||!jonahMode||((jonahMode==="session"||jonahMode==="pallet")&&!jonahScope)} style={{marginBottom:0}}>
        {jonahLoading?"Jonah is thinking...":"Ask Jonah"}
      </Btn>
      {jonahError&&<div style={{fontSize:12,color:RED,marginTop:8}}>{jonahError}</div>}
      {jonahResponse&&<div style={{marginTop:12,background:SURFACE,borderRadius:8,padding:"14px 16px",border:"1px solid "+BORDER}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:ORANGE,marginBottom:10}}>Jonah says:</div>
        <div style={{fontSize:13,color:TEXT,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{jonahResponse}</div>
      </div>}
    </div>

    <StatPair left={{label:"Total Pallets",value:allPallets.length,color:TEXT,sub:ddPallets.length+" DD / "+fzPallets.length+" FZ"}} right={{label:"Avg Full Transit",value:fmtMin(avg(activePallets.map(p=>totalTime(p)).filter(Boolean))),color:ORANGE2,sub:activePallets.length+" observations"}}/>
    <StatPair left={{label:"Cold Flags",value:coldFlags,color:coldFlags>0?RED:GREEN}} right={{label:"Rejections",value:rejected,color:rejected>0?RED:GREEN}}/>

    <Hr/>
    <SLabel>{sideView==="DD"?"Dairy/Deli":"Freezer"} — Avg Time Per Segment</SLabel>
    {segData.length===0&&<div style={{color:MUTED,fontSize:12,marginBottom:12}}>Complete some observations to see segment data.</div>}
    {segData.map(seg=>(
      <SegmentBar key={seg.key} label={seg.label} avgMs={seg.avg} minMs={seg.times.length?Math.min(...seg.times):null} maxMs={seg.times.length?Math.max(...seg.times):null} barMax={maxAvg} count={seg.count} isMax={seg.avg===maxAvg&&segData.length>1}/>
    ))}
    {segData.length>1&&<div style={{background:"rgba(224,82,82,0.08)",border:"1px solid rgba(224,82,82,0.3)",borderRadius:8,padding:"10px 14px",marginTop:4,marginBottom:4}}>
      <span style={{fontSize:11,color:RED,fontWeight:700}}>Longest segment: {segData.reduce((a,b)=>(a.avg||0)>(b.avg||0)?a:b).label}</span>
      <span style={{fontSize:11,color:MUTED}}> — potential constraint</span>
    </div>}

    <Hr/>
    <SLabel>SRM Load Distribution</SLabel>
    {Object.keys(srmMap).length===0&&<div style={{color:MUTED,fontSize:12,marginBottom:12}}>No SRM data yet.</div>}
    {Object.entries(srmMap).sort((a,b)=>parseInt(a[0].replace("SRM ",""))-parseInt(b[0].replace("SRM ",""))).map(([srm,data])=>{
      const a=avg(data.times);
      return <Card key={srm} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:700,color:BLUE}}>{srm}</span>
          <div style={{display:"flex",gap:12}}><span style={{fontSize:11,color:MUTED}}>{data.count} pallets</span><span style={{fontSize:13,fontWeight:700,color:ORANGE2}}>{fmtMin(a)}</span></div>
        </div>
        {data.times.length>1&&<div style={{fontSize:11,color:MUTED,marginTop:3}}>min {fmtMin(Math.min(...data.times))} · max {fmtMin(Math.max(...data.times))}</div>}
      </Card>;
    })}

    <Hr/>
    <SLabel>FDD Receiving / Man-Hours</SLabel>
    <StatPair left={{label:"Sessions",value:dockSessions.length,color:TEXT}} right={{label:"Total Man-Hrs",value:totalManHrs.toFixed(2),color:GREEN}}/>
    {mhpp.length>0&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:700,color:TEXT}}>Avg Man-Hrs / Pallet</span>
        <span style={{fontSize:18,fontWeight:700,color:ORANGE2}}>{avg(mhpp).toFixed(3)}</span>
      </div>
      <div style={{fontSize:11,color:MUTED,marginTop:3}}>across {mhpp.length} sessions</div>
    </Card>}
    <div style={{height:24}}/>
  </div>;
}

// ── Settings Tab ──────────────────────────────────────────
function SettingsTab({ settings, setSettings }) {
  const [ddSessions] = useStorage("sessions_DD",[]);
  const [fzSessions] = useStorage("sessions_FZ",[]);
  const [dockSessions] = useStorage("dock_sessions",[]);
  const [syncStatus,setSyncStatus] = useState(null);
  const [syncing,setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true); setSyncStatus(null);
    try { const ok=await syncToSheets(ddSessions,fzSessions,dockSessions); setSyncStatus(ok?"success":"error"); }
    catch(e) { setSyncStatus("error"); }
    setSyncing(false);
  };

  const inp = {width:"100%",background:CARD,border:"1px solid "+BORDER,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"10px 12px",borderRadius:6,outline:"none",marginBottom:12,boxSizing:"border-box"};
  const lbl = {fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:MUTED,display:"block",marginBottom:6};

  return <div>
    <SLabel mt={4}>Google Sheets Sync</SLabel>
    <div style={{background:SURFACE,border:"1px solid "+BORDER,borderRadius:8,padding:"12px 14px",marginBottom:12}}>
      <div style={{fontSize:12,color:MUTED,marginBottom:10}}>Pushes all session data to your TOC Jonah Edition sheet in Google Drive.</div>
      <Btn variant="primary" onClick={handleSync} disabled={syncing} style={{marginBottom:6}}>{syncing?"Syncing...":"Sync to Google Drive"}</Btn>
      {syncStatus==="success"&&<div style={{fontSize:12,color:GREEN,marginTop:4}}>✓ Synced successfully</div>}
      {syncStatus==="error"&&<div style={{fontSize:12,color:RED,marginTop:4}}>✗ Sync failed — check connection</div>}
    </div>
    <Hr/>
    <SLabel>User & System</SLabel>
    {[
      {key:"userId",label:"User ID",placeholder:"Your ID or code"},
      {key:"coldChainMins",label:"Cold Chain Threshold (min)",placeholder:"30",type:"number"},
    ].map(f=><div key={f.key}><label style={lbl}>{f.label}</label><input style={inp} type={f.type||"text"} placeholder={f.placeholder} value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}/></div>)}
    <Hr/>
    <SLabel>SRM Assignments (comma separated)</SLabel>
    <div style={{fontSize:11,color:MUTED,marginBottom:12}}>Edit if SRM assignments change. Shared SRM should appear in both lists.</div>
    {[
      {key:"srm_sc5800",label:"SC 5800 → SRMs",placeholder:"15,16,17,14"},
      {key:"srm_sc5700",label:"SC 5700 → SRMs",placeholder:"11,12,13,14"},
      {key:"srm_sc2800",label:"SC 2800 → SRMs",placeholder:"6,7,8,9,10,5"},
      {key:"srm_sc2700",label:"SC 2700 → SRMs",placeholder:"1,2,3,4,5"},
    ].map(f=><div key={f.key}><label style={lbl}>{f.label}</label><input style={inp} type="text" placeholder={f.placeholder} value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}/></div>)}
    <Hr/>
    <SLabel>Design Rates — Dairy / Deli (pallets/hr)</SLabel>
    {CONDITIONS.map(c=><div key={"dd_"+c}><label style={lbl}>{c}</label><input style={inp} type="number" placeholder="Not set — pending manufacturer data" value={settings["dd_rate_"+c]||""} onChange={e=>setSettings(p=>({...p,["dd_rate_"+c]:e.target.value}))}/></div>)}
    <SLabel>Design Rates — Freezer (pallets/hr)</SLabel>
    {CONDITIONS.map(c=><div key={"fz_"+c}><label style={lbl}>{c}</label><input style={inp} type="number" placeholder="Not set — pending manufacturer data" value={settings["fz_rate_"+c]||""} onChange={e=>setSettings(p=>({...p,["fz_rate_"+c]:e.target.value}))}/></div>)}
    <Hr/>
    <div style={{fontSize:11,color:FAINT,textAlign:"center"}}>TOC - Jonah Edition v4.0 · Local storage · Google Sheets sync enabled</div>
    <div style={{height:24}}/>
  </div>;
}

// ── App Shell ─────────────────────────────────────────────
export default function App() {
  const [tab,setTab] = useState("dd");
  const [settings,setSettings] = useStorage("jonah_settings",{coldChainMins:30,userId:"",srm_sc5800:"15,16,17,14",srm_sc5700:"11,12,13,14",srm_sc2800:"6,7,8,9,10,5",srm_sc2700:"1,2,3,4,5"});

  const tabs = [
    {id:"dd",      label:"D/D"},
    {id:"fz",      label:"FZ"},
    {id:"unload",  label:<div style={{fontSize:10,lineHeight:1.2}}><div>FDD</div><div>REC</div></div>},
    {id:"history", label:"Log"},
    {id:"summary", label:"Sum"},
    {id:"settings",label:"Set"},
  ];

  return <div style={{maxWidth:440,margin:"0 auto",background:BG,minHeight:"100vh",display:"flex",flexDirection:"column",color:TEXT,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
    <div style={{background:SURFACE,borderBottom:"1px solid "+BORDER,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:30,height:30,background:ORANGE,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:15,fontWeight:900,color:"#fff"}}>J</span>
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:TEXT,letterSpacing:0.3}}>TOC - Jonah Edition</div>
          <div style={{fontSize:10,color:MUTED,letterSpacing:1,textTransform:"uppercase"}}>Mechanized System Observer</div>
        </div>
      </div>
      {settings.userId&&<Chip label={settings.userId} color="orange"/>}
    </div>
    <div style={{display:"flex",background:SURFACE,borderBottom:"1px solid "+BORDER}}>
      {tabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 4px",textAlign:"center",fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:tab===t.id?ORANGE:MUTED,cursor:"pointer",borderBottom:tab===t.id?"2px solid "+ORANGE:"2px solid transparent"}}>{t.label}</div>)}
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"4px 18px 0"}}>
      {tab==="dd"      &&<ObserverTab side="DD" nodes={DD_NODES} settings={settings}/>}
      {tab==="fz"      &&<ObserverTab side="FZ" nodes={FZ_NODES} settings={settings}/>}
      {tab==="unload"  &&<UnloadingTab settings={settings}/>}
      {tab==="history" &&<HistoryTab/>}
      {tab==="summary" &&<SummaryTab/>}
      {tab==="settings"&&<SettingsTab settings={settings} setSettings={setSettings}/>}
    </div>
  </div>;
}
