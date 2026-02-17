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

// ✅ Parse "EXTRA FOR: <parent name>"
function parseExtraFor(note) {
  const s = String(note || "").trim();
  const prefix = "EXTRA FOR:";
  if (!s.toUpperCase().startsWith(prefix)) return null;
  return s.slice(prefix.length).trim();
}

// ✅ Group extras under their parent item
function groupItemsWithExtras(orderItems) {
  const base = Array.isArray(orderItems) ? orderItems : [];
  const mains = [];
  const extras = [];

  for (const it of base) {
    const parentName = parseExtraFor(it.item_notes);
    if (parentName) extras.push({ ...it, __parentName: parentName });
    else mains.push({ ...it, __extras: [] });
  }

  // Map by lowercased name for matching
  const byName = new Map();
  for (const m of mains) {
    const key = String(m.name || "").trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(m);
  }

  const unmatchedExtras = [];

  for (const ex of extras) {
    const key = String(ex.__parentName || "").trim().toLowerCase();
    const candidates = byName.get(key);
    if (!candidates || candidates.length === 0) {
      unmatchedExtras.push(ex);
      continue;
    }

    // Attach to the first match (good enough for now)
    candidates[0].__extras.push(ex);
  }

  // Keep unmatched extras as standalone rows (so nothing disappears)
  return [...mains, ...unmatchedExtras].map((x) => ({
    ...x,
    __extras: Array.isArray(x.__extras) ? x.__extras : [],
  }));
}

export default function KitchenPage() {
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);

  const columns = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];

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
      if (r !== "kitchen") {
        nav("/waiter", { replace: true });
      }
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

    const nextOrders = (data || []).map((o) => ({
      ...o,
      order_items: groupItemsWithExtras(Array.isArray(o.order_items) ? o.order_items : o.order_items || []),
    }));

    // Ding for NEW queued orders only
    if (soundOn) {
      const seen = seenQueuedRef.current;

      for (const o of nextOrders) {
        if (o.status === "queued" && !seen.has(o.id)) {
          initSound();
          ding();
          seen.add(o.id);
        }
      }

      // Cleanup: remove ids that are no longer queued
      for (const id of Array.from(seen)) {
        const stillQueued = nextOrders.some((o) => o.id === id && o.status === "queued");
        if (!stillQueued) seen.delete(id);
      }
    }

    setOrders(nextOrders);
  }

  // Poll for updates
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
      if (!map.has(o.status)) map.set(o.status, []);
      map.get(o.status).push(o);
    }
    return map;
  }, [orders]);

  async function setStatus(orderId, newStatus) {
    if (busyOrderId) return;

    setErr("");
    setBusyOrderId(orderId);

    // optimistic update
    const prevOrders = orders;
    setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

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

  async function cancelOrder(orderId) {
    if (busyOrderId) return;
    setErr("");
    setBusyOrderId(orderId);

    // remove instantly from UI
    const prev = orders;
    setOrders((cur) => cur.filter((o) => o.id !== orderId));

    try {
      const rpcCall = supabase.rpc("staff_cancel_order", { p_order_id: orderId });
      const { error } = await withTimeout(rpcCall, 8000, "Network timeout. Please try again.");
      if (error) {
        setOrders(prev);
        setErr(error.message);
        return;
      }
      await load();
    } catch (e) {
      setOrders(prev);
      setErr(e?.message || "Cancel failed.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function logout() {
    setErr("");
    try {
      const { error } = await withTimeout(supabase.auth.signOut(), 8000, "Logout timed out. Try again.");
      if (error) setErr(error.message);
      nav("/login", { replace: true });
    } catch (e) {
      setErr(e?.message || "Logout failed.");
    }
  }

  function nextActionForStatus(st) {
    if (st === "queued") return { label: "Accept", to: "accepted" };
    if (st === "accepted") return { label: "Start Prep", to: "preparing" };
    if (st === "preparing") return { label: "Ready", to: "ready" };
    if (st === "ready") return { label: "Complete", to: "awaiting_payment" };
    if (st === "awaiting_payment") return { label: "Paid", to: "paid" };
    return null;
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
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
        {columns.map((st) => (
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
            <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{st.replaceAll("_", " ")}</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {(grouped.get(st) || []).map((o) => {
                const action = nextActionForStatus(st);
                return (
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
                        <div key={it.id} style={{ display: "grid", gap: 6 }}>
                          {/* main line */}
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div>
                              <b>{it.qty}×</b> {it.name}
                              {it.item_notes && !parseExtraFor(it.item_notes) ? (
                                <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div>
                              ) : null}
                            </div>
                            <div style={{ color: "#666", fontSize: 12 }}>{money((it.unit_price_cents || 0) * (it.qty || 0))}</div>
                          </div>

                          {/* extras nested */}
                          {Array.isArray(it.__extras) && it.__extras.length > 0 && (
                            <div style={{ marginLeft: 14, display: "grid", gap: 6 }}>
                              {it.__extras.map((ex) => (
                                <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ color: "#111" }}>
                                    <span style={{ opacity: 0.7 }}>↳</span> <b>{ex.qty}×</b> {ex.name}
                                  </div>
                                  <div style={{ color: "#666", fontSize: 12 }}>
                                    {money((ex.unit_price_cents || 0) * (ex.qty || 0))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {action && (
                        <button
                          type="button"
                          disabled={busyOrderId === o.id}
                          onClick={() => setStatus(o.id, action.to)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            opacity: busyOrderId === o.id ? 0.6 : 1,
                          }}
                        >
                          {busyOrderId === o.id ? "Updating…" : action.label}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyOrderId === o.id}
                        onClick={() => cancelOrder(o.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          cursor: "pointer",
                          background: "#fff1f2",
                          border: "1px solid #fecaca",
                          fontWeight: 900,
                          opacity: busyOrderId === o.id ? 0.6 : 1,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}

              {(grouped.get(st) || []).length === 0 ? <div style={{ color: "#777" }}>No orders</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
