// src/pages/ReportsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Supports your NEW extras jsonb shape:
 * {"groups":[{"name":"Cooking","group_id":1,"selected":[{"id":1,"name":"Rare","price_cents":0}]}]}
 * and also supports the fallback where extras might already be an array.
 */
function parseExtrasGroups(extrasJson) {
  const obj = extrasJson && typeof extrasJson === "object" ? extrasJson : null;
  const groups = obj && !Array.isArray(obj) ? safeArray(obj.groups) : safeArray(extrasJson);

  const lines = [];
  let totalExtrasCents = 0;

  for (const g of groups) {
    const gName = String(g?.name || "").trim();
    const selected = safeArray(g?.selected);
    if (!gName || selected.length === 0) continue;

    const names = [];
    for (const s of selected) {
      const n = String(s?.name || "").trim();
      if (n) names.push(n);
      totalExtrasCents += Number(s?.price_cents || 0);
    }

    if (names.length) lines.push({ group: gName, value: names.join(", ") });
  }

  return { lines, totalExtrasCents, groups };
}

function renderExtrasUnderItem(extrasJson) {
  const { lines } = parseExtrasGroups(extrasJson);
  if (!lines.length) return null;

  return (
    <div style={{ marginTop: 6, marginLeft: 14, display: "grid", gap: 4 }}>
      {lines.map((l, idx) => (
        <div key={idx} style={{ fontSize: 12, color: "#555" }}>
          • <b>{l.group}:</b> {l.value}
        </div>
      ))}
    </div>
  );
}

// For search + CSV
function extrasToText(extrasJson) {
  const { lines } = parseExtrasGroups(extrasJson);
  if (!lines.length) return "";
  return lines.map((l) => `${l.group}: ${l.value}`).join(" | ");
}
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function safeDateFromYMD(ymd, fallbackDate) {
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return fallbackDate;
  return d;
}

function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** -----------------------------
 * Modifiers/Extras parsing
 * order_items.extras jsonb format (new):
 *  {"groups":[{"name":"Cooking","group_id":1,"selected":[{"id":1,"name":"Rare","price_cents":0}]}]}
 * Also accept: [{name, selected:[...]}]
 * ----------------------------- */
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseExtrasGroups(extrasJson) {
  const obj = extrasJson && typeof extrasJson === "object" ? extrasJson : null;
  const groups = obj && !Array.isArray(obj) ? safeArray(obj.groups) : safeArray(extrasJson);

  const lines = []; // for rendering
  const selected = []; // flat list of selected items for reporting

  for (const g of groups) {
    const gName = String(g?.name || "").trim();
    const sel = safeArray(g?.selected);
    if (!gName || sel.length === 0) continue;

    const names = [];
    for (const s of sel) {
      const n = String(s?.name || "").trim();
      if (!n) continue;
      names.push(n);
      selected.push({
        group: gName,
        name: n,
        price_cents: Number(s?.price_cents || 0),
      });
    }

    if (names.length) {
      lines.push({ group: gName, value: names.join(", ") });
    }
  }

  return { lines, selected };
}

function renderExtrasUnderItem(extrasJson) {
  const { lines } = parseExtrasGroups(extrasJson);
  if (!lines.length) return null;

  return (
    <div style={{ marginTop: 6, marginLeft: 14, display: "grid", gap: 4 }}>
      {lines.map((l, idx) => (
        <div key={idx} style={{ fontSize: 12, color: "#555" }}>
          • <b>{l.group}:</b> {l.value}
        </div>
      ))}
    </div>
  );
}

function itemExtrasTotalCents(it) {
  const qty = Number(it?.qty || 0);
  const { selected } = parseExtrasGroups(it?.extras);
  const perOne = selected.reduce((sum, s) => sum + Number(s.price_cents || 0), 0);
  return perOne * qty;
}

function itemLineTotalCents(it) {
  const qty = Number(it?.qty || 0);
  const base = Number(it?.unit_price_cents || 0) * qty;
  return base + itemExtrasTotalCents(it);
}

export default function ReportsPage() {
  const nav = useNavigate();

  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState(null);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  // Filters
  const [preset, setPreset] = useState("7"); // "0"(today) | "7" | "30" | "custom"
  const [fromDate, setFromDate] = useState(() => toLocalInputValue(addDays(new Date(), -7)));
  const [toDate, setToDate] = useState(() => toLocalInputValue(new Date())); // inclusive UI

  const [statusFilter, setStatusFilter] = useState("all"); // completed | active | all
  const [typeFilter, setTypeFilter] = useState("all"); // all | dine_in | collection
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState([]);

  // Staff-only gate
  useEffect(() => {
    let alive = true;

    async function checkAuthAndRole() {
      setErr("");

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!alive) return;

      if (!session) {
        setAuthReady(true);
        setRole(null);
        nav("/login", { replace: true });
        return;
      }

      const { data: r, error: roleErr } = await supabase.rpc("get_my_role");
      if (!alive) return;

      if (roleErr) {
        setAuthReady(true);
        setRole(null);
        setErr(roleErr.message);
        nav("/login", { replace: true });
        return;
      }

      const normalized = String(r || "").trim().toLowerCase();
      setRole(normalized);
      setAuthReady(true);

      if (normalized !== "kitchen" && normalized !== "waiter") {
        nav("/login", { replace: true });
        console.log("REPORT ITEM SAMPLE:", normalized[0].items[0]);
      }
    }

    checkAuthAndRole();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      checkAuthAndRole();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  // Apply preset to date inputs
  useEffect(() => {
    if (preset === "custom") return;

    const today = startOfDay(new Date());

    if (preset === "0") {
      setFromDate(toLocalInputValue(today));
      setToDate(toLocalInputValue(today));
    } else {
      const days = Number(preset);
      setFromDate(toLocalInputValue(addDays(today, -days)));
      setToDate(toLocalInputValue(today));
    }
  }, [preset]);

  const queryRange = useMemo(() => {
    const today = startOfDay(new Date());

    const from = startOfDay(safeDateFromYMD(fromDate, addDays(today, -7)));
    const toInclusive = startOfDay(safeDateFromYMD(toDate, today));
    const toExclusive = addDays(toInclusive, 1);

    return { from, to: toExclusive };
  }, [fromDate, toDate]);

  async function load() {
    setErr("");
    setLoading(true);

    try {
      const fromIso = queryRange.from.toISOString();
      const toIso = queryRange.to.toISOString();

      const { data, error } = await supabase.rpc("staff_reports_orders", {
        p_from: fromIso,
        p_to: toIso,
      });

      if (error) {
        setErr(error.message);
        setOrders([]);
        return;
      }

      const normalized = (data || []).map((o) => ({
        ...o,
        items: Array.isArray(o.items) ? o.items : o.items || [],
        status: String(o.status || "").toLowerCase(),
        order_type: String(o.order_type || "").toLowerCase(),
        customer_name: o.customer_name || "",
      }));

      setOrders(normalized);
      setLastLoadedAt(new Date());
    } catch (e) {
      setErr(e?.message || "Reports failed to load.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady) return;
    if (role !== "kitchen" && role !== "waiter") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, role, queryRange.from.getTime(), queryRange.to.getTime()]);

  const filtered = useMemo(() => {
    let list = [...orders];

    if (statusFilter === "paid") {
      list = list.filter((o) => o.status === "paid");
    } else if (statusFilter === "completed") {
      list = list.filter((o) => o.status === "completed");
    } else if (statusFilter === "active") {
      list = list.filter((o) => ["queued", "accepted", "preparing", "ready", "awaiting_payment"].includes(o.status));
    }

    if (typeFilter !== "all") {
      list = list.filter((o) => o.order_type === typeFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const itemsText = (o.items || [])
          .map((it) => {
            const base = `${it.name} ${it.item_notes || ""}`;
            const { selected } = parseExtrasGroups(it?.extras);
            const modsText = selected.map((s) => `${s.group}:${s.name}`).join(" ");
            return `${base} ${modsText}`;
          })
          .join(" ");
        const blob = `${o.order_number} ${o.customer_name} ${o.order_type} ${o.status} ${itemsText}`.toLowerCase();
        return blob.includes(q);
      });
    }

    return list;
  }, [orders, statusFilter, typeFilter, search]);

  const summary = useMemo(() => {
    const count = filtered.length;
    const total = filtered.reduce((sum, o) => sum + Number(o.total_cents || 0), 0);
    const avg = count ? Math.round(total / count) : 0;
    return { count, total, avg };
  }, [filtered]);

  // ✅ NEW: ALL sold “things” (base items + modifier selections)
  const topItems = useMemo(() => {
  const map = new Map();

  function addRow(name, qty, revenueCents) {
    const key = String(name || "Unknown").trim() || "Unknown";
    if (!map.has(key)) map.set(key, { name: key, qty: 0, revenue: 0 });
    const row = map.get(key);
    row.qty += qty;
    row.revenue += revenueCents;
  }

  for (const o of filtered) {
    for (const it of o.items || []) {
      const baseName = it.name || "Unknown";
      const qty = Number(it.qty || 0);
      const unit = Number(it.unit_price_cents || 0);

      // Base item
      addRow(baseName, qty, qty * unit);

      // Extras/cooking selections stored in it.extras jsonb
      const { groups } = parseExtrasGroups(it.extras);
      for (const g of groups || []) {
        for (const s of safeArray(g?.selected)) {
          const exName = String(s?.name || "").trim();
          if (!exName) continue;
          const exPrice = Number(s?.price_cents || 0);
          // each selected modifier counts as sold "qty" times
          addRow(exName, qty, qty * exPrice);
        }
      }
    }
  }

  // ALL items (no slice)
  return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
}, [filtered]);

  function exportCSV() {
    const header = ["order_number", "created_at", "status", "order_type", "customer_name", "total", "items"];
    const rows = filtered.map((o) => {
      const items = (o.items || [])
        .map((it) => {
          const note = it.item_notes ? ` (${it.item_notes})` : "";
          const { selected } = parseExtrasGroups(it?.extras);
          const mods =
            selected.length > 0
              ? ` | ${selected.map((s) => `${s.group}: ${s.name}${Number(s.price_cents || 0) ? ` (${money(s.price_cents)})` : ""}`).join(", ")}`
              : "";
          return `${it.qty}x ${it.name}${note}${mods}`;
        })
        .join(" | ");
      return [
        o.order_number,
        new Date(o.created_at).toLocaleString(),
        o.status,
        o.order_type,
        o.customer_name,
        money(o.total_cents),
        items,
      ];
    });

    downloadCSV(`club_kitchen_reports_${fromDate}_to_${toDate}.csv`, [header, ...rows]);
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      window.location.href = "/login";
    }
  }

  function chipStyle(status) {
    const base = {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid #e5e5e5",
      background: "#f7f7f7",
    };
    if (status === "queued") return { ...base, background: "#f2f7ff", borderColor: "#dbeafe" };
    if (status === "accepted") return { ...base, background: "#f5f3ff", borderColor: "#e9d5ff" };
    if (status === "preparing") return { ...base, background: "#fff7ed", borderColor: "#fed7aa" };
    if (status === "ready") return { ...base, background: "#ecfdf5", borderColor: "#bbf7d0" };
    if (status === "completed") return { ...base, background: "#f3f4f6", borderColor: "#e5e7eb" };
    return base;
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <div style={{ color: "#666", marginTop: 4 }}>
            Orders, totals, and trends.
            {lastLoadedAt ? (
              <span style={{ marginLeft: 10, fontSize: 12 }}>
                Last loaded: <b>{lastLoadedAt.toLocaleTimeString()}</b>
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => nav(role === "kitchen" ? "/kitchen" : "/waiter")}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Back
          </button>

          <button
            type="button"
            onClick={logout}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </div>

      {err && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 10, marginTop: 12 }}>
          <b>Error:</b> {err}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid #eee",
          borderRadius: 14,
          padding: 12,
          background: "white",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <b>Range</b>

          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}>
            <option value="0">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#666" }}>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPreset("custom");
                setFromDate(e.target.value || toLocalInputValue(addDays(new Date(), -7)));
              }}
              style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
            />
            <span style={{ color: "#666" }}>To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPreset("custom");
                setToDate(e.target.value || toLocalInputValue(new Date()));
              }}
              style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
            />
          </div>

          <button
            type="button"
            onClick={load}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>

          <button
            type="button"
            onClick={exportCSV}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Export CSV
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <b>Filters</b>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}>
            <option value="completed">Completed only</option>
            <option value="paid">Paid</option>
            <option value="active">Active only</option>
            <option value="all">All statuses</option>
          </select>

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}>
            <option value="all">All types</option>
            <option value="dine_in">Dine-in</option>
            <option value="collection">Collection</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / order # / item…"
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: 280 }}
          />
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ color: "#666", fontSize: 12 }}>Orders</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{summary.count}</div>
        </div>
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ color: "#666", fontSize: 12 }}>Revenue</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{money(summary.total)}</div>
        </div>
        <div style={{ background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ color: "#666", fontSize: 12 }}>Avg order</div>
          <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{money(summary.avg)}</div>
        </div>
      </div>

      {/* Top items (ALL incl modifiers) */}
      <div style={{ marginTop: 14, background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Items sold</h2>
          <div style={{ color: "#666" }}>All items (including extras & cooking selections)</div>
        </div>

        {topItems.length === 0 ? (
          <div style={{ color: "#777", marginTop: 10 }}>No items in this range.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {topItems.map((it) => (
              <div key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid #f3f3f3", paddingTop: 8 }}>
                <div style={{ fontWeight: 900 }}>{it.name}</div>
                <div style={{ color: "#666" }}>
                  <b>{it.qty}</b> sold • {money(it.revenue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders list */}
      <div style={{ marginTop: 14, background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Orders</h2>
          <div style={{ color: "#666" }}>{filtered.length} result(s)</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: "#777", marginTop: 10 }}>No orders match your filters.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {filtered.map((o) => (
              <div key={o.id} style={{ border: "1px solid #f0f0f0", borderRadius: 14, padding: 12, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>
                      #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"} • {o.customer_name || "—"}
                    </div>
                    <div style={{ color: "#666", marginTop: 4 }}>{new Date(o.created_at).toLocaleString()}</div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={chipStyle(o.status)}>{String(o.status || "").toUpperCase()}</div>
                    <div style={{ marginTop: 6, fontWeight: 950 }}>{money(o.total_cents)}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {(o.items || []).map((it, idx) => {
                    // ✅ extras/modifiers (your RPC should return something like it.modifiers OR it.extras)
                    const mods = Array.isArray(it.modifiers) ? it.modifiers : Array.isArray(it.extras) ? it.extras : [];

                    const lineBase = Number(it.unit_price_cents || 0) * Number(it.qty || 0);
                    const modsTotal = mods.reduce((sum, m) => sum + Number(m.price_cents || 0) * Number(it.qty || 0), 0);

                    return (
                      <div key={`${o.id}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <b>{it.qty}×</b> {it.name}

                          {it.item_notes ? (
                            <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div>
                          ) : null}

                          {mods.length ? (
                            <div style={{ marginTop: 4, color: "#666", fontSize: 12, display: "grid", gap: 2 }}>
                              {mods.map((m, mi) => (
                                <div key={m.id ?? `${idx}-${mi}`}>
                                  + {m.name}
                                  {Number(m.price_cents || 0) ? ` (${money(m.price_cents)})` : ""}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ color: "#666" }}>{money(lineBase + modsTotal)}</div>
                      </div>
                    );
                  })}
                </div>

      <div style={{ marginTop: 14, color: "#777", fontSize: 12 }}>
        Tip: “Completed only” is best for sales reporting. Use “Active only” if you want to audit queue behaviour.
      </div>
    </div>
  );
}