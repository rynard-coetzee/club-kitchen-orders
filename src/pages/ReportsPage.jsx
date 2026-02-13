// src/pages/ReportsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

function toLocalInputValue(date) {
  // yyyy-mm-ddThh:mm for <input type="datetime-local">
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
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

  const [session, setSession] = useState(null);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [fromDt, setFromDt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalInputValue(d);
  });
  const [toDt, setToDt] = useState(() => toLocalInputValue(new Date()));
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState(""); // "" | "dine_in" | "collection"

  // Auth + staff gate
  useEffect(() => {
    let alive = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const s = data.session || null;
      if (!alive) return;

      setSession(s);
      if (!s) return nav("/login");

      const { data: role, error } = await supabase.rpc("get_my_role");
      if (error) return nav("/login");

      const r = String(role || "").trim().toLowerCase();
      if (r !== "kitchen" && r !== "waiter") return nav("/login");
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => check());

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  async function load() {
    setErr("");
    setLoading(true);

    const p_from = fromDt ? new Date(fromDt).toISOString() : null;
    const p_to = toDt ? new Date(toDt).toISOString() : null;

    const { data, error } = await supabase.rpc("staff_report_orders", {
      p_from,
      p_to,
      p_search: search.trim() || null,
      p_order_type: orderType || null,
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setRows(data || []);
  }

  useEffect(() => {
    if (!session) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const summary = useMemo(() => {
    const count = rows.length;
    const total = rows.reduce((s, r) => s + Number(r.total_cents || 0), 0);
    return { count, total };
  }, [rows]);

  function exportCSV() {
    const header = ["Order#", "CreatedAt", "Type", "Name", "Status", "Total", "Items"];
    const dataRows = rows.map((o) => {
      const items = (o.items || []).map((it) => `${it.qty}x ${it.name}${it.item_notes ? ` (${it.item_notes})` : ""}`).join(" | ");
      return [
        o.order_number,
        new Date(o.created_at).toLocaleString(),
        o.order_type,
        o.customer_name,
        o.status,
        money(o.total_cents),
        items,
      ];
    });

    downloadCSV(`club-orders-${Date.now()}.csv`, [header, ...dataRows]);
  }

  async function logout() {
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <div style={{ color: "#666", marginTop: 4 }}>
            {summary.count} orders • Total {money(summary.total)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => nav("/kitchen")} style={{ padding: "8px 12px", borderRadius: 10 }}>
            ← Back
          </button>
          <button onClick={logout} style={{ padding: "8px 12px", borderRadius: 10 }}>
            Logout
          </button>
        </div>
      </div>

      {err && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 10, marginTop: 12 }}>
          <b>Error:</b> {err}
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 12, background: "white" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>From</div>
            <input type="datetime-local" value={fromDt} onChange={(e) => setFromDt(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666" }}>To</div>
            <input type="datetime-local" value={toDt} onChange={(e) => setToDt(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Type</div>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="">All</option>
              <option value="dine_in">Dine-in</option>
              <option value="collection">Collection</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or order #"
              style={{ width: "100%" }}
            />
          </div>

          <button onClick={load} style={{ padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}>
            {loading ? "Loading…" : "Apply"}
          </button>

          <button onClick={exportCSV} style={{ padding: "10px 12px", borderRadius: 12, fontWeight: 900 }}>
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {rows.length === 0 && !loading ? <div style={{ color: "#777" }}>No orders found.</div> : null}

        {rows.map((o) => (
          <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"} • {money(o.total_cents)}
                </div>
                <div style={{ color: "#666", marginTop: 2 }}>
                  {new Date(o.created_at).toLocaleString()} • {o.customer_name} • {String(o.status || "").toUpperCase()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {(o.items || []).map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
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
    </div>
  );
}
