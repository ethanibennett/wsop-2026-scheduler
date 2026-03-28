var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var { useState, useEffect, useMemo, useCallback, useRef } = React;
const BACKER_TYPE_LABELS = {
  pay_per_play: "Pay Per Play",
  open_commitment: "Open Commitment",
  budget_capped: "Budget Capped",
  flat_package: "Flat Package",
  profit_share_only: "Profit Share",
  makeup: "Makeup",
  tiered_markup: "Tiered Markup",
  swap: "Swap",
  crossbook: "Crossbook"
};
function StakingSettings({ token, tournaments, onBack }) {
  const [sellParams, setSellParams] = useState([]);
  const [markupSettings, setMarkupSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("sell");
  const BUYIN_TIERS = [
    { key: "0-500", label: "≤ $500" },
    { key: "500-1000", label: "$500–$1K" },
    { key: "1000-3000", label: "$1K–$3K" },
    { key: "3000-10000", label: "$3K–$10K" },
    { key: "10000+", label: "$10K+" }
  ];
  const GAME_PRESETS = useMemo(() => {
    if (!tournaments) return [];
    const vars = /* @__PURE__ */ new Set();
    tournaments.forEach((t) => {
      if (t.game_variant) vars.add(t.game_variant);
    });
    return [...vars].sort().slice(0, 12);
  }, [tournaments]);
  useEffect(() => {
    (async () => {
      try {
        const [sp, ms] = await Promise.all([
          fetch(`${API_URL}/staking/sell-params`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
          fetch(`${API_URL}/staking/markup-settings`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
        ]);
        if (Array.isArray(sp)) setSellParams(sp);
        if (Array.isArray(ms)) setMarkupSettings(ms);
      } catch (e) {
      }
      setLoading(false);
    })();
  }, []);
  const getSellPct = /* @__PURE__ */ __name((type, key) => {
    const p = sellParams.find((s) => s.param_type === type && s.param_key === key);
    return p ? p.sell_pct : "";
  }, "getSellPct");
  const setSellPct = /* @__PURE__ */ __name((type, key, val) => {
    setSellParams((prev) => {
      const idx = prev.findIndex((s) => s.param_type === type && s.param_key === key);
      const entry = { param_type: type, param_key: key, sell_pct: parseFloat(val) || 0 };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = __spreadValues(__spreadValues({}, copy[idx]), entry);
        return copy;
      }
      return [...prev, entry];
    });
  }, "setSellPct");
  const getMarkup = /* @__PURE__ */ __name((type, key) => {
    const m = markupSettings.find((s) => s.setting_type === type && s.setting_key === key);
    return m ? m.markup : "";
  }, "getMarkup");
  const setMarkupVal = /* @__PURE__ */ __name((type, key, val) => {
    setMarkupSettings((prev) => {
      const idx = prev.findIndex((s) => s.setting_type === type && s.setting_key === key);
      const entry = { setting_type: type, setting_key: key, markup: parseFloat(val) || 1 };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = __spreadValues(__spreadValues({}, copy[idx]), entry);
        return copy;
      }
      return [...prev, entry];
    });
  }, "setMarkupVal");
  const handleSave = /* @__PURE__ */ __name(async () => {
    setSaving(true);
    try {
      const validSell = sellParams.filter((s) => s.sell_pct > 0);
      const validMarkup = markupSettings.filter((m) => m.markup > 0);
      await Promise.all([
        fetch(`${API_URL}/staking/sell-params`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(validSell)
        }),
        fetch(`${API_URL}/staking/markup-settings`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(validMarkup)
        })
      ]);
    } catch (e) {
    }
    setSaving(false);
  }, "handleSave");
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text-muted)" } }, "Loading…");
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "0 0 20px" } }, /* @__PURE__ */ React.createElement("div", { className: "section-header", style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 8px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onBack, style: { fontSize: 16, padding: "4px 8px" } }, "←"), /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "Univers Condensed, Univers, sans-serif", textTransform: "uppercase", letterSpacing: 1, fontSize: 14, margin: 0, color: "var(--text-muted)" } }, "Sell & Markup Settings")), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 12, padding: "6px 14px" }, onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Save")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 0, borderBottom: "1px solid var(--border)", margin: "0 16px 12px" } }, [{ k: "sell", l: "Default Sell %" }, { k: "markup", l: "Default Markup" }].map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.k,
      style: {
        flex: 1,
        padding: "10px 0",
        fontSize: 12,
        fontWeight: tab === t.k ? 600 : 400,
        color: tab === t.k ? "var(--accent)" : "var(--text-muted)",
        borderBottom: tab === t.k ? "2px solid var(--accent)" : "2px solid transparent",
        background: "none",
        border: "none",
        cursor: "pointer"
      },
      onClick: () => setTab(t.k)
    },
    t.l
  ))), /* @__PURE__ */ React.createElement("div", { style: { padding: "0 16px" } }, tab === "sell" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" } }, "Set default sell percentages by buyin tier or game type. These are used when creating new agreements."), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" } }, "By Buyin Tier"), BUYIN_TIERS.map((tier) => /* @__PURE__ */ React.createElement("div", { key: tier.key, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12 } }, tier.label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: getSellPct("buyin_tier", tier.key),
      onChange: (e) => setSellPct("buyin_tier", tier.key, e.target.value),
      placeholder: "—",
      min: "0",
      max: "100",
      step: "5",
      style: { width: 60, textAlign: "right", fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "%"))))), GAME_PRESETS.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" } }, "By Game Type"), GAME_PRESETS.map((game) => /* @__PURE__ */ React.createElement("div", { key: game, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12 } }, game), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: getSellPct("game_type", game),
      onChange: (e) => setSellPct("game_type", game, e.target.value),
      placeholder: "—",
      min: "0",
      max: "100",
      step: "5",
      style: { width: 60, textAlign: "right", fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "%")))))), tab === "markup" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" } }, "Set default markup multipliers by buyin tier or game type. 1.0 = no markup, 1.1 = 10% markup."), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" } }, "By Buyin Tier"), BUYIN_TIERS.map((tier) => /* @__PURE__ */ React.createElement("div", { key: tier.key, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12 } }, tier.label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: getMarkup("buyin_tier", tier.key),
      onChange: (e) => setMarkupVal("buyin_tier", tier.key, e.target.value),
      placeholder: "—",
      min: "1",
      max: "3",
      step: "0.05",
      style: { width: 60, textAlign: "right", fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "×"))))), GAME_PRESETS.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" } }, "By Game Type"), GAME_PRESETS.map((game) => /* @__PURE__ */ React.createElement("div", { key: game, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12 } }, game), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: getMarkup("game_type", game),
      onChange: (e) => setMarkupVal("game_type", game, e.target.value),
      placeholder: "—",
      min: "1",
      max: "3",
      step: "0.05",
      style: { width: 60, textAlign: "right", fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)" } }, "×"))))))));
}
__name(StakingSettings, "StakingSettings");
function StakingView({ token, tournaments, mySchedule }) {
  const [subView, setSubView] = useState("list");
  const [series, setSeries] = useState([]);
  const [backers, setBackers] = useState([]);
  const [activeSeriesId, setActiveSeriesId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [editSeries, setEditSeries] = useState(null);
  const fetchSeries = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/staking/series`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSeries(await res.json());
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, "fetchSeries");
  const fetchBackers = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/staking/backers`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBackers(await res.json());
    } catch (e) {
    }
  }, "fetchBackers");
  useEffect(() => {
    fetchSeries();
    fetchBackers();
  }, []);
  const activeSeries = series.find((s) => s.id === activeSeriesId);
  if (subView === "settings") {
    return /* @__PURE__ */ React.createElement(StakingSettings, { token, tournaments, onBack: () => setSubView("list") });
  }
  if (subView === "backers") {
    return /* @__PURE__ */ React.createElement(BackerManager, { token, backers, fetchBackers, onBack: () => setSubView("list") });
  }
  if (subView === "detail" && activeSeries) {
    return /* @__PURE__ */ React.createElement(
      StakingSeriesDetail,
      {
        series: activeSeries,
        token,
        backers,
        tournaments,
        mySchedule,
        fetchSeries,
        onBack: () => {
          setSubView("list");
          setActiveSeriesId(null);
        },
        onEdit: () => {
          setEditSeries(activeSeries);
          setShowSeriesForm(true);
        }
      }
    );
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    StakingSeriesList,
    {
      series,
      loading,
      onSelect: (s) => {
        setActiveSeriesId(s.id);
        setSubView("detail");
      },
      onCreate: () => {
        setEditSeries(null);
        setShowSeriesForm(true);
      },
      onBackers: () => setSubView("backers"),
      onSettings: () => setSubView("settings")
    }
  ), showSeriesForm && /* @__PURE__ */ React.createElement(
    StakingSeriesForm,
    {
      token,
      series: editSeries,
      tournaments,
      onClose: () => {
        setShowSeriesForm(false);
        setEditSeries(null);
      },
      onSaved: () => {
        setShowSeriesForm(false);
        setEditSeries(null);
        fetchSeries();
      }
    }
  ));
}
__name(StakingView, "StakingView");
function StakingSeriesList({ series, loading, onSelect, onCreate, onBackers, onSettings }) {
  if (loading) return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: 40, color: "var(--text-muted)" } }, "Loading…");
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "0 0 20px" } }, /* @__PURE__ */ React.createElement("div", { className: "section-header", style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 8px" } }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "Univers Condensed, Univers, sans-serif", textTransform: "uppercase", letterSpacing: 1, fontSize: 14, margin: 0, color: "var(--text-muted)" } }, "Staking"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", style: { fontSize: 12, padding: "6px 10px", color: "var(--text-muted)" }, onClick: onSettings, title: "Sell & Markup Settings" }, "⚙"), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 12, padding: "6px 14px", background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }, onClick: onBackers }, "Backers"), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 12, padding: "6px 14px" }, onClick: onCreate }, "+ Series"))), series.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement(Icon.handshake, null), /* @__PURE__ */ React.createElement("h3", null, "No staking series yet"), /* @__PURE__ */ React.createElement("p", null, "Create a series to start tracking your staking deals")) : series.map((s) => /* @__PURE__ */ React.createElement("button", { key: s.id, className: "staking-series-card", onClick: () => onSelect(s) }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, s.name), s.venue && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginTop: 2 } }, s.venue), (s.start_date || s.end_date) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } }, s.start_date && (/* @__PURE__ */ new Date(s.start_date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" }), s.start_date && s.end_date && " – ", s.end_date && (/* @__PURE__ */ new Date(s.end_date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: `staking-badge staking-badge-${s.status}` }, s.status === "pre" ? "Pre" : s.status === "active" ? "Active" : "Settled"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)", fontSize: 16 } }, "›"))))));
}
__name(StakingSeriesList, "StakingSeriesList");
function StakingSeriesForm({ token, series, tournaments, onClose, onSaved }) {
  const [name, setName] = useState((series == null ? void 0 : series.name) || "");
  const [venue, setVenue] = useState((series == null ? void 0 : series.venue) || "");
  const [startDate, setStartDate] = useState((series == null ? void 0 : series.start_date) || "");
  const [endDate, setEndDate] = useState((series == null ? void 0 : series.end_date) || "");
  const [currency, setCurrency] = useState((series == null ? void 0 : series.currency) || "USD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const venueOptions = useMemo(() => {
    if (!tournaments) return [];
    return [...new Set(tournaments.map((t) => t.venue))].sort();
  }, [tournaments]);
  const handleSave = /* @__PURE__ */ __name(async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { name: name.trim(), venue: venue || void 0, startDate: startDate || void 0, endDate: endDate || void 0, currency };
      const url = series ? `${API_URL}/staking/series/${series.id}` : `${API_URL}/staking/series`;
      const res = await fetch(url, {
        method: series ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        onSaved();
      } else {
        const d = await res.json();
        setError(d.error || "Failed to save");
      }
    } catch (e) {
      setError("Network error");
    }
    setSaving(false);
  }, "handleSave");
  const handleDelete = /* @__PURE__ */ __name(async () => {
    if (!series || !confirm("Delete this series and all its agreements? This cannot be undone.")) return;
    try {
      await fetch(`${API_URL}/staking/series/${series.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      onSaved();
    } catch (e) {
    }
  }, "handleDelete");
  return ReactDOM.createPortal(
    /* @__PURE__ */ React.createElement("div", { className: "notif-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "staking-modal", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "staking-modal-header" }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, series ? "Edit Series" : "New Series"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onClose }, "✕")), /* @__PURE__ */ React.createElement("div", { className: "staking-modal-body" }, error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ef4444", fontSize: 12, marginBottom: 8 } }, error), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Series *"), /* @__PURE__ */ React.createElement("select", { value: name, onChange: (e) => {
      const v = e.target.value;
      setName(v);
      if (v) setVenue(v);
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Select a series…"), venueOptions.map((v) => /* @__PURE__ */ React.createElement("option", { key: v, value: v }, v)))), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Venue"), /* @__PURE__ */ React.createElement("input", { type: "text", value: venue, onChange: (e) => setVenue(e.target.value), placeholder: "Auto-filled from series" })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Start Date"), /* @__PURE__ */ React.createElement("input", { type: "date", value: startDate, onChange: (e) => setStartDate(e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "End Date"), /* @__PURE__ */ React.createElement("input", { type: "date", value: endDate, onChange: (e) => setEndDate(e.target.value) }))), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Currency"), /* @__PURE__ */ React.createElement("select", { value: currency, onChange: (e) => setCurrency(e.target.value) }, ["USD", "EUR", "GBP", "CAD", "AUD", "CNY", "JPY", "CHF", "SEK", "NOK", "DKK", "MXN", "BRL"].map((c) => /* @__PURE__ */ React.createElement("option", { key: c }, c))))), /* @__PURE__ */ React.createElement("div", { className: "staking-modal-footer" }, series && /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", style: { color: "#ef4444" }, onClick: handleDelete }, "Delete"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 13, padding: "8px 20px" }, onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Save")))),
    document.body
  );
}
__name(StakingSeriesForm, "StakingSeriesForm");
function BackerManager({ token, backers, fetchBackers, onBack }) {
  const [showForm, setShowForm] = useState(false);
  const [editBacker, setEditBacker] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const resetForm = /* @__PURE__ */ __name(() => {
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setEditBacker(null);
    setShowForm(false);
    setError("");
  }, "resetForm");
  const openEdit = /* @__PURE__ */ __name((b) => {
    setEditBacker(b);
    setName(b.name);
    setEmail(b.email || "");
    setPhone(b.phone || "");
    setNotes(b.notes || "");
    setShowForm(true);
  }, "openEdit");
  const handleSave = /* @__PURE__ */ __name(async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { name: name.trim(), email: email || void 0, phone: phone || void 0, notes: notes || void 0 };
      const url = editBacker ? `${API_URL}/staking/backers/${editBacker.id}` : `${API_URL}/staking/backers`;
      const res = await fetch(url, {
        method: editBacker ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        resetForm();
        fetchBackers();
      } else {
        const d = await res.json();
        setError(d.error || "Failed");
      }
    } catch (e) {
      setError("Network error");
    }
    setSaving(false);
  }, "handleSave");
  const handleDelete = /* @__PURE__ */ __name(async (id) => {
    if (!confirm("Delete this backer?")) return;
    try {
      const res = await fetch(`${API_URL}/staking/backers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed");
      } else fetchBackers();
    } catch (e) {
    }
  }, "handleDelete");
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "group-detail-header" }, /* @__PURE__ */ React.createElement("button", { className: "group-back-btn", onClick: onBack }, "←"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "social-buddy-name", style: { fontSize: 16 } }, "Backers")), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 12, padding: "6px 14px" }, onClick: () => {
    resetForm();
    setShowForm(!showForm);
  } }, showForm ? "Cancel" : "+ Add")), showForm && /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--border)" } }, error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ef4444", fontSize: 12, marginBottom: 8 } }, error), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Name *"), /* @__PURE__ */ React.createElement("input", { type: "text", value: name, onChange: (e) => setName(e.target.value), placeholder: "Backer name" })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Email"), /* @__PURE__ */ React.createElement("input", { type: "text", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "email@example.com" })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Phone"), /* @__PURE__ */ React.createElement("input", { type: "text", value: phone, onChange: (e) => setPhone(e.target.value), placeholder: "Phone number" })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Notes"), /* @__PURE__ */ React.createElement("input", { type: "text", value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "Notes" })), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 13, padding: "8px 20px", width: "100%" }, onClick: handleSave, disabled: saving }, saving ? "Saving…" : editBacker ? "Update Backer" : "Add Backer")), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px" } }, backers.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement(Icon.people, null), /* @__PURE__ */ React.createElement("h3", null, "No backers yet"), /* @__PURE__ */ React.createElement("p", null, "Add your backers to start creating staking agreements")) : backers.map((b) => /* @__PURE__ */ React.createElement("div", { key: b.id, className: "staking-backer-card" }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, b.name), b.email && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)" } }, b.email), b.phone && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)" } }, b.phone), b.notes && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 } }, b.notes)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => openEdit(b), style: { fontSize: 11 } }, "Edit"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => handleDelete(b.id), style: { fontSize: 11, color: "#ef4444" } }, "✕"))))));
}
__name(BackerManager, "BackerManager");
function StakingSeriesDetail({ series, token, backers, tournaments, mySchedule, fetchSeries, onBack, onEdit }) {
  const [segment, setSegment] = useState("agreements");
  const [agreements, setAgreements] = useState([]);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [eventStatuses, setEventStatuses] = useState([]);
  const [settlementData, setSettlementData] = useState(null);
  const fetchAgreements = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/staking/series/${series.id}/agreements`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAgreements(await res.json());
    } catch (e) {
    }
  }, "fetchAgreements");
  const fetchEvents = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/staking/series/${series.id}/events`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEventStatuses(await res.json());
    } catch (e) {
    }
  }, "fetchEvents");
  const fetchSettlement = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/staking/series/${series.id}/settlement`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSettlementData(await res.json());
    } catch (e) {
    }
  }, "fetchSettlement");
  useEffect(() => {
    fetchAgreements();
  }, [series.id]);
  useEffect(() => {
    if (segment === "events") fetchEvents();
    if (segment === "settlement") fetchSettlement();
  }, [segment, series.id]);
  const totalPct = useMemo(() => agreements.filter((a) => a.is_active && a.backer_type !== "profit_share_only").reduce((s, a) => s + (a.percentage || 0), 0), [agreements]);
  return /* @__PURE__ */ React.createElement("div", { className: "group-detail-view" }, /* @__PURE__ */ React.createElement("div", { className: "group-detail-header" }, /* @__PURE__ */ React.createElement("button", { className: "group-back-btn", onClick: onBack }, "←"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "social-buddy-name", style: { fontSize: 16 } }, series.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)" } }, agreements.length, " agreement", agreements.length !== 1 ? "s" : "", " · ", totalPct, "% sold")), /* @__PURE__ */ React.createElement("span", { className: `staking-badge staking-badge-${series.status}` }, series.status === "pre" ? "Pre" : series.status === "active" ? "Active" : "Settled"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onEdit, style: { fontSize: 12, marginLeft: 4 } }, "✎")), /* @__PURE__ */ React.createElement("div", { className: "group-segments" }, ["agreements", "events", "settlement"].map((s) => /* @__PURE__ */ React.createElement("button", { key: s, className: `group-segment-btn${segment === s ? " active" : ""}`, onClick: () => setSegment(s) }, s === "agreements" ? "Agreements" : s === "events" ? "Events" : "Settlement"))), segment === "agreements" && /* @__PURE__ */ React.createElement(
    AgreementsList,
    {
      agreements,
      token,
      seriesId: series.id,
      backers,
      fetchAgreements,
      onAdd: () => setShowAgreementForm(true)
    }
  ), segment === "events" && /* @__PURE__ */ React.createElement(
    StakingEventTracking,
    {
      seriesId: series.id,
      agreements,
      eventStatuses,
      tournaments,
      mySchedule,
      series,
      token,
      fetchEvents
    }
  ), segment === "settlement" && /* @__PURE__ */ React.createElement(
    StakingSettlementView,
    {
      seriesId: series.id,
      settlementData,
      token,
      fetchSettlement,
      fetchSeries
    }
  ), showAgreementForm && /* @__PURE__ */ React.createElement(
    AgreementForm,
    {
      token,
      seriesId: series.id,
      backers,
      tournaments,
      onClose: () => setShowAgreementForm(false),
      onSaved: () => {
        setShowAgreementForm(false);
        fetchAgreements();
      }
    }
  ));
}
__name(StakingSeriesDetail, "StakingSeriesDetail");
function AgreementsList({ agreements, token, seriesId, backers, fetchAgreements, onAdd }) {
  const handleDelete = /* @__PURE__ */ __name(async (id) => {
    if (!confirm("Delete this agreement?")) return;
    try {
      await fetch(`${API_URL}/staking/agreements/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      fetchAgreements();
    } catch (e) {
    }
  }, "handleDelete");
  const toggleActive = /* @__PURE__ */ __name(async (ag) => {
    try {
      await fetch(`${API_URL}/staking/agreements/${ag.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: ag.is_active ? false : true })
      });
      fetchAgreements();
    } catch (e) {
    }
  }, "toggleActive");
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px" } }, /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 13, padding: "8px 16px", marginBottom: 12, width: "100%" }, onClick: onAdd }, "+ Add Agreement"), agreements.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "30px 20px", fontSize: 13 } }, "No agreements yet. Add a backer agreement to get started.") : agreements.map((ag) => /* @__PURE__ */ React.createElement("div", { key: ag.id, className: `staking-agreement-card${ag.is_active ? "" : " inactive"}` }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, ag.backer_name), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { className: "staking-type-badge" }, BACKER_TYPE_LABELS[ag.backer_type] || ag.backer_type), ag.backer_type !== "profit_share_only" && ag.percentage > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } }, ag.percentage, "%"), ag.markup > 1 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--accent)" } }, ag.markup, "x markup"), ag.backer_type === "profit_share_only" && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--text-secondary)" } }, ag.percentage, "% of profit")), (ag.buyin_range_min || ag.buyin_range_max) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } }, "Buyin range: ", ag.buyin_range_min ? formatBuyin(ag.buyin_range_min) : "$0", " – ", ag.buyin_range_max ? formatBuyin(ag.buyin_range_max) : "∞"), (ag.scope === "custom_dates" || ag.variant_filter || ag.start_date) && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 } }, ag.scope === "custom_dates" && ag.start_date && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4, color: "var(--text-muted)" } }, ag.start_date, ag.end_date ? ` → ${ag.end_date}` : "+"), ag.variant_filter && (() => {
    try {
      const vf = JSON.parse(ag.variant_filter);
      return vf.map((v) => /* @__PURE__ */ React.createElement("span", { key: v, style: { fontSize: 10, background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4, color: "var(--text-muted)" } }, v));
    } catch (e) {
      return null;
    }
  })())), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, /* @__PURE__ */ React.createElement("label", { className: "toggle-switch", style: { width: 32, height: 18 }, title: ag.is_active ? "Active" : "Inactive" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!ag.is_active, onChange: () => toggleActive(ag) }), /* @__PURE__ */ React.createElement("span", { className: "toggle-slider" })), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => handleDelete(ag.id), style: { fontSize: 11, color: "#ef4444", padding: "2px 4px" } }, "✕"))))));
}
__name(AgreementsList, "AgreementsList");
function AgreementForm({ token, seriesId, backers, onClose, onSaved, tournaments }) {
  const [backerId, setBackerId] = useState("");
  const [backerType, setBackerType] = useState("pay_per_play");
  const [percentage, setPercentage] = useState("");
  const [markup, setMarkup] = useState("1.0");
  const [buyinMin, setBuyinMin] = useState("");
  const [buyinMax, setBuyinMax] = useState("");
  const [scope, setScope] = useState("series");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [variantFilter, setVariantFilter] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const availableVariants = useMemo(() => {
    if (!tournaments || tournaments.length === 0) return [];
    const variants = /* @__PURE__ */ new Set();
    tournaments.forEach((t) => {
      if (t.game_variant) variants.add(t.game_variant);
    });
    return [...variants].sort();
  }, [tournaments]);
  const mvpTypes = ["pay_per_play", "flat_package", "profit_share_only"];
  const handleSave = /* @__PURE__ */ __name(async () => {
    if (!backerId) {
      setError("Select a backer");
      return;
    }
    const pct = parseFloat(percentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError("Percentage must be 1–100");
      return;
    }
    const mkp = parseFloat(markup);
    if (backerType !== "profit_share_only" && (isNaN(mkp) || mkp < 1)) {
      setError("Markup must be ≥ 1.0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        backerId: Number(backerId),
        backerType,
        percentage: pct,
        markup: backerType === "profit_share_only" ? 1 : mkp,
        buyinRangeMin: buyinMin ? Number(buyinMin) : void 0,
        buyinRangeMax: buyinMax ? Number(buyinMax) : void 0,
        scope,
        startDate: startDate || void 0,
        endDate: endDate || void 0,
        variantFilter: variantFilter.length > 0 ? variantFilter : void 0,
        buyinMin: buyinMin ? Number(buyinMin) : void 0,
        buyinMax: buyinMax ? Number(buyinMax) : void 0
      };
      const res = await fetch(`${API_URL}/staking/series/${seriesId}/agreements`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) onSaved();
      else {
        const d = await res.json();
        setError(d.error || "Failed");
      }
    } catch (e) {
      setError("Network error");
    }
    setSaving(false);
  }, "handleSave");
  return ReactDOM.createPortal(
    /* @__PURE__ */ React.createElement("div", { className: "notif-backdrop", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "staking-modal", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "staking-modal-header" }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, "Add Agreement"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onClose }, "✕")), /* @__PURE__ */ React.createElement("div", { className: "staking-modal-body" }, error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ef4444", fontSize: 12, marginBottom: 8 } }, error), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Backer *"), /* @__PURE__ */ React.createElement("select", { value: backerId, onChange: (e) => setBackerId(e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Select a backer…"), backers.map((b) => /* @__PURE__ */ React.createElement("option", { key: b.id, value: b.id }, b.name)))), /* @__PURE__ */ React.createElement("div", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Type"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, mvpTypes.map((t) => /* @__PURE__ */ React.createElement("button", { key: t, className: `filter-chip${backerType === t ? " active" : ""}`, onClick: () => setBackerType(t) }, BACKER_TYPE_LABELS[t])))), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Percentage *"), /* @__PURE__ */ React.createElement("input", { type: "number", value: percentage, onChange: (e) => setPercentage(e.target.value), placeholder: "e.g. 50", min: "1", max: "100", step: "1" })), backerType !== "profit_share_only" && /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Markup"), /* @__PURE__ */ React.createElement("input", { type: "number", value: markup, onChange: (e) => setMarkup(e.target.value), placeholder: "1.0 = no markup", min: "1", step: "0.1" })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Min Buyin"), /* @__PURE__ */ React.createElement("input", { type: "number", value: buyinMin, onChange: (e) => setBuyinMin(e.target.value), placeholder: "Optional" })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Max Buyin"), /* @__PURE__ */ React.createElement("input", { type: "number", value: buyinMax, onChange: (e) => setBuyinMax(e.target.value), placeholder: "Optional" }))), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", style: { fontSize: 11, color: "var(--text-muted)", marginTop: 4, padding: "4px 0" }, onClick: () => setShowAdvanced(!showAdvanced) }, showAdvanced ? "▾ Hide Advanced" : "▸ Advanced Options"), showAdvanced && /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 } }, /* @__PURE__ */ React.createElement("div", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Scope"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, ["series", "custom_dates"].map((s) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: s,
        className: `filter-chip${scope === s ? " active" : ""}`,
        onClick: () => setScope(s)
      },
      s === "series" ? "Full Series" : "Custom Dates"
    )))), scope === "custom_dates" && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Start Date"), /* @__PURE__ */ React.createElement("input", { type: "date", value: startDate, onChange: (e) => setStartDate(e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "End Date"), /* @__PURE__ */ React.createElement("input", { type: "date", value: endDate, onChange: (e) => setEndDate(e.target.value) }))), availableVariants.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "staking-field" }, /* @__PURE__ */ React.createElement("span", null, "Game Filter"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 80, overflowY: "auto" } }, availableVariants.map((v) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: v,
        className: `filter-chip${variantFilter.includes(v) ? " active" : ""}`,
        style: { fontSize: 10, padding: "2px 8px" },
        onClick: () => setVariantFilter((f) => f.includes(v) ? f.filter((x) => x !== v) : [...f, v])
      },
      v
    ))), variantFilter.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--text-muted)", marginTop: 2 } }, variantFilter.length, " game", variantFilter.length !== 1 ? "s" : "", " selected")))), /* @__PURE__ */ React.createElement("div", { className: "staking-modal-footer" }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 13, padding: "8px 20px" }, onClick: handleSave, disabled: saving }, saving ? "Saving…" : "Add")))),
    document.body
  );
}
__name(AgreementForm, "AgreementForm");
function StakingEventTracking({ seriesId, agreements, eventStatuses, tournaments, mySchedule, series, token, fetchEvents }) {
  const [logFor, setLogFor] = useState(null);
  const [bullets, setBullets] = useState("1");
  const [buyinAmt, setBuyinAmt] = useState("");
  const [cashAmt, setCashAmt] = useState("");
  const [tipAmt, setTipAmt] = useState("");
  const [saving, setSaving] = useState(false);
  const seriesEvents = useMemo(() => {
    if (!mySchedule || !tournaments) return [];
    const schedIds = new Set(mySchedule.map((s) => s.tournament_id || s.id));
    return tournaments.filter((t) => {
      if (!schedIds.has(t.id)) return false;
      if (series.start_date && t.date < series.start_date) return false;
      if (series.end_date && t.date > series.end_date) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  }, [mySchedule, tournaments, series]);
  const statusMap = useMemo(() => {
    const m = {};
    for (const es of eventStatuses) {
      m[`${es.tournament_id}_${es.agreement_id}`] = es;
    }
    return m;
  }, [eventStatuses]);
  const handleLog = /* @__PURE__ */ __name(async () => {
    if (!logFor) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/staking/events/${logFor.agreementId}/${logFor.tournamentId}/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          bulletsUsed: Number(bullets) || 1,
          buyinAmount: Number(buyinAmt) || 0,
          cashAmount: Number(cashAmt) || 0,
          tipAmount: Number(tipAmt) || 0
        })
      });
      setLogFor(null);
      setBullets("1");
      setBuyinAmt("");
      setCashAmt("");
      setTipAmt("");
      fetchEvents();
    } catch (e) {
    }
    setSaving(false);
  }, "handleLog");
  const activeAgreements = agreements.filter((a) => a.is_active);
  if (activeAgreements.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "30px 20px", fontSize: 13 } }, "Add active agreements first to track events.");
  }
  if (seriesEvents.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "30px 20px", fontSize: 13 } }, "No scheduled tournaments in this series date range.");
  }
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px" } }, seriesEvents.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: "staking-event-card" }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, t.event_name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginBottom: 6 } }, t.date, " · ", t.time, " · ", formatBuyin(t.buyin)), activeAgreements.map((ag) => {
    const key = `${t.id}_${ag.id}`;
    const status = statusMap[key];
    const isLogging = logFor && logFor.agreementId === ag.id && logFor.tournamentId === t.id;
    return /* @__PURE__ */ React.createElement("div", { key: ag.id, style: { borderTop: "1px solid var(--border)", padding: "6px 0" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 500 } }, ag.backer_name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)", marginLeft: 4 } }, ag.percentage, "%")), status ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11 } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)" } }, "B:", status.bullets_used || 1), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, color: "var(--text-secondary)" } }, "In:", formatBuyin(status.buyin_amount || 0)), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, color: (status.cash_amount || 0) > 0 ? "#22c55e" : "var(--text-muted)" } }, "Out:", formatBuyin(status.cash_amount || 0))) : /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", style: { fontSize: 11, color: "var(--accent)" }, onClick: () => {
      setLogFor({ agreementId: ag.id, tournamentId: t.id });
      setBuyinAmt(String(t.buyin || ""));
    } }, "Log")), isLogging && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 6 } }, /* @__PURE__ */ React.createElement("label", { className: "staking-field", style: { marginBottom: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "Bullets"), /* @__PURE__ */ React.createElement("input", { type: "number", value: bullets, onChange: (e) => setBullets(e.target.value), min: "1" })), /* @__PURE__ */ React.createElement("label", { className: "staking-field", style: { marginBottom: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "Buyin"), /* @__PURE__ */ React.createElement("input", { type: "number", value: buyinAmt, onChange: (e) => setBuyinAmt(e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "staking-field", style: { marginBottom: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "Cash"), /* @__PURE__ */ React.createElement("input", { type: "number", value: cashAmt, onChange: (e) => setCashAmt(e.target.value) })), /* @__PURE__ */ React.createElement("label", { className: "staking-field", style: { marginBottom: 0 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "Tip"), /* @__PURE__ */ React.createElement("input", { type: "number", value: tipAmt, onChange: (e) => setTipAmt(e.target.value) })), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "span 4", display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("button", { className: "create-group-submit", style: { fontSize: 11, padding: "6px 12px", flex: 1 }, onClick: handleLog, disabled: saving }, saving ? "…" : "Save"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", style: { fontSize: 11 }, onClick: () => setLogFor(null) }, "Cancel"))));
  }))));
}
__name(StakingEventTracking, "StakingEventTracking");
function StakingSettlementView({ seriesId, settlementData, token, fetchSettlement, fetchSeries }) {
  const [settling, setSettling] = useState(false);
  const handleFinalize = /* @__PURE__ */ __name(async () => {
    if (!confirm("Finalize settlement? This will lock in the P&L calculations.")) return;
    setSettling(true);
    try {
      const res = await fetch(`${API_URL}/staking/series/${seriesId}/settle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settlements: (settlementData == null ? void 0 : settlementData.settlements) || [] })
      });
      if (res.ok) {
        fetchSettlement();
        fetchSeries();
      }
    } catch (e) {
    }
    setSettling(false);
  }, "handleFinalize");
  const handleMarkPaid = /* @__PURE__ */ __name(async (settlementId, isPaid) => {
    try {
      await fetch(`${API_URL}/staking/settlements/${settlementId}/paid`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isPaid: !isPaid })
      });
      fetchSettlement();
    } catch (e) {
    }
  }, "handleMarkPaid");
  if (!settlementData) {
    return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "30px 20px", fontSize: 13 } }, "Loading settlement data…");
  }
  const settlements = settlementData.settlements || [];
  if (settlements.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "30px 20px", fontSize: 13 } }, "No agreements to settle. Add agreements and log events first.");
  }
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 16px" } }, settlements.map((s, i) => {
    const netPl = (s.gross_return || s.grossReturn || 0) - (s.gross_investment || s.grossInvestment || 0);
    const amtOwed = s.amount_owed || s.amountOwed || 0;
    return /* @__PURE__ */ React.createElement("div", { key: s.backer_id || s.backerId || i, className: "staking-settlement-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, s.backer_name || s.backerName || "Backer"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } }, BACKER_TYPE_LABELS[s.backer_type || s.backerType] || s.backer_type || s.backerType || "", " · ", s.percentage || 0, "%")), s.id && /* @__PURE__ */ React.createElement("label", { className: "toggle-switch", style: { width: 32, height: 18 }, title: s.is_paid ? "Paid" : "Unpaid" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!s.is_paid, onChange: () => handleMarkPaid(s.id, s.is_paid) }), /* @__PURE__ */ React.createElement("span", { className: "toggle-slider" }))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", null, "Invested: ", /* @__PURE__ */ React.createElement("strong", null, formatBuyin(s.gross_investment || s.grossInvestment || 0))), /* @__PURE__ */ React.createElement("div", null, "Returned: ", /* @__PURE__ */ React.createElement("strong", null, formatBuyin(s.gross_return || s.grossReturn || 0))), (s.markup_amount || s.markupAmount) > 0 && /* @__PURE__ */ React.createElement("div", null, "Markup: ", /* @__PURE__ */ React.createElement("strong", null, formatBuyin(s.markup_amount || s.markupAmount || 0))), /* @__PURE__ */ React.createElement("div", null, "Owed: ", /* @__PURE__ */ React.createElement("strong", { className: amtOwed >= 0 ? "staking-pnl-pos" : "staking-pnl-neg" }, formatBuyin(Math.abs(amtOwed))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 14, fontWeight: 700 }, className: netPl >= 0 ? "staking-pnl-pos" : "staking-pnl-neg" }, netPl >= 0 ? "+" : "", formatBuyin(netPl), " net"), s.is_paid && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#22c55e", marginTop: 4 } }, "✓ Paid", s.paid_at ? ` · ${new Date(s.paid_at).toLocaleDateString()}` : ""));
  }), !settlementData.isSettled && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "create-group-submit",
      style: { fontSize: 13, padding: "10px 20px", width: "100%", marginTop: 12 },
      onClick: handleFinalize,
      disabled: settling
    },
    settling ? "Finalizing…" : "Finalize Settlement"
  ));
}
__name(StakingSettlementView, "StakingSettlementView");
window.BACKER_TYPE_LABELS = BACKER_TYPE_LABELS;
window.StakingSettings = StakingSettings;
window.StakingView = StakingView;
window.StakingSeriesList = StakingSeriesList;
window.StakingSeriesForm = StakingSeriesForm;
window.BackerManager = BackerManager;
window.StakingSeriesDetail = StakingSeriesDetail;
window.AgreementsList = AgreementsList;
window.AgreementForm = AgreementForm;
window.StakingEventTracking = StakingEventTracking;
window.StakingSettlementView = StakingSettlementView;
//# sourceMappingURL=staking.js.map
