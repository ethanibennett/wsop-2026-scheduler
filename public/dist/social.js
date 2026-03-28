var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
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
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var { useState, useEffect, useMemo, useCallback, useRef } = React;
function SocialView({
  shareBuddies,
  buddyLiveUpdates,
  displayName,
  myGroups,
  activeGroupId,
  setActiveGroupId,
  groupFeed,
  groupSchedule,
  fetchGroupFeed,
  fetchGroupSchedule,
  fetchMyGroups,
  token,
  onRemoveBuddy,
  fetchShareBuddies,
  onNavigate
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [buddySchedules, setBuddySchedules] = useState({});
  const [loadingSchedule, setLoadingSchedule] = useState(null);
  const [addToGroupBuddyId, setAddToGroupBuddyId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [inviteStatus, setInviteStatus] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const searchTimerRef = useRef(null);
  const handleSearchChange = /* @__PURE__ */ __name((val) => {
    setSearchQuery(val);
    setSearchMsg("");
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(val.trim())}`, {
          headers: { Authorization: "Bearer " + token }
        });
        if (res.ok) setSearchResults(await res.json());
        else setSearchResults([]);
      } catch (e) {
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 300);
  }, "handleSearchChange");
  const handleSendRequest = /* @__PURE__ */ __name(async (username) => {
    try {
      const res = await fetch(`${API_URL}/share-request`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchMsg(data.error || "Failed");
        return;
      }
      setSearchMsg("Request sent to " + username);
      setSearchResults((prev) => prev.filter((u) => u.username !== username));
      if (fetchShareBuddies) fetchShareBuddies();
    } catch (e) {
      setSearchMsg("Failed to send request");
    }
  }, "handleSendRequest");
  const handleInviteToGroup = /* @__PURE__ */ __name(async (buddyId, groupId, username) => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/members`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        setInviteStatus((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: __spreadProps(__spreadValues({}, prev[buddyId]), { [groupId]: "sent" }) }));
      } else {
        const data = await res.json();
        if (data.error && /already/i.test(data.error)) {
          setInviteStatus((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: __spreadProps(__spreadValues({}, prev[buddyId]), { [groupId]: "member" }) }));
        } else {
          setInviteStatus((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: __spreadProps(__spreadValues({}, prev[buddyId]), { [groupId]: "error" }) }));
        }
      }
    } catch (e) {
      setInviteStatus((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: __spreadProps(__spreadValues({}, prev[buddyId]), { [groupId]: "error" }) }));
    }
  }, "handleInviteToGroup");
  const toggleBuddy = /* @__PURE__ */ __name((buddyId) => {
    if (expandedId === buddyId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(buddyId);
    if (!buddySchedules[buddyId]) {
      setLoadingSchedule(buddyId);
      fetch(`${API_URL}/schedule/${buddyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then((r) => r.json()).then((data) => {
        setBuddySchedules((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: Array.isArray(data) ? data : [] }));
        setLoadingSchedule(null);
      }).catch(() => {
        setBuddySchedules((prev) => __spreadProps(__spreadValues({}, prev), { [buddyId]: [] }));
        setLoadingSchedule(null);
      });
    }
  }, "toggleBuddy");
  if (activeGroupId) {
    const group = myGroups.find((g) => g.id === activeGroupId);
    return /* @__PURE__ */ React.createElement(
      GroupDetailView,
      {
        group,
        groupFeed,
        groupSchedule,
        fetchGroupFeed,
        fetchGroupSchedule,
        fetchMyGroups,
        shareBuddies,
        buddyLiveUpdates,
        displayName,
        token,
        onBack: () => {
          setActiveGroupId(null);
          setExpandedId(null);
        }
      }
    );
  }
  const hasBuddies = shareBuddies && shareBuddies.length > 0;
  const hasGroups = myGroups && myGroups.length > 0;
  const searchBar = /* @__PURE__ */ React.createElement("div", { style: { position: "relative", marginBottom: "12px" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: "Search by username or name...",
      value: searchQuery,
      onChange: (e) => handleSearchChange(e.target.value),
      style: {
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 12px",
        border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "'Univers Condensed','Univers',sans-serif",
        fontSize: "0.82rem",
        outline: "none"
      }
    }
  ), searchMsg && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--accent)", fontFamily: "'Univers Condensed','Univers',sans-serif", marginTop: "4px" } }, searchMsg), (searchResults.length > 0 || searchLoading) && searchQuery.trim().length >= 2 && /* @__PURE__ */ React.createElement("div", { style: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 20,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    marginTop: "2px",
    maxHeight: "240px",
    overflowY: "auto",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
  } }, searchLoading && !searchResults.length && /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 12px", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, "Searching..."), searchResults.map((u) => /* @__PURE__ */ React.createElement("div", { key: u.id, style: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    cursor: "default"
  } }, /* @__PURE__ */ React.createElement(Avatar, { src: u.avatar, username: u.username, size: 28 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", fontFamily: "'Univers Condensed','Univers',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, u.real_name || u.username), u.real_name && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, "@", u.username)), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleSendRequest(u.username),
      style: {
        padding: "3px 10px",
        borderRadius: "6px",
        border: "1px solid var(--accent)",
        background: "transparent",
        color: "var(--accent)",
        fontFamily: "'Univers Condensed','Univers',sans-serif",
        fontSize: "0.65rem",
        cursor: "pointer",
        whiteSpace: "nowrap"
      }
    },
    "Connect"
  ))), !searchLoading && searchResults.length === 0 && searchQuery.trim().length >= 2 && /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 12px", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, "No users found")));
  if (!hasBuddies && !hasGroups) {
    return /* @__PURE__ */ React.createElement("div", { style: { maxWidth: "600px", margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-header", style: { marginBottom: "12px" } }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-title" }, "Social")), searchBar, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-muted)", fontSize: "0.82rem", padding: "24px 0" } }, "No connections yet. Search for friends above to get started."));
  }
  const timeAgo = /* @__PURE__ */ __name((ts) => {
    if (!ts) return "";
    const diff = (Date.now() - new Date(ts).getTime()) / 1e3;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }, "timeAgo");
  return /* @__PURE__ */ React.createElement("div", { className: "social-view" }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-header", style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-title" }, "Groups"), hasBuddies && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "dashboard-section-badge",
      style: { cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
      onClick: () => setShowCreateGroup(true)
    },
    "+ New"
  )), hasGroups ? myGroups.map((g) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: g.id,
      className: "social-group-card",
      onClick: () => {
        setActiveGroupId(g.id);
        fetchGroupFeed(g.id);
      }
    },
    /* @__PURE__ */ React.createElement("div", { className: "social-buddy-row" }, /* @__PURE__ */ React.createElement("div", { className: "social-group-avatar" }, g.name.charAt(0).toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "social-buddy-info" }, /* @__PURE__ */ React.createElement("div", { className: "social-buddy-name" }, g.name), /* @__PURE__ */ React.createElement("div", { className: "social-group-meta" }, g.member_count, " member", g.member_count !== 1 ? "s" : "", g.owner_name ? ` · Owner: ${g.owner_name}` : "", g.last_message && /* @__PURE__ */ React.createElement("span", null, " · ", g.last_message_by, ': "', g.last_message.length > 25 ? g.last_message.slice(0, 25) + "…" : g.last_message, '" ', timeAgo(g.last_message_at)))), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", color: "var(--text-secondary)", fontSize: 18 } }, "›"))
  )) : /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: 13, padding: "8px 0 16px" } }, hasBuddies ? "No groups yet. Create one to share schedules and chat with friends." : "Add connections first to create groups."), /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-header", style: { marginBottom: "8px", marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { className: "dashboard-section-title" }, "Connections"), hasBuddies && /* @__PURE__ */ React.createElement("span", { className: "dashboard-section-badge" }, shareBuddies.length, " friend", shareBuddies.length !== 1 ? "s" : "")), searchBar, hasBuddies && /* @__PURE__ */ React.createElement(React.Fragment, null, shareBuddies.map((buddy) => {
    const lu = buddyLiveUpdates == null ? void 0 : buddyLiveUpdates[buddy.id];
    const isLive = lu && !lu.isBusted;
    const isExpanded = expandedId === buddy.id;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: buddy.id,
        className: `social-buddy-card${isLive ? " live" : ""}`
      },
      /* @__PURE__ */ React.createElement("div", { className: "social-buddy-row", onClick: () => toggleBuddy(buddy.id), style: { cursor: "pointer" } }, /* @__PURE__ */ React.createElement(Avatar, { src: buddy.avatar, username: buddy.username, size: 36 }), /* @__PURE__ */ React.createElement("div", { className: "social-buddy-info" }, /* @__PURE__ */ React.createElement("div", { className: "social-buddy-name" }, displayName(buddy)), isLive ? /* @__PURE__ */ React.createElement("div", { className: "social-buddy-status live" }, /* @__PURE__ */ React.createElement("span", { className: "social-live-dot" }), getVenueInfo(lu.venue).abbr, " | ", lu.eventName) : (lu == null ? void 0 : lu.isBusted) ? /* @__PURE__ */ React.createElement("div", { className: "social-buddy-status busted" }, "Busted") : /* @__PURE__ */ React.createElement("div", { className: "social-buddy-status idle" }, buddySchedules[buddy.id] ? `${buddySchedules[buddy.id].length} event${buddySchedules[buddy.id].length !== 1 ? "s" : ""} scheduled` : "View schedule")), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.7rem", transition: "transform 0.15s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" } }, "▼")),
      isExpanded && isLive && /* @__PURE__ */ React.createElement("div", { className: "social-buddy-detail" }, /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "Stack"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value" }, lu.stack ? Number(lu.stack).toLocaleString() : "—")), lu.bb && /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "Blinds"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value" }, lu.sb ? Number(lu.sb).toLocaleString() : "?", "/", Number(lu.bb).toLocaleString(), lu.bbAnte || lu.bb_ante ? "/" + Number(lu.bbAnte || lu.bb_ante).toLocaleString() : "")), lu.bb && lu.stack && /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "BB"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value" }, (Number(lu.stack) / Number(lu.bb)).toFixed(1).replace(/\.0$/, ""), "bb")), (lu.isItm || lu.is_itm) && /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "Status"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value", style: { color: "#22c55e" } }, "In the Money")), (lu.isFinalTable || lu.is_final_table) && /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "Final Table"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value", style: { color: "#f59e0b" } }, lu.placesLeft || lu.places_left ? (lu.placesLeft || lu.places_left) + " left" : "Yes")), /* @__PURE__ */ React.createElement("div", { className: "social-detail-row" }, /* @__PURE__ */ React.createElement("span", { className: "social-detail-label" }, "Venue"), /* @__PURE__ */ React.createElement("span", { className: "social-detail-value" }, lu.venue || "—"))),
      isExpanded && (() => {
        const sched = buddySchedules[buddy.id];
        const todayISO = getToday();
        if (loadingSchedule === buddy.id) {
          return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", fontSize: "0.8rem", color: "var(--text-muted)" } }, "Loading schedule...");
        }
        if (!sched || sched.length === 0) {
          return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", fontSize: "0.8rem", color: "var(--text-muted)" } }, "No events scheduled");
        }
        const upcoming = sched.filter((t) => normaliseDate(t.date) >= todayISO).sort((a, b) => {
          const da = /* @__PURE__ */ new Date(`${a.date} ${a.time && a.time !== "TBD" ? a.time : "12:00 AM"}`);
          const db = /* @__PURE__ */ new Date(`${b.date} ${b.time && b.time !== "TBD" ? b.time : "12:00 AM"}`);
          return da - db;
        });
        if (upcoming.length === 0) {
          return /* @__PURE__ */ React.createElement("div", { style: { padding: "12px", fontSize: "0.8rem", color: "var(--text-muted)" } }, "No upcoming events");
        }
        const groups = [];
        let cur = null;
        for (const t of upcoming) {
          const d = normaliseDate(t.date);
          if (!cur || cur.date !== d) {
            cur = { date: d, events: [] };
            groups.push(cur);
          }
          cur.events.push(t);
        }
        return /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--border)", marginTop: "4px", paddingTop: "4px" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 12px 4px", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "Univers Condensed, Univers, sans-serif" } }, "Upcoming Schedule (", upcoming.length, " event", upcoming.length !== 1 ? "s" : "", ")"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto auto auto auto 1fr auto", gap: "0 6px", padding: "0 12px", fontSize: "0.8rem", alignItems: "center" } }, groups.map((group) => {
          const dateObj = /* @__PURE__ */ new Date(group.date + "T12:00:00");
          const dayAbbr = group.date === todayISO ? "" : ["Su", "M", "Tu", "W", "Th", "F", "Sa"][dateObj.getDay()];
          const dateLabel = group.date === todayISO ? "Today" : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dateObj.getMonth()] + " " + dateObj.getDate();
          return /* @__PURE__ */ React.createElement(React.Fragment, { key: group.date }, group.events.map((t, i) => {
            const v = getVenueInfo(t.venue);
            return /* @__PURE__ */ React.createElement(React.Fragment, { key: t.id }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", fontFamily: "'Libre Baskerville', Georgia, serif", whiteSpace: "nowrap", padding: "4px 0" } }, i === 0 ? dayAbbr : ""), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", fontWeight: 700, color: "var(--text)", fontFamily: "'Libre Baskerville', Georgia, serif", whiteSpace: "nowrap", padding: "4px 0" } }, i === 0 ? dateLabel : ""), /* @__PURE__ */ React.createElement("span", { style: { color: getVenueBrandColor(v.abbr), fontWeight: 600, fontSize: "0.65rem", whiteSpace: "nowrap", textAlign: "center" } }, v.abbr), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)", fontSize: "0.72rem", whiteSpace: "nowrap", textAlign: "right" } }, t.time || "TBD"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } }, t.event_name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" } }, formatBuyin(t.buyin, t.venue)));
          }));
        })));
      })(),
      isExpanded && /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--border)", marginTop: "4px", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "6px" } }, myGroups && myGroups.length > 0 && (addToGroupBuddyId === buddy.id ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "Univers Condensed, Univers, sans-serif", marginBottom: "6px" } }, "Add to Group"), myGroups.map((g) => {
        var _a;
        const status = (_a = inviteStatus[buddy.id]) == null ? void 0 : _a[g.id];
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: g.id,
            disabled: !!status,
            onClick: (e) => {
              e.stopPropagation();
              handleInviteToGroup(buddy.id, g.id, buddy.username);
            },
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "6px 8px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text)",
              cursor: status ? "default" : "pointer",
              fontSize: "0.8rem",
              marginBottom: "4px",
              opacity: status ? 0.6 : 1
            }
          },
          /* @__PURE__ */ React.createElement("span", null, g.name),
          /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.72rem", color: status === "sent" ? "#22c55e" : status === "member" ? "var(--text-muted)" : status === "error" ? "#ef4444" : "var(--accent)" } }, status === "sent" ? "Invited" : status === "member" ? "Already in group" : status === "error" ? "Failed" : "Invite")
        );
      }), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setAddToGroupBuddyId(null);
          },
          style: { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem", marginTop: "4px", padding: 0 }
        },
        "Cancel"
      )) : /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setAddToGroupBuddyId(buddy.id);
          },
          style: {
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: "0.8rem",
            padding: "6px 12px",
            width: "100%",
            fontFamily: "Univers Condensed, Univers, sans-serif"
          }
        },
        "+ Add to Group"
      )), confirmRemoveId === buddy.id ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.75rem", color: "#ef4444" } }, "Remove ", displayName(buddy), "?"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px" } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setConfirmRemoveId(null);
          },
          style: {
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.75rem",
            padding: "4px 10px"
          }
        },
        "Cancel"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            onRemoveBuddy(buddy.id);
            setConfirmRemoveId(null);
            setExpandedId(null);
          },
          style: {
            background: "#b91c1c",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.75rem",
            padding: "4px 10px",
            fontWeight: 600
          }
        },
        "Remove"
      ))) : /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setConfirmRemoveId(buddy.id);
          },
          style: {
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "#b91c1c",
            cursor: "pointer",
            fontSize: "0.8rem",
            padding: "6px 12px",
            width: "100%",
            fontFamily: "Univers Condensed, Univers, sans-serif"
          }
        },
        "Remove Connection"
      ))
    );
  })), showCreateGroup && ReactDOM.createPortal(
    /* @__PURE__ */ React.createElement(
      CreateGroupModal,
      {
        shareBuddies,
        displayName,
        token,
        onClose: () => setShowCreateGroup(false),
        onCreated: () => {
          setShowCreateGroup(false);
          fetchMyGroups();
        }
      }
    ),
    document.body
  ));
}
__name(SocialView, "SocialView");
function CreateGroupModal({ shareBuddies, displayName, token, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleCreate = /* @__PURE__ */ __name(async () => {
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const createRes = await fetch(`${API_URL}/groups`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      if (!createRes.ok) {
        const d = await createRes.json();
        setError(d.error || "Failed to create group");
        setLoading(false);
        return;
      }
      const { id: groupId } = await createRes.json();
      let inviteCount = 0;
      for (const buddy of shareBuddies) {
        if (selected.has(buddy.id)) {
          const invRes = await fetch(`${API_URL}/groups/${groupId}/members`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ username: buddy.username })
          });
          if (invRes.ok) inviteCount++;
        }
      }
      onCreated(inviteCount);
    } catch (e) {
      setError("Something went wrong");
    }
    setLoading(false);
  }, "handleCreate");
  const toggleBuddy = /* @__PURE__ */ __name((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, "toggleBuddy");
  return /* @__PURE__ */ React.createElement("div", { className: "create-group-modal", onClick: (e) => {
    if (e.target === e.currentTarget) onClose();
  } }, /* @__PURE__ */ React.createElement("div", { className: "create-group-panel" }, /* @__PURE__ */ React.createElement("div", { className: "create-group-header" }, /* @__PURE__ */ React.createElement("h3", { style: { margin: 0, fontFamily: "Univers Condensed, Univers, sans-serif", textTransform: "uppercase", letterSpacing: 1 } }, "Create Group"), /* @__PURE__ */ React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--text)", fontSize: 20, cursor: "pointer", padding: 4 } }, "✕")), /* @__PURE__ */ React.createElement("label", { className: "create-group-label" }, "Group Name"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "create-group-input",
      value: name,
      onChange: (e) => setName(e.target.value),
      placeholder: "e.g. Vegas Crew",
      maxLength: 40,
      autoFocus: true
    }
  ), shareBuddies.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: "create-group-label", style: { marginTop: 12 } }, "Add Members"), /* @__PURE__ */ React.createElement("div", { className: "create-group-buddies" }, shareBuddies.map((b) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: b.id,
      className: `create-group-buddy-btn${selected.has(b.id) ? " selected" : ""}`,
      onClick: () => toggleBuddy(b.id)
    },
    /* @__PURE__ */ React.createElement(Avatar, { src: b.avatar, username: b.username, size: 24 }),
    /* @__PURE__ */ React.createElement("span", null, displayName(b)),
    selected.has(b.id) && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", color: "var(--accent)" } }, "✓")
  )))), error && /* @__PURE__ */ React.createElement("div", { style: { color: "#ef4444", fontSize: 13, marginTop: 8 } }, error), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "create-group-submit",
      onClick: handleCreate,
      disabled: loading || !name.trim()
    },
    loading ? "Creating…" : "Create Group"
  )));
}
__name(CreateGroupModal, "CreateGroupModal");
function GroupDetailView({
  group,
  groupFeed,
  groupSchedule,
  fetchGroupFeed,
  fetchGroupSchedule,
  fetchMyGroups,
  shareBuddies,
  buddyLiveUpdates,
  displayName,
  token,
  onBack
}) {
  const [segment, setSegment] = useState("feed");
  const [members, setMembers] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const feedEndRef = React.useRef(null);
  const groupId = group == null ? void 0 : group.id;
  useEffect(() => {
    if (!groupId) return;
    fetchGroupFeed(groupId);
    fetchMembers();
    fetchPendingInvites();
  }, [groupId]);
  useEffect(() => {
    if (segment === "feed" && feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [groupFeed, segment]);
  useEffect(() => {
    if (segment === "schedule" && groupId) {
      fetchGroupSchedule(groupId);
    }
  }, [segment, groupId]);
  useEffect(() => {
    if (segment === "leaderboard" && groupId && group.leaderboard_enabled) {
      fetchLeaderboard();
    }
  }, [segment, groupId]);
  const fetchMembers = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setMembers(await res.json());
    } catch (e) {
    }
  }, "fetchMembers");
  const fetchPendingInvites = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/invites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(Array.isArray(data) ? data : []);
      }
    } catch (e) {
    }
  }, "fetchPendingInvites");
  const fetchLeaderboard = /* @__PURE__ */ __name(async () => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/leaderboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setLeaderboardData(await res.json());
    } catch (e) {
    }
  }, "fetchLeaderboard");
  const toggleLeaderboard = /* @__PURE__ */ __name(async (enabled) => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/leaderboard`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) fetchMyGroups();
    } catch (e) {
    }
  }, "toggleLeaderboard");
  const handleSend = /* @__PURE__ */ __name(async () => {
    if (!msgText.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`${API_URL}/groups/${groupId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgText.trim() })
      });
      setMsgText("");
      fetchGroupFeed(groupId);
    } catch (e) {
    }
    setSending(false);
  }, "handleSend");
  const handleDeleteGroup = /* @__PURE__ */ __name(async () => {
    if (!confirm("Delete this group? This cannot be undone.")) return;
    try {
      await fetch(`${API_URL}/groups/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMyGroups();
      onBack();
    } catch (e) {
    }
  }, "handleDeleteGroup");
  const handleLeaveGroup = /* @__PURE__ */ __name(async () => {
    if (!confirm("Leave this group?")) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      await fetch(`${API_URL}/groups/${groupId}/members/${payload.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMyGroups();
      onBack();
    } catch (e) {
    }
  }, "handleLeaveGroup");
  const handleAddMember = /* @__PURE__ */ __name(async (buddy) => {
    try {
      const res = await fetch(`${API_URL}/groups/${groupId}/members`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: buddy.username })
      });
      if (res.ok) {
        setShowAddMember(false);
        fetchMyGroups();
        fetchPendingInvites();
      }
    } catch (e) {
    }
  }, "handleAddMember");
  const handleRemoveMember = /* @__PURE__ */ __name(async (userId) => {
    if (!confirm("Remove this member from the group?")) return;
    try {
      await fetch(`${API_URL}/groups/${groupId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchMyGroups();
      fetchMembers();
    } catch (e) {
    }
  }, "handleRemoveMember");
  if (!group) return /* @__PURE__ */ React.createElement("div", { className: "placeholder-view" }, /* @__PURE__ */ React.createElement("p", null, "Group not found"), /* @__PURE__ */ React.createElement("button", { onClick: onBack }, "Back"));
  const isOwner = group.my_role === "owner";
  const timeAgo = /* @__PURE__ */ __name((ts) => {
    if (!ts) return "";
    const diff = (Date.now() - new Date(ts).getTime()) / 1e3;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    return Math.floor(diff / 86400) + "d";
  }, "timeAgo");
  return /* @__PURE__ */ React.createElement("div", { className: "group-detail-view" }, /* @__PURE__ */ React.createElement("div", { className: "group-detail-header" }, /* @__PURE__ */ React.createElement("button", { className: "group-back-btn", onClick: onBack }, "←"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "social-buddy-name", style: { fontSize: 16 } }, group.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)" } }, group.member_count, " member", group.member_count !== 1 ? "s" : "", group.owner_name ? ` · Owner: ${group.owner_name}` : "")), isOwner ? /* @__PURE__ */ React.createElement("button", { onClick: handleDeleteGroup, style: { background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" } }, "Delete") : /* @__PURE__ */ React.createElement("button", { onClick: handleLeaveGroup, style: { background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" } }, "Leave")), /* @__PURE__ */ React.createElement("div", { className: "group-segments" }, (() => {
    const segs = ["feed", "schedule"];
    if (group.leaderboard_enabled) segs.push("leaderboard");
    segs.push("members");
    return segs;
  })().map((s) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: s,
      className: `group-segment-btn${segment === s ? " active" : ""}`,
      onClick: () => setSegment(s)
    },
    s === "feed" ? "Live Feed" : s === "schedule" ? "Schedule" : s === "leaderboard" ? "Leaderboard" : "Members"
  ))), segment === "feed" && /* @__PURE__ */ React.createElement("div", { className: "group-feed-container" }, /* @__PURE__ */ React.createElement("div", { className: "group-feed" }, groupFeed.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "40px 20px", fontSize: 13 } }, "No messages yet. Say something!") : groupFeed.map((item, i) => /* @__PURE__ */ React.createElement("div", { key: item.id || i, className: `group-feed-item ${item.type}` }, /* @__PURE__ */ React.createElement(Avatar, { src: item.avatar, username: item.username || "?", size: 28 }), /* @__PURE__ */ React.createElement("div", { className: "group-feed-item-body" }, /* @__PURE__ */ React.createElement("div", { className: "group-feed-item-header" }, /* @__PURE__ */ React.createElement("span", { className: "group-feed-item-name" }, displayName(item)), /* @__PURE__ */ React.createElement("span", { className: "group-feed-item-time" }, timeAgo(item.created_at))), item.type === "message" ? /* @__PURE__ */ React.createElement("div", { className: "group-feed-item-text" }, item.content) : item.type === "live-update" && item.liveData ? /* @__PURE__ */ React.createElement("div", { className: "group-feed-item-text", style: { color: "var(--accent)", fontSize: 12 } }, "♠ ", item.liveData.eventName || "Tournament", " — ", formatLiveUpdate(item.liveData)) : /* @__PURE__ */ React.createElement("div", { className: "group-feed-item-text" }, item.content)))), /* @__PURE__ */ React.createElement("div", { ref: feedEndRef })), /* @__PURE__ */ React.createElement("div", { className: "group-feed-input" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      value: msgText,
      onChange: (e) => setMsgText(e.target.value),
      placeholder: "Type a message…",
      maxLength: 500,
      onKeyDown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      }
    }
  ), /* @__PURE__ */ React.createElement("button", { onClick: handleSend, disabled: sending || !msgText.trim() }, "Send"))), segment === "schedule" && /* @__PURE__ */ React.createElement("div", { className: "group-schedule" }, groupSchedule.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "40px 20px", fontSize: 13 } }, "No members have scheduled any tournaments yet.") : groupSchedule.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: "group-schedule-card" }, /* @__PURE__ */ React.createElement("div", { className: "group-schedule-card-top" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, t.event_name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)" } }, t.date, " · ", t.time, " · $", Number(t.buyin).toLocaleString())), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-secondary)" } }, getVenueInfo(t.venue).abbr)), /* @__PURE__ */ React.createElement("div", { className: "group-schedule-members" }, t.members.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, className: "group-schedule-member", title: displayName(m) }, /* @__PURE__ */ React.createElement(Avatar, { src: m.avatar, username: m.username, size: 22 }))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-secondary)", marginLeft: 4 } }, t.members.map((m) => m.username).join(", ")))))), segment === "leaderboard" && /* @__PURE__ */ React.createElement("div", { className: "group-leaderboard" }, leaderboardData.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", color: "var(--text-secondary)", padding: "40px 20px", fontSize: 13 } }, "No results tracked yet. Members' tournament results will appear here.") : (() => {
    const maxWon = Math.max(...leaderboardData.map((m) => m.total_won), 1);
    return leaderboardData.map((m, i) => /* @__PURE__ */ React.createElement("div", { key: m.id, className: "leaderboard-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { className: "leaderboard-rank" }, i === 0 ? "🏆" : `#${i + 1}`), /* @__PURE__ */ React.createElement(Avatar, { src: m.avatar, username: m.username, size: 32 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 14 } }, displayName(m)), /* @__PURE__ */ React.createElement("div", { className: "leaderboard-stats" }, /* @__PURE__ */ React.createElement("span", { className: m.net_pl >= 0 ? "leaderboard-net-pos" : "leaderboard-net-neg" }, m.net_pl >= 0 ? "+" : "", formatBuyin(m.net_pl), " net"), " · ", m.cashes, " cash", m.cashes !== 1 ? "es" : "", " · ", m.final_tables, " FT", m.final_tables !== 1 ? "s" : "", " · ", m.wins, "W"), /* @__PURE__ */ React.createElement("div", { className: "leaderboard-bar-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "leaderboard-bar", style: { width: `${Math.max(m.total_won / maxWon * 100, 2)}%` } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } }, formatBuyin(m.total_won), " won · ", m.events_played, " event", m.events_played !== 1 ? "s" : "")))));
  })()), segment === "members" && /* @__PURE__ */ React.createElement("div", { className: "group-members-list" }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "create-group-submit",
      style: { fontSize: 13, padding: "8px 16px", marginBottom: 8 },
      onClick: () => setShowAddMember(!showAddMember)
    },
    showAddMember ? "Cancel" : "+ Invite Buddy"
  ), showAddMember && /* @__PURE__ */ React.createElement("div", { className: "create-group-buddies", style: { marginBottom: 12 } }, shareBuddies.filter((b) => !members.some((m) => m.id === b.id) && !pendingInvites.some((p) => p.invited_user_id === b.id)).map((b) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: b.id,
      className: "create-group-buddy-btn",
      onClick: () => handleAddMember(b)
    },
    /* @__PURE__ */ React.createElement(Avatar, { src: b.avatar, username: b.username, size: 24 }),
    /* @__PURE__ */ React.createElement("span", null, displayName(b)),
    /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 12, color: "var(--accent)" } }, "Invite")
  )))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, fontFamily: "Univers Condensed, Univers, sans-serif", marginBottom: 6 } }, "Members (", members.length || group.member_count, ")"), members.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, className: "group-member-card" }, /* @__PURE__ */ React.createElement(Avatar, { src: m.avatar, username: m.username, size: 28 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 500 } }, displayName(m)), m.role === "owner" && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--accent)" } }, "Owner")), isOwner && m.role !== "owner" && /* @__PURE__ */ React.createElement("button", { onClick: () => handleRemoveMember(m.id), style: { background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 } }, "Remove"))), pendingInvites.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, fontFamily: "Univers Condensed, Univers, sans-serif", marginBottom: 6 } }, "Pending Invites"), pendingInvites.map((inv) => /* @__PURE__ */ React.createElement("div", { key: inv.id, className: "group-member-card", style: { opacity: 0.6 } }, /* @__PURE__ */ React.createElement(Avatar, { src: inv.avatar, username: inv.username, size: 28 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 500 } }, displayName(inv)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)" } }, "Invited by ", inv.invited_by_real_name || inv.invited_by_username)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" } }, "Pending")))), isOwner && /* @__PURE__ */ React.createElement("div", { className: "leaderboard-toggle-section" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, fontFamily: "Univers Condensed, Univers, sans-serif", marginBottom: 8 } }, "Owner Settings"), /* @__PURE__ */ React.createElement("div", { className: "leaderboard-toggle-row" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13 } }, "Enable Leaderboard"), /* @__PURE__ */ React.createElement("label", { className: "toggle-switch" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: !!group.leaderboard_enabled,
      onChange: (e) => toggleLeaderboard(e.target.checked)
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "toggle-slider" })))), !isOwner && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleLeaveGroup,
      style: { background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "#ef4444", cursor: "pointer", padding: "8px 16px", fontSize: 13, width: "100%", marginTop: 12 }
    },
    "Leave Group"
  ), isOwner && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleDeleteGroup,
      style: { background: "none", border: "1px solid #ef4444", borderRadius: 8, color: "#ef4444", cursor: "pointer", padding: "8px 16px", fontSize: 13, width: "100%", marginTop: 12 }
    },
    "Delete Group"
  )));
}
__name(GroupDetailView, "GroupDetailView");
window.SocialView = SocialView;
window.CreateGroupModal = CreateGroupModal;
window.GroupDetailView = GroupDetailView;
//# sourceMappingURL=social.js.map
