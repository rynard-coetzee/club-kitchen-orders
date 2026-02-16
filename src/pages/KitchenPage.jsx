// src/pages/KitchenPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

function money(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

function withTimeout(promise, ms, message = "Request timed out. Please try again.") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// ✅ Added awaiting_payment
const COLUMNS = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];
const ACTIVE_STATUSES = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];

export default function KitchenPage() {
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);

  // sound
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("kitchen_sound") === "1");
  const seenQueuedRef = useRef(new Set());

  // Auth gate + ROLE gate (kitchen only)
  useEffect(() => {
    let alive = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const s = data.session || null;
      if (!alive) return;

      setSession(s);
      if (!s) {
        nav("/login");
        return;
      }

      const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
      if (roleErr) {
        nav("/login");
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      if (r !== "kitchen") nav("/waiter", { replace: true });
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (!s) {
        nav("/login");
        return;
      }

      const { data: role, error: roleErr } = await supabase.rpc("get_my_role");
      if (roleErr) {
        nav("/login");
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      if (r !== "kitchen") nav("/waiter", { replace: true });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  async function load() {
    setErr("");
    const { data, error } = await supabase.rpc("staff_list_active_orders", { p_bust: Date.now() });
    if (error) return setErr(error.message);

    const nextOrders = (data || [])
      .filter((o) => ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()))
      .map((o) => ({
        ...o,
        order_items: Array.isArray(o.order_items) ? o.order_items : o.order_items || [],
      }));

    // Ding for NEW queued orders only
    if (soundOn) {
      const seen = seenQueuedRef.current;

      for (const o of nextOrders) {
        if (String(o.status).toLowerCase() === "queued" && !seen.has(o.id)) {
          initSound();
          ding();
          seen.add(o.id);
        }
      }

      for (const id of Array.from(seen)) {
        const stillQueued = nextOrders.some((o) => o.id === id && String(o.status).toLowerCase() === "queued");
        if (!stillQueued) seen.delete(id);
      }
    }

    setOrders(nextOrders);
  }

  useEffect(() => {
    if (!session) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, soundOn]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const st = String(o.status || "").toLowerCase();
      if (!map.has(st)) map.set(st, []);
      map.get(st).push(o);
    }
    return map;
  }, [orders]);

  async function setStatus(orderId, newStatus) {
    if (busyOrderId) return;

    setErr("");
    setBusyOrderId(orderId);

    const prevOrders = orders;

    // ✅ If cancelling or paying, remove immediately
    if (newStatus === "cancelled" || newStatus === "paid") {
      setOrders((cur) => cur.filter((o) => o.id !== orderId));
    } else {
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    }

    try {
      const rpcCall = supabase.rpc("staff_set_status", {
        p_order_id: orderId,
        p_new_status: newStatus,
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

  const ActionRow = ({ o }) => {
    const st = String(o.status || "").toLowerCase();
    const busy = busyOrderId === o.id;

    return (
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {/* ✅ Cancel always available while active */}
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus(o.id, "cancelled")}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            cursor: "pointer",
            opacity: busy ? 0.6 : 1,
            border: "1px solid #fecaca",
            background: "#fff1f2",
            fontWeight: 900,
          }}
        >
          {busy ? "Working…" : "Cancel"}
        </button>

        {st === "queued" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "accepted")}
            style={{ padding: "6px 10px", borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Updating…" : "Accept"}
          </button>
        )}

        {st === "accepted" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "preparing")}
            style={{ padding: "6px 10px", borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Updating…" : "Start Prep"}
          </button>
        )}

        {st === "preparing" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "ready")}
            style={{ padding: "6px 10px", borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Updating…" : "Ready"}
          </button>
        )}

        {st === "ready" && (
          <button
            type="button"
            disabled={busy}
            // ✅ Complete now goes to awaiting_payment
            onClick={() => setStatus(o.id, "awaiting_payment")}
            style={{ padding: "6px 10px", borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Updating…" : "Complete"}
          </button>
        )}

        {st === "awaiting_payment" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "paid")}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              cursor: "pointer",
              opacity: busy ? 0.6 : 1,
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
  };

  return (
    <div style={{ fontFamily: "Arial", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Kitchen Queue</h1>

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
              localStorage.setItem("kitchen_sound", next ? "1" : "0");
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
        {COLUMNS.map((st) => (
          <div
            key={st}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              minHeight: 200,
              background: "white",
            }}
          >
            <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{st.replace("_", " ")}</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {(grouped.get(st) || []).map((o) => (
                <div key={o.id} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
                      </div>
                      <div style={{ color: "#666" }}>{o.customer_name}</div>
                    </div>

                    <div style={{ color: "#666", fontSize: 12 }}>{new Date(o.created_at).toLocaleTimeString()}</div>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {(o.order_items || []).map((it) => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <b>{it.qty}×</b> {it.name}
                          {it.item_notes ? <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div> : null}
                        </div>
                        <div style={{ color: "#666", fontSize: 12 }}>
                          {money((it.unit_price_cents || 0) * (it.qty || 0))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <ActionRow o={o} />
                </div>
              ))}

              {(grouped.get(st) || []).length === 0 ? <div style={{ color: "#777" }}>No orders</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
