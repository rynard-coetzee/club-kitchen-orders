// src/pages/ReportsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

function toLocalInputValue(d) {
  // yyyy-mm-dd for <input type="date">
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

export default function ReportsPage() {
  const nav = useNavigate();

  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState(null); // kitchen/waiter/null

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Filters
  const [preset, setPreset] = useState("7"); // "0"(today) | "7" | "30" | "custom"
  const [fromDate, setFromDate] = useState(() => toLocalInputValue(addDays(new Date(), -7)));
  const [toDate, setToDate] = useState(() => toLocalInputValue(new Date())); // inclusive in UI, we’ll +1 day in query

  const [statusFilter, setStatusFilter] = useState("completed"); // completed | active | all
  const [typeFilter, setTypeFilter] = useState("all"); // all | dine_in | collection
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState([]); // rows from RPC

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

    const today = new Date();
    const start = startOfDay(today);

    if (preset === "0") {
      setFromDate(toLocalInputValue(start));
      setToDate(toLocalInputValue(start));
    } else {
      const days = Number(preset);
      setFromDate(toLocalInputValue(addDays(start, -days)));
      setToDate(toLocalInputValue(start));
    }
  }, [preset]);

  const queryRange = useMemo(() => {
    const from = startOfDay(new Date(fromDate));
    // UI toDate is inclusive. SQL uses < p_to, so we go to next day 00:00
    const toInclusive = startOfDay(new Date(toDate));
    const toExclusive = addDays(toInclusive, 1);
    return { from, to: toExclusive };
  }, [fromDate, toDate]);

  async function load() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase.rpc("staff_reports_orders", {
      p_from: queryRange.from.toISOString(),
      p_to: queryRange.to.toISOString(),
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
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
  }

  useEffect(() => {
    if (!authReady) return;
    if (role !== "kitchen" && role !== "waiter") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, role, queryRange.from.getTime(), queryRange.to.getTime()]);

  const filtered = useMemo(() => {
    let list = [...orders];

    if (statusFilter === "completed") {
      list = list.filter((o) => o.status === "completed");
    } else if (statusFilter === "active") {
      list = list.filter((o) => ["queued", "accepted", "preparing", "ready"].includes(o.status));
    }

    if (typeFilter !== "all") {
      list = list.filter((o) => o.order_type === typeFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const itemsText = (o.items || []).map((it) => `${it.name} ${it.item_notes || ""}`).join(" ");
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

  const topItems = useMemo(() => {
    const map = new Map(); // name -> {qty, revenue}
    for (const o of filtered) {
      for (const it of o.items || []) {
        const name = it.name || "Unknown";
        const qty = Number(it.qty || 0);
        const rev = qty * Number(it.unit_price_cents || 0);

        if (!map.has(name)) map.set(name, { name, qty: 0, revenue: 0 });
        const row = map.get(name);
        row.qty += qty;
        row.revenue += rev;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }, [filtered]);

  function exportCSV() {
    const header = [
      "order_number",
      "created_at",
      "status",
      "order_type",
      "customer_name",
      "total",
      "items",
    ];

    const rows = filtered.map((o) => {
      const items = (o.items || [])
        .map((it) => {
          const note = it.item_notes ? ` (${it.item_notes})` : "";
          return `${it.qty}x ${it.name}${note}`;
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

    downloadCSV(
      `club_kitchen_reports_${fromDate}_to_${toDate}.csv`,
      [header, ...rows]
    );
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

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <div style={{ color: "#666", marginTop: 4 }}>Orders, totals, and trends.</div>
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
            <input type="date" value={fromDate} onChange={(e) => { setPreset("custom"); setFromDate(e.target.value); }} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }} />
            <span style={{ color: "#666" }}>To</span>
            <input type="date" value={toDate} onChange={(e) => { setPreset("custom"); setToDate(e.target.value); }} style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }} />
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

      {/* Top items */}
      <div style={{ marginTop: 14, background: "white", border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Top items</h2>
          <div style={{ color: "#666" }}>Top 15 by quantity</div>
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
                    <div style={{ color: "#666", marginTop: 4 }}>
                      {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={chipStyle(o.status)}>{statusLabel(o.status)}</div>
                    <div style={{ marginTop: 6, fontWeight: 950 }}>{money(o.total_cents)}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {(o.items || []).map((it, idx) => (
                    <div key={`${o.id}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <b>{it.qty}×</b> {it.name}
                        {it.item_notes ? <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div> : null}
                      </div>
                      <div style={{ color: "#666" }}>{money(Number(it.unit_price_cents || 0) * Number(it.qty || 0))}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, color: "#777", fontSize: 12 }}>
        Tip: “Completed only” is best for sales reporting. Use “Active only” if you want to audit queue behaviour.
      </div>
    </div>
  );
}
