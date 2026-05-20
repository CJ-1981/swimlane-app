import { useState, useRef, useEffect, useMemo } from "react";

const PALETTE = [
  "#4fc3f7", "#f06292", "#a5d6a7", "#ffb74d", "#ce93d8",
  "#80cbc4", "#ef9a9a", "#90caf9", "#fff176", "#ffcc80",
  "#b0bec5", "#80deea", "#c5e1a5", "#ffab91", "#b39ddb"
];

const SAMPLE_CSV = `timestamp,group,value
2024-01-15 08:00,Server A,healthy
2024-01-15 08:30,Server A,warning
2024-01-15 09:15,Server A,healthy
2024-01-15 10:00,Server A,critical
2024-01-15 10:45,Server A,healthy
2024-01-15 08:00,Server B,healthy
2024-01-15 08:45,Server B,healthy
2024-01-15 09:30,Server B,warning
2024-01-15 10:30,Server B,warning
2024-01-15 11:00,Server B,healthy
2024-01-15 08:00,DB Primary,healthy
2024-01-15 09:00,DB Primary,warning
2024-01-15 09:30,DB Primary,critical
2024-01-15 10:15,DB Primary,critical
2024-01-15 11:00,DB Primary,healthy
2024-01-15 08:00,DB Replica,healthy
2024-01-15 09:45,DB Replica,healthy
2024-01-15 10:00,DB Replica,warning
2024-01-15 11:15,DB Replica,healthy
2024-01-15 08:00,Load Balancer,healthy
2024-01-15 09:00,Load Balancer,warning
2024-01-15 09:20,Load Balancer,healthy
2024-01-15 10:30,Load Balancer,critical
2024-01-15 11:00,Load Balancer,healthy`;

const s = {
  bg: "#0d0f14", surface: "#161a24", surface2: "#1e2535",
  border: "#2a3045", accent: "#4fc3f7", accent2: "#f06292",
  text: "#cdd6f4", muted: "#6272a4"
};

function parseCSV(text, sep = ",") {
  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) throw new Error("Need header + at least 1 data row");
  const hdr = lines[0].split(sep).map(s => s.trim().toLowerCase());
  const fi = (names) => hdr.findIndex(h => names.some(n => h.includes(n)));
  const ti = fi(["time", "date", "ts", "stamp"]);
  const gi = fi(["group", "lane", "category", "name", "series"]);
  const vi = fi(["value", "state", "status", "val", "event", "type"]);
  if (ti < 0) throw new Error("No timestamp column. Use: timestamp, date, ts");
  if (gi < 0) throw new Error("No group column. Use: group, lane, category");
  if (vi < 0) throw new Error("No value column. Use: value, state, status");
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(s => s.trim());
    if (!cols[ti] || !cols[gi] || !cols[vi]) continue;
    const ts = new Date(cols[ti]);
    if (isNaN(ts.getTime())) continue;
    result.push({ ts, group: cols[gi], value: cols[vi] });
  }
  if (!result.length) throw new Error("No valid rows parsed — check timestamp format");
  return result.sort((a, b) => a.ts - b.ts);
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtTs(d, includeYear = false) {
  const md = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return includeYear ? `${d.getFullYear()}/${md} ${time}` : `${md} ${time}`;
}
function fmtDur(ms) {
  if (!ms || ms <= 0) return null;
  if (ms < 60000) return Math.round(ms / 1000) + "s";
  if (ms < 3600000) return (ms / 60000).toFixed(1) + "m";
  return (ms / 3600000).toFixed(2) + "h";
}
function timeTicks(tMin, tMax, approxCount) {
  const span = tMax - tMin;
  const intervals = [60000, 120000, 300000, 600000, 900000, 1800000,
    3600000, 7200000, 10800000, 21600000, 43200000, 86400000, 172800000];
  const target = span / approxCount;
  const interval = intervals.reduce((p, c) => Math.abs(c - target) < Math.abs(p - target) ? c : p);
  const ticks = [];
  let t = Math.ceil(tMin / interval) * interval;
  while (t <= tMax) { ticks.push(new Date(t)); t += interval; }
  return ticks;
}
function fmtTick(d, span) {
  if (span < 3600000) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (span < 86400000 * 2) return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

const LABEL_W = 130, AXIS_H = 40, LANE_H = 52, LANE_GAP = 6, PAD_TOP = 8, PAD_R = 20;
const DIAMOND_SIZE = 10; // half-size of diamond

// ── Diamond marker at a point (no span)
function DiamondMarker({ cx, cy, size, col, onMouseMove, onMouseLeave }) {
  const pts = `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
  return (
    <polygon points={pts} fill={col} stroke={s.bg} strokeWidth={1.5}
      style={{ cursor: "pointer" }}
      onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} />
  );
}

const EyeIcon = ({ closed }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {closed ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </>
    ) : (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </>
    )}
  </svg>
);

function checkDurFilter(durMs, filterStr) {
  if (!filterStr || !filterStr.trim()) return true;
  if (durMs === null) return false;
  const durSec = durMs / 1000;
  const s = filterStr.trim();

  const parseVal = (str) => {
    const m = str.trim().match(/^([\d.]+)([hdsm]?)$/i);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u === 'm') return v * 60;
    if (u === 'h') return v * 3600;
    if (u === 'd') return v * 86400;
    return v;
  };

  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length === 2) {
      const min = parseVal(parts[0]);
      const max = parseVal(parts[1]);
      if (!isNaN(min) && !isNaN(max)) return durSec >= min && durSec <= max;
    }
  }
  const match = s.match(/^([<>=]+)\s*([\d.]+[hdsm]?)$/i);
  if (match) {
    const op = match[1], val = parseVal(match[2]);
    if (!isNaN(val)) {
      if (op === ">") return durSec > val;
      if (op === ">=") return durSec >= val;
      if (op === "<") return durSec < val;
      if (op === "<=") return durSec <= val;
      if (op === "=" || op === "==") return durSec === val;
    }
  }
  const val = parseVal(s);
  if (!isNaN(val)) return durSec === val;
  return false;
}

function MultiSelect({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(x => x !== opt));
    else onChange([...selected, opt]);
  };

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <div onClick={() => setOpen(!open)} style={{ background: s.bg, border: `1px solid ${s.border}`, color: selected.length ? s.text : s.muted, fontFamily: "monospace", fontSize: ".6rem", padding: "4px 6px", borderRadius: 2, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", height: "100%", boxSizing: "border-box", display: "flex", alignItems: "center" }}>
        {selected.length ? selected.join(", ") : placeholder}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, minWidth: "100%", background: s.bg, border: `1px solid ${s.border}`, zIndex: 100, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "4px", position: "sticky", top: 0, background: s.bg, borderBottom: `1px solid ${s.border}` }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ width: "100%", boxSizing: "border-box", background: s.surface, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px", borderRadius: 2, outline: "none" }} onClick={e => e.stopPropagation()} />
          </div>
          {filteredOptions.map(opt => (
            <div key={opt} onClick={(e) => { e.stopPropagation(); toggle(opt); }} style={{ padding: "4px 6px", fontSize: ".6rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: s.text, borderBottom: `1px solid ${s.surface}`, whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.background = s.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <input type="checkbox" checked={selected.includes(opt)} readOnly style={{ margin: 0, cursor: "pointer" }} /> {opt}
            </div>
          ))}
          {filteredOptions.length === 0 && <div style={{ padding: "6px", fontSize: ".6rem", color: s.muted, textAlign: "center" }}>No matches</div>}
        </div>
      )}
    </div>
  );
}

const defaultState = window.INITIAL_SWIMLANE_STATE || {};
export default function SwimLane() {
  const [csvText, setCsvText] = useState(defaultState.csvText || SAMPLE_CSV);
  const [csvSeparator, setCsvSeparator] = useState(defaultState.csvSeparator || ",");
  const [rows, setRows] = useState([]);
  const [colorMap, setColorMap] = useState(defaultState.colorMap || {});
  const [hiddenValues, setHiddenValues] = useState(defaultState.hiddenValues || {});
  const [hiddenGroups, setHiddenGroups] = useState(defaultState.hiddenGroups || {});
  const [groupModes, setGroupModes] = useState(defaultState.groupModes || {});
  const [timeRange, setTimeRange] = useState(null);
  const [dragMode, setDragMode] = useState("zoom"); // "zoom" | "pan"
  const [panStart, setPanStart] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [sortMode, setSortMode] = useState(defaultState.sortMode || "natural");
  const [customGroupOrder, setCustomGroupOrder] = useState(defaultState.customGroupOrder || []);
  const [draggedGroup, setDraggedGroup] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [highlight, setHighlight] = useState(null); // { r, time }
  const [activeTab, setActiveTab] = useState("csv");
  const [loading, setLoading] = useState(false);
  const [starred, setStarred] = useState(defaultState.starred || {});
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const activeRows = useMemo(() => rows.filter(r => !hiddenGroups[r.group]), [rows, hiddenGroups]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState("");
  const [manualTs, setManualTs] = useState("");
  const [manualGroup, setManualGroup] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [tableFilterId, setTableFilterId] = useState("");
  const [tableFilterTs, setTableFilterTs] = useState("");
  const [tableFilterGroup, setTableFilterGroup] = useState([]);
  const [tableFilterValue, setTableFilterValue] = useState([]);
  const [tableFilterDur, setTableFilterDur] = useState("");
  const [tableFilterDurBefore, setTableFilterDurBefore] = useState("");
  // color picker popover
  const [pickerFor, setPickerFor] = useState(null); // value name
  const scrollRef = useRef(null);
  const palIdx = useRef(0);
  const colorInputRef = useRef(null);
  const chartSvgRef = useRef(null);
  const wheelData = useRef({});
  const fileInputRef = useRef(null);

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setCsvText(evt.target.result);
    reader.readAsText(file);
    e.target.value = null;
  }

  function getColor(val, map) {
    if (map[val]) return map[val];
    return PALETTE[palIdx.current++ % PALETTE.length];
  }
  function buildColorMap(data, existingMap) {
    const m = { ...existingMap };
    data.forEach(r => { if (!m[r.value]) m[r.value] = getColor(r.value, m); });
    return m;
  }

  function handleButtonZoom(factor) {
    if (!rows.length) return;
    const { tDomMin, span } = wheelData.current;
    const center = tDomMin + span / 2;
    const newSpan = span * factor;
    setTimeRange({ min: center - newSpan / 2, max: center + newSpan / 2 });
  }

  function handleRender(isInitial = false) {
    setLoading(true);
    setTimeout(() => {
      try {
        const parsed = parseCSV(csvText, csvSeparator);
        parsed.forEach((r, i) => r._id = i + 1);
        setColorMap(buildColorMap(parsed, colorMap));
        setRows(parsed);
        if (!isInitial) {
          setHiddenValues({});
        }
        setError("");
      } catch (e) { setError(e.message); }
      setLoading(false);
    }, 10);
  }

  useEffect(() => {
    handleRender(!!window.INITIAL_SWIMLANE_STATE);
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  useEffect(() => {
    const el = chartSvgRef.current;
    if (!el) return;
    const handleNativeWheel = (e) => {
      if (!rows.length) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < LABEL_W) return;
      e.preventDefault();
      const { tDomMin, tDomMax, span, W } = wheelData.current;
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
        const ratio = (x - LABEL_W) / (W - LABEL_W - PAD_R);
        const cursorTime = tDomMin + ratio * span;
        const newSpan = span * zoomFactor;
        setTimeRange({ min: cursorTime - ratio * newSpan, max: cursorTime + (1 - ratio) * newSpan });
      } else {
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const dt = (dx / (W - LABEL_W - PAD_R)) * span;
        setTimeRange({ min: tDomMin + dt, max: tDomMax + dt });
      }
    };
    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleNativeWheel);
  }, [rows.length]);

  function getGroups() {
    const g = [...new Set(rows.map(r => r.group))];
    if (sortMode === "custom") {
      const ordered = customGroupOrder.filter(grp => g.includes(grp));
      const missing = g.filter(grp => !customGroupOrder.includes(grp));
      return [...ordered, ...missing];
    }
    if (sortMode === "alpha") return g.sort();
    if (sortMode === "alpha-desc") return g.sort().reverse();
    if (sortMode === "events") return g.sort((a, b) =>
      rows.filter(r => r.group === b).length - rows.filter(r => r.group === a).length);
    return g;
  }
  function getValues() { return [...new Set(activeRows.map(r => r.value))]; }

  function addRow() {
    if (!manualTs || !manualGroup || !manualValue) { setError("Fill all fields"); return; }
    const ts = new Date(manualTs);
    if (isNaN(ts.getTime())) { setError("Invalid timestamp"); return; }
    const newId = rows.length ? Math.max(...rows.map(r => r._id || 0)) + 1 : 1;
    const newRows = [...rows, { _id: newId, ts, group: manualGroup, value: manualValue }].sort((a, b) => a.ts - b.ts);
    setColorMap(buildColorMap(newRows, colorMap));
    setRows(newRows);
    setError("");
  }
  function deleteRow(id) { setRows(rows.filter(r => r._id !== id)); }
  function toggleValue(val) { setHiddenValues(h => ({ ...h, [val]: !h[val] })); }
  function toggleGroup(group) { setHiddenGroups(h => ({ ...h, [group]: !h[group] })); }
  function cycleGroupMode(group) {
    setGroupModes(m => {
      const current = m[group] || "span";
      const next = current === "span" ? "diamond" : current === "diamond" ? "line" : "span";
      return { ...m, [group]: next };
    });
  }

  function jumpToRow(r) {
    if (!rows.length) return;
    if (hiddenGroups[r.group]) {
      setHiddenGroups(h => ({ ...h, [r.group]: false }));
    }
    const ts = r.ts.getTime();
    const durMs = r.dur || 0;
    
    // Auto-zoom: if event has duration, span is 2x duration (padding). Else 2 mins.
    const targetSpan = durMs > 0 ? Math.max(durMs * 2, 60000) : 120000;
    const centerTs = ts + durMs / 2;
    
    setTimeRange({ min: centerTs - targetSpan / 2, max: centerTs + targetSpan / 2 });
    setHighlight({ r, time: Date.now() });
  }

  // ── color picker: click swatch → open native color input
  function openPicker(val) {
    setPickerFor(val);
    setTimeout(() => colorInputRef.current && colorInputRef.current.click(), 50);
  }
  function handlePickerChange(e) {
    if (!pickerFor) return;
    setColorMap(m => ({ ...m, [pickerFor]: e.target.value }));
  }

  function exportHTML() {
    const isDev = !!document.querySelector('script[src*="@vite/client"]');
    if (isDev) {
      alert("Please run 'npm run build' and open dist/index.html to export an interactive HTML with your data.");
      return;
    }

    const stateToExport = {
      csvText,
      csvSeparator,
      colorMap,
      hiddenValues,
      hiddenGroups,
      groupModes,
      sortMode,
      customGroupOrder,
      starred
    };

    let html = `<!DOCTYPE html>\n<html lang="en">` + document.documentElement.innerHTML + "</html>";
    html = html.replace(/<script id="injected-state">.*?<\/script>/s, "");

    const stateScript = `<script id="injected-state">window.INITIAL_SWIMLANE_STATE = ${JSON.stringify(stateToExport)};</script>`;
    html = html.replace("</head>", stateScript + "</head>");

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swimlane_interactive_${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ── Layout math
  const groups = getGroups();
  const activeGroups = groups.filter(g => !hiddenGroups[g]);
  const values = getValues();
  const containerW = scrollRef.current?.clientWidth || 700;
  const W = Math.max(containerW, 400);
  const H = PAD_TOP + AXIS_H + activeGroups.length * (LANE_H + LANE_GAP) + 20;

  let tMin = Infinity, tMax = -Infinity;
  activeRows.forEach(r => { const t = r.ts.getTime(); if (t < tMin) tMin = t; if (t > tMax) tMax = t; });
  const tPad = (tMax - tMin) * 0.025 || 300000;
  const tDomMin = timeRange ? timeRange.min : tMin - tPad;
  const tDomMax = timeRange ? timeRange.max : tMax + tPad;
  const span = tDomMax - tDomMin || 1;
  const fullSpan = (tMax + tPad) - (tMin - tPad) || 1;
  const zoomLevel = fullSpan / span;
  const xMap = ts => LABEL_W + (ts - tDomMin) / span * (W - LABEL_W - PAD_R);
  wheelData.current = { tDomMin, tDomMax, span, W };

  const ticks = activeRows.length ? timeTicks(tDomMin, tDomMax, Math.max(4, Math.floor((W - LABEL_W) / 100))) : [];
  const gridBottom = PAD_TOP + AXIS_H + activeGroups.length * (LANE_H + LANE_GAP);

  // ── Build render items per lane
  const laneItems = activeGroups.map((group, gi) => {
    const y = PAD_TOP + AXIS_H + gi * (LANE_H + LANE_GAP);
    const cy = y + LANE_H / 2;
    const mode = groupModes[group] || "span";
    const laneData = activeRows.filter(r => r.group === group).sort((a, b) => a.ts - b.ts);
    const items = laneData.map((ev, i) => {
      const next = laneData[i + 1] || null;
      const col = colorMap[ev.value] || "#888";
      const dur = next ? next.ts.getTime() - ev.ts.getTime() : null;
      const durBefore = (i > 0) ? ev.ts.getTime() - laneData[i - 1].ts.getTime() : null;
      const durLabel = fmtDur(dur);
      const x1 = xMap(ev.ts.getTime());
      const x2 = next ? xMap(next.ts.getTime()) : xMap(tDomMax);
      const segW = Math.max(x2 - x1, 3);
      return { ev, next, col, dur, durBefore, durLabel, x1, x2, segW, mode };
    });
    return { group, gi, y, cy, mode, items };
  });

  const rowDetails = useMemo(() => {
    const details = new Map();
    const grouped = {};
    activeRows.forEach((r) => {
      if (!grouped[r.group]) grouped[r.group] = [];
      grouped[r.group].push(r);
    });
    for (const g in grouped) {
      const arr = grouped[g].sort((a, b) => a.ts - b.ts);
      for (let i = 0; i < arr.length; i++) {
        const dur = (i < arr.length - 1) ? arr[i + 1].ts.getTime() - arr[i].ts.getTime() : null;
        const durBefore = (i > 0) ? arr[i].ts.getTime() - arr[i - 1].ts.getTime() : null;
        details.set(arr[i], { dur, durBefore });
      }
    }
    return details;
  }, [activeRows]);

  const allGroups = useMemo(() => [...new Set(rows.map(r => r.group))], [rows]);
  const allValues = useMemo(() => [...new Set(rows.map(r => r.value))], [rows]);

  const tableFilteredRows = useMemo(() => {
    return activeRows.map((r) => {
      const { dur, durBefore } = rowDetails.get(r) || {};
      return { ...r, dur, durBefore };
    }).filter(r =>
      (!showStarredOnly || starred[r._id]) &&
      (!tableFilterId || String(r._id).includes(tableFilterId)) &&
      (!tableFilterTs || fmtTs(r.ts).toLowerCase().includes(tableFilterTs.toLowerCase())) &&
      (!tableFilterGroup.length || tableFilterGroup.includes(r.group)) &&
      (!tableFilterValue.length || tableFilterValue.includes(r.value)) &&
      checkDurFilter(r.dur, tableFilterDur) &&
      checkDurFilter(r.durBefore, tableFilterDurBefore)
    );
  }, [activeRows, rowDetails, starred, showStarredOnly, tableFilterId, tableFilterTs, tableFilterGroup, tableFilterValue, tableFilterDur, tableFilterDurBefore]);

  const Btn = ({ children, onClick, accent }) => (
    <button onClick={onClick} style={{
      fontFamily: "monospace", fontSize: ".67rem", padding: "4px 11px", borderRadius: 3,
      border: `1px solid ${accent ? s.accent : s.border}`,
      background: s.surface, color: accent ? s.accent : s.text,
      cursor: "pointer", letterSpacing: ".05em"
    }}>{children}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: s.bg, color: s.text, fontFamily: "monospace", fontSize: 13, overflow: "hidden" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 9999, background: "rgba(14,17,26,0.7)", display: "flex", alignItems: "center", justifyContent: "center", color: s.accent, fontSize: "1.2rem", letterSpacing: ".1em" }}>
          PROCESSING...
        </div>
      )}
      <style>{`
        @keyframes blink-highlight {
          0% { opacity: 1; r: 5px; stroke-width: 6px; }
          100% { opacity: 0; r: 50px; stroke-width: 1px; }
        }
        .highlight-pulse {
          animation: blink-highlight 0.8s ease-out 3;
        }
      `}</style>
      {/* Header */}
      <div style={{ padding: "11px 20px", background: s.surface, borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "baseline", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: ".08em", color: s.accent }}>SWIM LANE TIMELINE</span>
        <span style={{ fontSize: ".6rem", color: s.muted }}>timestamp · group · value</span>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 7, alignItems: "center", padding: "7px 18px", background: s.surface2, borderBottom: `1px solid ${s.border}`, flexWrap: "wrap", flexShrink: 0 }}>
        <Btn onClick={() => setPanelOpen(p => !p)} accent>◀ DATA</Btn>
        <div style={{ width: 1, height: 20, background: s.border, margin: "0 2px" }} />
        <Btn onClick={() => handleButtonZoom(1 / 1.6)}>＋</Btn>
        <Btn onClick={() => handleButtonZoom(1.6)}>－</Btn>
        <Btn onClick={() => setTimeRange(null)}>FIT</Btn>
        <div style={{ width: 1, height: 20, background: s.border, margin: "0 2px" }} />
        <Btn onClick={() => setDragMode("zoom")} accent={dragMode === "zoom"}>🔍 ZOOM</Btn>
        <Btn onClick={() => setDragMode("pan")} accent={dragMode === "pan"}>✋ PAN</Btn>
        <div style={{ width: 1, height: 20, background: s.border, margin: "0 2px" }} />
        <span style={{ fontSize: ".6rem", color: s.muted }}>SORT:</span>
        <select value={sortMode} onChange={e => setSortMode(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: ".67rem", background: s.surface, border: `1px solid ${s.border}`, color: s.text, padding: "3px 7px", borderRadius: 3 }}>
          <option value="natural">Natural</option>
          <option value="alpha">A → Z</option>
          <option value="alpha-desc">Z → A</option>
          <option value="events">Most events</option>
          <option value="custom">Custom</option>
        </select>
        {!window.INITIAL_SWIMLANE_STATE && (
          <>
            <div style={{ width: 1, height: 20, background: s.border, margin: "0 2px" }} />
            <Btn onClick={exportHTML}>⤓ EXPORT</Btn>
          </>
        )}
      </div>

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Side Panel */}
        {panelOpen && (
          <div style={{ width: 300, flexShrink: 0, background: s.surface, borderRight: `1px solid ${s.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${s.border}`, flexShrink: 0 }}>
              {["csv", "manual", "groups", "table"].map(tab => (
                <div key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: "7px 0", textAlign: "center", fontSize: ".56rem", letterSpacing: ".07em", cursor: "pointer", color: activeTab === tab ? s.accent : s.muted, borderBottom: `2px solid ${activeTab === tab ? s.accent : "transparent"}` }}>
                  {tab === "csv" ? "CSV" : tab === "manual" ? "ADD ROW" : tab === "groups" ? "GROUPS" : "TABLE"}
                </div>
              ))}
            </div>

            {/* CSV Tab */}
            {activeTab === "csv" && (
              <div style={{ padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: ".6rem", color: s.muted, background: "rgba(42,48,69,.35)", borderLeft: `2px solid ${s.accent}`, padding: "6px 9px", lineHeight: 1.6, flex: 1 }}>
                    Header: <strong>timestamp, group, value</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 10 }}>
                    <span style={{ fontSize: ".55rem", color: s.muted }}>SEP:</span>
                    <input type="text" value={csvSeparator} onChange={e => setCsvSeparator(e.target.value)} style={{ width: 24, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px", borderRadius: 2, outline: "none", textAlign: "center" }} />
                  </div>
                </div>
                <textarea value={csvText} onChange={e => setCsvText(e.target.value)} spellCheck={false}
                  style={{ width: "100%", height: 200, flex: 1, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".63rem", padding: 8, resize: "none", borderRadius: 3, lineHeight: 1.55, outline: "none", whiteSpace: "pre", overflow: "auto" }} />
                {error && <div style={{ fontSize: ".62rem", color: s.accent2, marginTop: 5 }}>⚠ {error}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                  <button onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{ flex: 1, padding: 8, background: s.surface2, color: s.text, border: `1px solid ${s.border}`, fontFamily: "monospace", fontSize: ".72rem", fontWeight: 700, cursor: "pointer", borderRadius: 3, letterSpacing: ".06em" }}>
                    LOAD CSV
                  </button>
                  <button onClick={handleRender} style={{ flex: 2, padding: 8, background: s.accent, color: "#0d0f14", border: "none", fontFamily: "monospace", fontSize: ".72rem", fontWeight: 700, cursor: "pointer", borderRadius: 3, letterSpacing: ".06em" }}>
                    ▶ RENDER PLOT
                  </button>
                </div>
                <input type="file" accept=".csv,.txt" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />
              </div>
            )}

            {/* Manual Add Tab */}
            {activeTab === "manual" && (
              <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
                {[["Timestamp", "text", manualTs, setManualTs, "e.g. yyyy/mm/dd"],
                ["Group", "text", manualGroup, setManualGroup, "e.g. Server A"],
                ["Value", "text", manualValue, setManualValue, "e.g. healthy"]
                ].map(([label, type, val, setter, ph]) => (
                  <div key={label}>
                    <div style={{ fontSize: ".57rem", letterSpacing: ".1em", color: s.muted, textTransform: "uppercase", margin: "8px 0 4px" }}>{label}</div>
                    <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                      style={{ width: "100%", background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".67rem", padding: "5px 8px", borderRadius: 3, outline: "none" }} />
                  </div>
                ))}
                {error && <div style={{ fontSize: ".62rem", color: s.accent2, marginTop: 6 }}>⚠ {error}</div>}
                <button onClick={addRow} style={{ width: "100%", marginTop: 10, padding: 7, background: "transparent", color: s.accent2, border: `1px solid ${s.accent2}`, fontFamily: "monospace", fontSize: ".67rem", cursor: "pointer", borderRadius: 3 }}>
                  + ADD POINT
                </button>
              </div>
            )}

            {/* Groups Tab — view toggles */}
            {activeTab === "groups" && (
              <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
                <div style={{ fontSize: ".6rem", color: s.muted, background: "rgba(42,48,69,.35)", borderLeft: `2px solid ${s.accent}`, padding: "6px 9px", marginBottom: 12, lineHeight: 1.6 }}>
                  Click group name to <strong>SHOW/HIDE</strong>.<br />Click right side to cycle <strong>SPAN / DIAMOND / LINE</strong> mode.<br />Diamond = instant event, Line = vertical marker.
                </div>
                {groups.length === 0 && <div style={{ fontSize: ".62rem", color: s.muted }}>No groups loaded yet.</div>}
                {groups.map(group => {
                  const mode = groupModes[group] || "span";
                  const isSpecial = mode !== "span";
                  return (
                    <div key={group}
                      draggable
                      onDragStart={(e) => {
                        setDraggedGroup(group);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverGroup !== group) setDragOverGroup(group);
                      }}
                      onDragEnd={() => {
                        setDraggedGroup(null);
                        setDragOverGroup(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedGroup && draggedGroup !== group) {
                          let currentGroups = getGroups();
                          const draggedIdx = currentGroups.indexOf(draggedGroup);
                          const targetIdx = currentGroups.indexOf(group);
                          if (draggedIdx !== -1 && targetIdx !== -1) {
                            currentGroups.splice(draggedIdx, 1);
                            currentGroups.splice(targetIdx, 0, draggedGroup);
                            setCustomGroupOrder(currentGroups);
                            setSortMode("custom");
                          }
                        }
                        setDraggedGroup(null);
                        setDragOverGroup(null);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", marginBottom: 5, borderRadius: 4,
                        border: `1px solid ${isSpecial ? s.accent : s.border}`,
                        borderTop: dragOverGroup === group && draggedGroup !== group ? `2px solid ${s.accent}` : `1px solid ${isSpecial ? s.accent : s.border}`,
                        background: isSpecial ? "rgba(79,195,247,.07)" : "transparent",
                        opacity: draggedGroup === group ? 0.4 : 1
                      }}>
                      <div onClick={() => toggleGroup(group)} title={hiddenGroups[group] ? "Click to show group" : "Click to hide group"} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontSize: ".68rem", color: hiddenGroups[group] ? s.muted : (isSpecial ? s.accent : s.text), cursor: "pointer", textDecoration: hiddenGroups[group] ? "line-through" : "none" }}>
                        <EyeIcon closed={hiddenGroups[group]} />
                        {group}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div onClick={() => cycleGroupMode(group)} style={{ fontSize: ".65rem", color: isSpecial ? s.accent : s.muted, letterSpacing: ".06em", cursor: "pointer", padding: "2px 5px", background: "rgba(255,255,255,0.05)", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                          {mode === "diamond" ? "◆ DIAMOND" : mode === "line" ? "⦙ LINE" : "▬ SPAN"}
                        </div>
                        <div title="Drag to reorder" style={{ cursor: "grab", color: s.muted, fontSize: ".9rem" }}>
                          ☰
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Table Tab */}
            {activeTab === "table" && (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 5, padding: 8, background: s.surface2, borderBottom: `1px solid ${s.border}` }}>
                  <input type="text" placeholder="ID" value={tableFilterId} onChange={e => setTableFilterId(e.target.value)} style={{ flex: "0.5", background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px 2px", borderRadius: 2, outline: "none", minWidth: 0 }} />
                  <input type="text" placeholder="TIME" value={tableFilterTs} onChange={e => setTableFilterTs(e.target.value)} style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px 2px", borderRadius: 2, outline: "none", minWidth: 0 }} />
                  <MultiSelect options={allGroups} selected={tableFilterGroup} onChange={setTableFilterGroup} placeholder="GRP" />
                  <MultiSelect options={allValues} selected={tableFilterValue} onChange={setTableFilterValue} placeholder="VAL" />
                  <input type="text" placeholder="DUR" title={"Filter by duration.\nExamples:\n• >5 (greater than 5s)\n• <1h (less than 1 hour)\n• >=1.5d (greater or equal 1.5 days)\n• 10-20m (between 10 and 20 mins)\n• 30s (exactly 30s)"} value={tableFilterDur} onChange={e => setTableFilterDur(e.target.value)} style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px 2px", borderRadius: 2, outline: "none", minWidth: 0 }} />
                  <input type="text" placeholder="DUR_BEF" title={"Filter by duration before.\nExamples:\n• >5\n• <1h\n• 10-20m\n• 30s"} value={tableFilterDurBefore} onChange={e => setTableFilterDurBefore(e.target.value)} style={{ flex: 1, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontFamily: "monospace", fontSize: ".6rem", padding: "4px 2px", borderRadius: 2, outline: "none", minWidth: 0 }} />
                </div>
                <div style={{ padding: "4px 8px", fontSize: ".55rem", color: s.muted, background: s.surface2, borderBottom: `1px solid ${s.border}`, display: "flex", justifyContent: "space-between" }}>
                  <span>Showing {tableFilteredRows.length} of {rows.length} rows</span>
                  {(tableFilterId || tableFilterTs || tableFilterGroup.length > 0 || tableFilterValue.length > 0 || tableFilterDur || tableFilterDurBefore) && (
                    <span onClick={() => { setTableFilterId(""); setTableFilterTs(""); setTableFilterGroup([]); setTableFilterValue([]); setTableFilterDur(""); setTableFilterDurBefore(""); }} style={{ cursor: "pointer", color: s.accent }}>Clear filters</span>
                  )}
                </div>
                <div style={{ overflow: "auto", flex: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".58rem", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ color: s.muted, padding: "5px", borderBottom: `1px solid ${s.border}`, position: "sticky", top: 0, background: s.surface, cursor: "pointer", textAlign: "center", width: 24 }} onClick={() => setShowStarredOnly(!showStarredOnly)} title="Toggle Starred Only">
                          <span style={{ fontSize: "1rem", color: showStarredOnly ? "#ffb74d" : s.muted }}>{showStarredOnly ? "★" : "☆"}</span>
                        </th>
                        {["ID", "TIME", "GROUP", "VALUE", "DUR", "DUR_BEFORE", ""].map(h => (
                          <th key={h} style={{ color: s.muted, padding: "5px", borderBottom: `1px solid ${s.border}`, letterSpacing: ".07em", position: "sticky", top: 0, background: s.surface }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableFilteredRows.map((r, i) => {
                        const isHighlighted = highlight && highlight.r._id === r._id;
                        const bgDefault = isHighlighted ? "rgba(79,195,247,0.15)" : "transparent";
                        const bgHover = isHighlighted ? "rgba(79,195,247,0.25)" : "rgba(255,255,255,0.05)";
                        return (
                        <tr key={i} onClick={() => jumpToRow(r)} title="Click to view on chart" style={{ cursor: "pointer", background: bgDefault, transition: "background 0.2s" }}
                          onMouseEnter={e => e.currentTarget.style.background = bgHover}
                          onMouseLeave={e => e.currentTarget.style.background = bgDefault}>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)`, textAlign: "center" }}
                            onClick={(e) => { e.stopPropagation(); setStarred(s => ({ ...s, [r._id]: !s[r._id] })); }}>
                            <span style={{ color: starred[r._id] ? "#ffb74d" : s.muted, fontSize: "1rem" }}>{starred[r._id] ? "★" : "☆"}</span>
                          </td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)`, color: s.muted }}>{r._id}</td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)`, fontSize: ".57rem" }}>{fmtTs(r.ts)}</td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)` }}>{r.group}</td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)` }}>
                            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: colorMap[r.value] || "#888", marginRight: 4, verticalAlign: "middle" }} />
                            {r.value}
                          </td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)` }}>{fmtDur(r.dur) || "—"}</td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)` }}>{fmtDur(r.durBefore) || "—"}</td>
                          <td style={{ padding: "4px 5px", borderBottom: `1px solid rgba(42,48,69,.4)` }}>
                            <span onClick={(e) => { e.stopPropagation(); deleteRow(r._id); }} style={{ color: s.muted, cursor: "pointer" }}>✕</span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chart area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div ref={scrollRef} style={{ flex: 1, overflow: "auto", background: s.bg, position: "relative" }}>
            {!rows.length ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: s.muted, fontSize: ".72rem", letterSpacing: ".07em" }}>
                <div style={{ fontSize: "2rem", opacity: .15 }}>▬▬▬</div>
                <div>PASTE CSV AND CLICK RENDER PLOT</div>
              </div>
            ) : (
              <svg id="swim-svg" ref={chartSvgRef} width={W} height={H} style={{ display: "block", minWidth: W, userSelect: "none", cursor: dragMode === "pan" ? (panStart ? "grabbing" : "grab") : "crosshair" }}
                onMouseDown={e => {
                  if (e.button !== 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  if (x < LABEL_W) return;
                  if (dragMode === "pan") {
                    setPanStart({ x: e.clientX, tMin: tDomMin, tMax: tDomMax });
                  } else {
                    setDragStart(x);
                    setDragCurrent(x);
                  }
                }}
                onMouseMove={e => {
                  if (dragMode === "pan" && panStart) {
                    const dx = e.clientX - panStart.x;
                    const dt = (dx / (W - LABEL_W - PAD_R)) * span;
                    setTimeRange({ min: panStart.tMin - dt, max: panStart.tMax - dt });
                  } else if (dragStart !== null) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    let x = e.clientX - rect.left;
                    x = Math.max(LABEL_W, Math.min(x, rect.width - PAD_R));
                    setDragCurrent(x);
                  }
                }}
                onMouseUp={e => {
                  if (dragMode === "pan") {
                    setPanStart(null);
                  } else if (dragStart !== null && dragCurrent !== null) {
                    const minX = Math.min(dragStart, dragCurrent);
                    const maxX = Math.max(dragStart, dragCurrent);
                    if (maxX - minX > 10) {
                      const tsMin = tDomMin + (minX - LABEL_W) / (W - LABEL_W - PAD_R) * span;
                      const tsMax = tDomMin + (maxX - LABEL_W) / (W - LABEL_W - PAD_R) * span;
                      setTimeRange({ min: tsMin, max: tsMax });
                    }
                  }
                  setDragStart(null);
                  setDragCurrent(null);
                }}
                onMouseLeave={e => {
                  setPanStart(null);
                  setDragStart(null);
                  setDragCurrent(null);
                }}
              >
                <defs>
                  <clipPath id="chart-clip">
                    <rect x={LABEL_W} y={0} width={W - LABEL_W} height={H} />
                  </clipPath>
                </defs>
                <rect x={0} y={0} width={W} height={H} fill={s.bg} />

                {/* lane backgrounds (full width) */}
                {laneItems.map(({ group, gi, y }) => (
                  <g key={"bg-" + group}>
                    <rect x={0} y={y} width={W} height={LANE_H} fill={gi % 2 === 0 ? "#161a24" : "#12151e"} />
                    <line x1={0} y1={y + LANE_H} x2={W} y2={y + LANE_H} stroke={s.surface2} strokeWidth={0.5} />
                  </g>
                ))}

                <g clipPath="url(#chart-clip)">
                  {/* grid + axis ticks */}
                  {ticks.map((tick, i) => {
                    const x = xMap(tick.getTime());
                    return (
                      <g key={i}>
                        <line x1={x} y1={PAD_TOP + AXIS_H} x2={x} y2={gridBottom} stroke={s.border} strokeWidth={0.5} />
                        <text x={x} y={PAD_TOP + AXIS_H - 6} textAnchor="middle" fill={s.muted} fontFamily="monospace" fontSize={10}>
                          {fmtTick(tick, span)}
                        </text>
                      </g>
                    );
                  })}
                  <line x1={LABEL_W} y1={PAD_TOP + AXIS_H} x2={W - PAD_R} y2={PAD_TOP + AXIS_H} stroke={s.border} strokeWidth={1} />

                  {/* segments / diamonds / lines */}
                  {laneItems.map(({ group, y, cy, mode, items }) =>
                    items.map((item, i) => {
                      if (hiddenValues[item.ev.value]) return null;
                      const { ev, next, col, dur, durBefore, durLabel, x1, segW } = item;
                      const sy = y + 7, sh = LANE_H - 14;
                      const tooltipData = { group, ev, next, dur, durBefore, col, mode };

                      if (mode === "diamond") {
                        // ── DIAMOND MODE: marker + duration label after
                        return (
                          <g key={i}>
                            <DiamondMarker
                              cx={x1} cy={cy} size={DIAMOND_SIZE} col={col}
                              onMouseMove={e => { setTooltip({ ...tooltipData, isDiamond: true }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                              onMouseLeave={() => setTooltip(null)}
                            />
                            {/* dashed line to next */}
                            {next && (
                              <line x1={x1 + DIAMOND_SIZE} y1={cy} x2={xMap(next.ts.getTime()) - DIAMOND_SIZE} y2={cy}
                                stroke={col} strokeWidth={1} strokeDasharray="3 3" opacity={0.4}
                                style={{ pointerEvents: "none" }} />
                            )}
                            {/* value label above diamond */}
                            <text x={x1} y={cy - DIAMOND_SIZE - 4} textAnchor="middle"
                              fill={col} fontFamily="monospace" fontSize={9} fontWeight={700}
                              style={{ pointerEvents: "none" }}>
                              {ev.value}
                            </text>
                            {/* duration label below diamond */}
                            {durLabel && (
                              <text x={x1} y={cy + DIAMOND_SIZE + 12} textAnchor="middle"
                                fill="rgba(205,214,244,0.45)" fontFamily="monospace" fontSize={8}
                                style={{ pointerEvents: "none" }}>
                                {durLabel}
                              </text>
                            )}
                          </g>
                        );
                      } else if (mode === "line") {
                        // ── LINE MODE: vertical dotted line across the whole chart
                        return (
                          <g key={i}>
                            <line x1={x1} y1={PAD_TOP + AXIS_H} x2={x1} y2={gridBottom}
                              stroke={col} strokeWidth={1.5} strokeDasharray="6 4"
                              style={{ cursor: "pointer" }}
                              onMouseMove={e => { setTooltip({ ...tooltipData, isLine: true }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                              onMouseLeave={() => setTooltip(null)}
                            />
                            <circle cx={x1} cy={cy} r={3} fill={col} style={{ pointerEvents: "none" }} />
                            <text x={x1 + 6} y={cy + 3} fill={col} fontFamily="monospace" fontSize={9} fontWeight={700} style={{ pointerEvents: "none" }}>
                              {ev.value}
                            </text>
                          </g>
                        );
                      } else {
                        // ── SPAN MODE: filled rect + value + duration
                        const maxChars = Math.max(Math.floor(segW / 7) - 1, 0);
                        const valLabel = ev.value.length > maxChars ? ev.value.slice(0, maxChars - 1) + "…" : ev.value;
                        // build combined label: "warning · 30m"
                        const combinedLabel = durLabel ? `${valLabel} · ${durLabel}` : valLabel;
                        const combinedChars = Math.floor(segW / 7);
                        const finalLabel = combinedLabel.length > combinedChars
                          ? (durLabel && segW > 60
                            ? `${valLabel} ·${durLabel}`  // try shorter
                            : valLabel)
                          : combinedLabel;

                        return (
                          <g key={i}>
                            <rect x={x1} y={sy} width={segW} height={sh}
                              fill={col} opacity={0.82} rx={3} style={{ cursor: "pointer" }}
                              onMouseMove={e => { setTooltip(tooltipData); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                              onMouseLeave={() => setTooltip(null)} />
                            {/* value + duration inside segment */}
                            {segW > 28 && (
                              <text x={Math.max(x1, LABEL_W) + 6} y={sy + sh / 2 + 4}
                                textAnchor="start" fill="rgba(0,0,0,0.72)"
                                fontFamily="monospace" fontSize={9} fontWeight={700}
                                style={{ pointerEvents: "none" }}>
                                {finalLabel}
                              </text>
                            )}
                            {/* start tick */}
                            <line x1={x1} y1={sy} x2={x1} y2={sy + sh}
                              stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                            {/* event dot on center line */}
                            <circle cx={x1} cy={cy} r={4} fill={col} stroke={s.bg} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                          </g>
                        );
                      }
                    })
                  )}

                  {/* highlight overlay */}
                  {highlight && laneItems.map(({ group, cy, items }) => {
                    if (group !== highlight.r.group) return null;
                    const hItem = items.find(it => it.ev._id === highlight.r._id);
                    if (!hItem) return null;
                    return (
                      <circle key={highlight.time} cx={hItem.x1} cy={cy} fill="none" stroke={s.accent} className="highlight-pulse" style={{ pointerEvents: "none" }} />
                    );
                  })}
                </g>

                {/* labels container (drawn over data to mask overflow, outside clip path) */}
                {laneItems.map(({ group, gi, y, mode }) => (
                  <g key={"label-" + group}>
                    <rect x={0} y={y} width={LABEL_W} height={LANE_H} fill={gi % 2 === 0 ? "#1a1e2a" : "#151820"} />
                    {mode === "diamond" && (
                      <polygon
                        points={`${LABEL_W - 14},${y + LANE_H / 2} ${LABEL_W - 10},${y + LANE_H / 2 - 4} ${LABEL_W - 6},${y + LANE_H / 2} ${LABEL_W - 10},${y + LANE_H / 2 + 4}`}
                        fill={s.accent} opacity={0.7} />
                    )}
                    {mode === "line" && (
                      <line x1={LABEL_W - 10} y1={y + LANE_H / 2 - 6} x2={LABEL_W - 10} y2={y + LANE_H / 2 + 6} stroke={s.accent} strokeWidth={2} strokeDasharray="2 2" />
                    )}

                    {/* Eye icon for hiding group */}
                    <g transform={`translate(10, ${y + LANE_H / 2 - 7})`} style={{ cursor: "pointer", color: s.muted }} onClick={() => toggleGroup(group)}>
                      <title>Hide group</title>
                      <path d="M1 7s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="9" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </g>

                    <text x={34} y={y + LANE_H / 2 + 4} fill={s.text} fontFamily="monospace" fontSize={11.5} fontWeight={500} style={{ cursor: "pointer" }} onClick={() => toggleGroup(group)}>
                      {group.length > 13 ? group.slice(0, 12) + "…" : group}
                      <title>{group} (Click to hide)</title>
                    </text>
                    <line x1={LABEL_W} y1={y} x2={LABEL_W} y2={y + LANE_H} stroke={s.border} strokeWidth={1} />
                  </g>
                ))}

                {/* drag zoom overlay */}
                {dragStart !== null && dragCurrent !== null && (
                  <rect
                    x={Math.min(dragStart, dragCurrent)}
                    y={PAD_TOP + AXIS_H}
                    width={Math.abs(dragCurrent - dragStart)}
                    height={gridBottom - (PAD_TOP + AXIS_H)}
                    fill={s.accent}
                    opacity={0.2}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </svg>
            )}
          </div>

          {/* Legend with color pickers */}
          <div style={{ display: "flex", gap: 6, padding: "6px 16px", borderTop: `1px solid ${s.border}`, flexWrap: "wrap", background: s.surface, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: ".55rem", color: s.muted, letterSpacing: ".1em", marginRight: 4, flexShrink: 0 }}>VALUES</span>
            {values.map(val => {
              const col = colorMap[val] || "#888";
              return (
                <div key={val} style={{ display: "flex", alignItems: "center", gap: 0, fontSize: ".6rem", borderRadius: 3, border: `1px solid ${s.border}`, overflow: "hidden", opacity: hiddenValues[val] ? .35 : 1 }}>
                  {/* color swatch — click to pick */}
                  <span
                    title="Click to change color"
                    onClick={() => openPicker(val)}
                    style={{ width: 20, height: 20, background: col, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 8, color: "rgba(0,0,0,0.5)", fontWeight: 700 }}>
                    ✎
                  </span>
                  {/* label — click to toggle visibility */}
                  <span
                    onClick={() => toggleValue(val)}
                    title="Click to show/hide"
                    style={{ padding: "2px 8px", cursor: "pointer", color: hiddenValues[val] ? s.muted : s.text, userSelect: "none" }}>
                    {val}
                  </span>
                </div>
              );
            })}
            {/* hidden native color input */}
            <input ref={colorInputRef} type="color"
              value={pickerFor ? (colorMap[pickerFor] || "#ffffff") : "#ffffff"}
              onChange={handlePickerChange}
              style={{ width: 0, height: 0, opacity: 0, position: "absolute", pointerEvents: "none" }} />
          </div>

          {/* Status */}
          <div style={{ padding: "3px 16px", fontSize: ".57rem", color: s.muted, background: s.bg, borderTop: `1px solid ${s.border}`, flexShrink: 0, letterSpacing: ".05em" }}>
            {rows.length
              ? `${rows.length} events · ${activeGroups.length}/${groups.length} groups · ${values.length} values · zoom ${zoomLevel.toFixed(2)}x  |  cycle mode in GROUPS tab  |  ⇹ drag on plot to zoom/pan  |  ↕ scroll to pan (ctrl+scroll to zoom)`
              : "Ready — paste CSV and click Render Plot"}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltipPos.x + 14, top: tooltipPos.y - 10, background: s.surface2, border: `1px solid ${s.border}`, borderLeft: `3px solid ${tooltip.col}`, padding: "8px 12px", fontSize: ".65rem", borderRadius: 3, zIndex: 999, minWidth: 170, lineHeight: 1.8, pointerEvents: "none" }}>
          <div style={{ fontSize: ".8rem", fontWeight: 700, letterSpacing: ".05em", marginBottom: 3, color: tooltip.col }}>{tooltip.group}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>START <span style={{ color: s.text }}>{fmtTs(tooltip.ev.ts, true)}</span></div>
          {!tooltip.isDiamond && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>END <span style={{ color: s.text }}>{tooltip.next ? fmtTs(tooltip.next.ts, true) : "(last event)"}</span></div>}
          {!tooltip.isDiamond && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>DURATION <span style={{ color: s.text }}>{fmtDur(tooltip.dur) || "—"}</span></div>}
          {!tooltip.isDiamond && tooltip.durBefore !== undefined && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>DUR BEFORE <span style={{ color: s.text }}>{fmtDur(tooltip.durBefore) || "—"}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>ID <span style={{ color: s.text }}>{tooltip.ev._id}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: s.muted }}>VALUE <span style={{ color: tooltip.col, fontWeight: 700 }}>{tooltip.ev.value}</span></div>
        </div>
      )}
    </div>
  );
}
