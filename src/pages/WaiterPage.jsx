// src/pages/WaiterPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

const COLUMNS = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];
const ACTIVE_STATUSES = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];

function withTimeout(promise, ms, message = "Request timed out. Please try again.") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function minutesAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

function statusLabel(s) {
  const v = String(s || "").toLowerCase();
  if (v === "awaiting_payment") return "AWAITING PAYMENT";
  return String(s || "").toUpperCase();
}

function chipStyle(status) {
  const s = String(status || "").toLowerCase();
  const base = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid #e5e5e5",
    background: "#f7f7f7",
    whiteSpace: "nowrap",
  };
  if (s === "queued") return { ...base, background: "#f2f7ff", borderColor: "#dbeafe" };
  if (s === "accepted") return { ...base, background: "#f5f3ff", borderColor: "#e9d5ff" };
  if (s === "preparing") return { ...base, background: "#fff7ed", borderColor: "#fed7aa" };
  if (s === "ready") return { ...base, background: "#ecfdf5", borderColor: "#bbf7d0" };
  if (s === "awaiting_payment") return { ...base, background: "#fefce8", borderColor: "#fde68a" };
  return base;
}

function overdueCardStyle(mins) {
  if (mins >= 25) return { borderColor: "#fecaca", background: "#fff1f2" };
  if (mins >= 15) return { borderColor: "#fde68a", background: "#fffbeb" };
  return { borderColor: "#e5e5e5", background: "white" };
}

export default function WaiterPage() {
  const nav = useNavigate();

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // ✅ prevents “refresh then disappear”
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  const [compact, setCompact] = useState(false);

  // sound
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("waiter_sound") === "1");
  const prevStatusMapRef = useRef(new Map()); // orderId -> lastStatus

  // actions
  const [busyOrderId, setBusyOrderId] = useState(null);

  // Default compact mode on small screens
  useEffect(() => {
    const decide = () => setCompact(window.innerWidth < 900);
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  // ✅ Robust session hydrate: getSession -> refreshSession once -> then decide
  async function ensureSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;

    // try refresh once (fixes “refresh page then session looks null”)
    const refreshed = await supabase.auth.refreshSession();
    return refreshed?.data?.session || null;
  }

  // Require login + ROLE gate (waiter only) — robust on refresh
  useEffect(() => {
    let alive = true;

    async function check() {
      setAuthReady(false);
      setErr("");

      const s = await ensureSession();
      if (!alive) return;

      setSession(s);

      if (!s) {
        setAuthReady(true);
        nav("/login", { replace: true });
        return;
      }

      const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
      if (!alive) return;

      if (roleErr) {
        setAuthReady(true);
        nav("/login", { replace: true });
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      if (r !== "waiter") {
        setAuthReady(true);
        nav("/kitchen", { replace: true });
        return;
      }

      setAuthReady(true);
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!alive) return;

      setSession(s);

      if (!s) {
        setAuthReady(true);
        nav("/login", { replace: true });
        return;
      }

      const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
      if (!alive) return;

      if (roleErr) {
        setAuthReady(true);
        nav("/login", { replace: true });
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      if (r !== "waiter") {
        setAuthReady(true);
        nav("/kitchen", { replace: true });
        return;
      }

      setAuthReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  async function load() {
    setErr("");

    // cache-bust param must exist in SQL function signature (p_bust bigint)
    const { data, error } = await supabase.rpc("staff_list_active_orders", { p_bust: Date.now() });
    if (error) return setErr(error.message);

    const nextOrders = (data || [])
      .filter((o) => ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()))
      .map((o) => ({
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
      const prevMap = prevStatusMapRef.current;
      for (const o of nextOrders) {
        prevMap.set(o.id, String(o.status || "").trim().toLowerCase());
      }
    }

    setOrders(nextOrders);
  }

  // ✅ Only poll AFTER auth is confirmed (prevents “refresh blanks list”)
  useEffect(() => {
    if (!authReady || !session) return;

    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session, soundOn]);

  const ordersWithAge = useMemo(() => {
    return (orders || []).map((o) => ({
      ...o,
      mins: minutesAgo(o.created_at),
      _statusLower: String(o.status || "").toLowerCase(),
    }));
  }, [orders]);

  const byStatus = useMemo(() => {
    const map = new Map();
    for (const o of ordersWithAge) {
      const st = o._statusLower;
      if (!map.has(st)) map.set(st, []);
      map.get(st).push(o);
    }
    return map;
  }, [ordersWithAge]);

  const flatSorted = useMemo(() => {
    const statusRank = new Map(COLUMNS.map((s, i) => [s, i]));
    return [...ordersWithAge].sort((a, b) => {
      const ra = statusRank.get(a._statusLower) ?? 999;
      const rb = statusRank.get(b._statusLower) ?? 999;
      if (ra !== rb) return ra - rb;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }, [ordersWithAge]);

  async function setStatus(orderId, newStatus) {
    if (busyOrderId) return;

    setErr("");
    setBusyOrderId(orderId);

    const prevOrders = orders;

    // optimistic update
    if (newStatus === "cancelled" || newStatus === "paid") {
      setOrders((cur) => cur.filter((o) => o.id !== orderId));
    } else {
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    }

    try {
      const rpcCall = supabase.rpc("staff_set_status", {
        p_order_id: orderId,
        p_new_status: newStatus, // text -> enum in SQL
      });

      const { error } = await withTimeout(rpcCall, 8000, "Network timeout. Please try again.");
      if (error) {
        setOrders(prevOrders);
        setErr(error.message);
        return;
      }

      await load();
    } catch (e) {
      setOrders(prevOrders);
      setErr(e?.message || "Something went wrong. Please try again.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function logout() {
    setErr("");
    try {
      const { error } = await withTimeout(supabase.auth.signOut(), 8000, "Logout timed out. Try again.");
      if (error) {
        setErr(error.message);
        return;
      }
      nav("/login", { replace: true });
    } catch (e) {
      setErr(e?.message || "Logout failed.");
    }
  }

  function ActionRow({ o }) {
    const st = String(o.status || "").toLowerCase();
    const busy = busyOrderId === o.id;

    const btnBase = {
      padding: "6px 10px",
      borderRadius: 10,
      cursor: "pointer",
      opacity: busy ? 0.6 : 1,
    };

    return (
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus(o.id, "cancelled")}
          style={{
            ...btnBase,
            border: "1px solid #fecaca",
            background: "#fff1f2",
            fontWeight: 900,
          }}
        >
          {busy ? "Working…" : "Cancel"}
        </button>

        {st === "queued" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "accepted")} style={btnBase}>
            {busy ? "Updating…" : "Accept"}
          </button>
        )}

        {st === "accepted" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "preparing")} style={btnBase}>
            {busy ? "Updating…" : "Start Prep"}
          </button>
        )}

        {st === "preparing" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "ready")} style={btnBase}>
            {busy ? "Updating…" : "Ready"}
          </button>
        )}

        {st === "ready" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "awaiting_payment")} style={btnBase}>
            {busy ? "Updating…" : "Complete"}
          </button>
        )}

        {st === "awaiting_payment" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "paid")}
            style={{
              ...btnBase,
              border: "1px solid #bbf7d0",
              background: "#ecfdf5",
              fontWeight: 900,
            }}
          >
            {busy ? "Updating…" : "Paid"}
          </button>
        )}
      </div>
    );
  }

  function OrderCard({ o, showAgeRight = true }) {
    const style = overdueCardStyle(o.mins);
    return (
      <div
        style={{
          border: `1px solid ${style.borderColor}`,
          background: style.background,
          borderRadius: 14,
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
            </div>
            <div style={{ color: "#666", marginTop: 2 }}>{o.customer_name}</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={chipStyle(o.status)}>{statusLabel(o.status)}</div>
            {showAgeRight && <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{o.mins} min ago</div>}
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

        <ActionRow o={o} />
      </div>
    );
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

      {compact ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {authReady && session && flatSorted.length === 0 ? <div style={{ color: "#777" }}>No active orders</div> : null}
          {flatSorted.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
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
                <h2 style={{ margin: 0, textTransform: "capitalize" }}>{st.replace("_", " ")}</h2>
                <div style={{ color: "#666", fontSize: 12 }}>{(byStatus.get(st) || []).length}</div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {(byStatus.get(st) || []).length === 0 ? <div style={{ color: "#777" }}>No orders</div> : null}
                {(byStatus.get(st) || []).map((o) => (
                  <OrderCard key={o.id} o={o} showAgeRight={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
