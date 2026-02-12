// src/pages/KitchenPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

function money(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

export default function KitchenPage() {
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  // sound
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("kitchen_sound") === "1");
  const seenQueuedRef = useRef(new Set()); // order ids we've already dinged for

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
        return;
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
      if (r !== "kitchen") {
        nav("/waiter", { replace: true });
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  async function load() {
    setErr("");

    const { data, error } = await supabase.rpc("staff_list_active_orders");
    if (error) return setErr(error.message);

    const nextOrders = (data || []).map((o) => ({
      ...o,
      order_items: Array.isArray(o.order_items) ? o.order_items : o.order_items || [],
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
    setErr("");
    const { error } = await supabase.rpc("kitchen_set_status", {
      p_order_id: orderId,
      p_new_status: newStatus,
    });
    if (error) setErr(error.message);
    else load();
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const columns = ["queued", "accepted", "preparing", "ready"];

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
            onClick={() => {
              initSound(); // user gesture enables audio
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
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
            <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{st}</h2>

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
                          <b>{it.qty}×</b> {it.menu_items?.name}
                          {it.item_notes ? <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div> : null}
                        </div>
                        <div style={{ color: "#666", fontSize: 12 }}>{money((it.unit_price_cents || 0) * (it.qty || 0))}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {st === "queued" && (
                      <button onClick={() => setStatus(o.id, "accepted")} style={{ padding: "6px 10px", borderRadius: 10 }}>
                        Accept
                      </button>
                    )}

                    {st === "accepted" && (
                      <button onClick={() => setStatus(o.id, "preparing")} style={{ padding: "6px 10px", borderRadius: 10 }}>
                        Start Prep
                      </button>
                    )}

                    {st === "preparing" && (
                      <button onClick={() => setStatus(o.id, "ready")} style={{ padding: "6px 10px", borderRadius: 10 }}>
                        Ready
                      </button>
                    )}

                    {st === "ready" && (
                      <button onClick={() => setStatus(o.id, "completed")} style={{ padding: "6px 10px", borderRadius: 10 }}>
                        Complete
                      </button>
                    )}
                  </div>
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
