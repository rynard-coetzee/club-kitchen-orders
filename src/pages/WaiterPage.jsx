// src/pages/WaiterPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

const COLUMNS = ["queued", "accepted", "preparing", "ready"];

function minutesAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

function statusLabel(s) {
  return String(s || "").toUpperCase();
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
  return base;
}

function overdueCardStyle(mins) {
  if (mins >= 25) return { borderColor: "#fecaca", background: "#fff1f2" };
  if (mins >= 15) return { borderColor: "#fde68a", background: "#fffbeb" };
  return { borderColor: "#e5e5e5", background: "white" };
}

export default function WaiterPage() {
  const nav = useNavigate();

  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState(null); // "waiter" | "kitchen" | null

  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  const [compact, setCompact] = useState(false);

  // sound
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("waiter_sound") === "1");
  const prevStatusMapRef = useRef(new Map()); // orderId -> lastStatus

  // Default compact mode on small screens
  useEffect(() => {
    const decide = () => setCompact(window.innerWidth < 900);
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  // Auth gate + ROLE gate (waiter only) — robust across refresh
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

      if (normalized !== "waiter") {
        nav("/kitchen", { replace: true });
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

  async function load() {
    setErr("");

    const { data, error } = await supabase.rpc("staff_list_active_orders", {
      p_bust: Date.now(),
    });
    if (error) return setErr(error.message);

    // normalize order_items (RPC returns json sometimes)
    const nextOrders = (data || []).map((o) => ({
      ...o,
      order_items: Array.isArray(o.order_items) ? o.order_items : o.order_items || [],
    }));

    // Sound: ding when order transitions to READY
    if (soundOn) {
      const prevMap = prevStatusMapRef.current;

      for (const o of nextOrders) {
        const prev = String(prevMap.get(o.id) || "").trim().toLowerCase();
        const now = String(o.status || "").trim().toLowerCase();

        if (now === "ready" && prev && prev !== "ready") {
          initSound();
          ding();
        }

        prevMap.set(o.id, now);
      }
    } else {
      // keep map updated so turning sound on doesn't ding for everything
      const prevMap = prevStatusMapRef.current;
      for (const o of nextOrders) {
        prevMap.set(o.id, String(o.status || "").trim().toLowerCase());
      }
    }

    setOrders(nextOrders);
  }

  // Poll only when role is confirmed waiter
  useEffect(() => {
    if (!authReady) return;
    if (role !== "waiter") return;

    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, role, soundOn]);

  const ordersWithAge = useMemo(() => {
    return (orders || []).map((o) => ({
      ...o,
      mins: minutesAgo(o.created_at),
    }));
  }, [orders]);

  const byStatus = useMemo(() => {
    const map = new Map();
    for (const o of ordersWithAge) {
      if (!map.has(o.status)) map.set(o.status, []);
      map.get(o.status).push(o);
    }
    return map;
  }, [ordersWithAge]);

  const flatSorted = useMemo(() => {
    const statusRank = new Map(COLUMNS.map((s, i) => [s, i]));
    return [...ordersWithAge].sort((a, b) => {
      const ra = statusRank.get(a.status) ?? 999;
      const rb = statusRank.get(b.status) ?? 999;
      if (ra !== rb) return ra - rb;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }, [ordersWithAge]);

  // Reliable logout (hard redirect)
  async function logout() {
    setErr("");
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("signOut failed:", e);
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Waiter View</h1>
          <div style={{ color: "#666", marginTop: 4 }}>Track all active orders and their status.</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => nav("/order")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            + New Order
          </button>

          <button
            type="button"
            onClick={() => nav("/reports")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Reports
          </button>

          <button
            type="button"
            onClick={() => {
              initSound();
              const next = !soundOn;
              setSoundOn(next);
              localStorage.setItem("waiter_sound", next ? "1" : "0");
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: soundOn ? "#111" : "white",
              color: soundOn ? "white" : "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {soundOn ? "Sound: ON" : "Sound: OFF"}
          </button>

          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: compact ? "#111" : "white",
              color: compact ? "white" : "#111",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {compact ? "Compact: ON" : "Compact: OFF"}
          </button>

          <button type="button" onClick={logout} style={{ padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}>
            Logout
          </button>
        </div>
      </div>

      {err && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 10, marginTop: 12 }}>
          <b>Error:</b> {err}
        </div>
      )}

      {!authReady ? (
        <div style={{ marginTop: 14, color: "#666" }}>Loading…</div>
      ) : role !== "waiter" ? (
        <div style={{ marginTop: 14, color: "#666" }}>Redirecting…</div>
      ) : compact ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {flatSorted.length === 0 ? <div style={{ color: "#777" }}>No active orders</div> : null}

          {flatSorted.map((o) => {
            const style = overdueCardStyle(o.mins);
            return (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${style.borderColor}`,
                  background: style.background,
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
                    </div>
                    <div style={{ color: "#666", marginTop: 2 }}>{o.customer_name}</div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={chipStyle(o.status)}>{statusLabel(o.status)}</div>
                    <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{o.mins} min ago</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {(o.order_items || []).map((it) => (
                    <div key={it.id} style={{ fontSize: 13 }}>
                      <b>{it.qty}×</b> {it.name}
                      {it.item_notes ? <div style={{ color: "#666" }}>Note: {it.item_notes}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
          {COLUMNS.map((st) => (
            <div
              key={st}
              style={{
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 12,
                background: "#fafafa",
                minHeight: 260,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h2 style={{ margin: 0, textTransform: "capitalize" }}>{st}</h2>
                <div style={{ color: "#666", fontSize: 12 }}>{(byStatus.get(st) || []).length}</div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {(byStatus.get(st) || []).length === 0 ? <div style={{ color: "#777" }}>No orders</div> : null}

                {(byStatus.get(st) || []).map((o) => {
                  const style = overdueCardStyle(o.mins);
                  return (
                    <div
                      key={o.id}
                      style={{
                        border: `1px solid ${style.borderColor}`,
                        background: style.background,
                        borderRadius: 14,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
                          </div>
                          <div style={{ color: "#666" }}>{o.customer_name}</div>
                        </div>
                        <div style={{ color: "#666", fontSize: 12 }}>{o.mins} min</div>
                      </div>

                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {(o.order_items || []).map((it) => (
                          <div key={it.id} style={{ fontSize: 13 }}>
                            <b>{it.qty}×</b> {it.name}
                            {it.item_notes ? <div style={{ color: "#666" }}>Note: {it.item_notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
