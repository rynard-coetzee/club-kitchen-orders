// src/pages/KitchenPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function money(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

const ACTIVE_STATUSES = ["queued", "accepted", "preparing", "ready"];

export default function KitchenPage() {
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  // Auth gate (kitchen requires login)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (!data.session) nav("/login");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) nav("/login");
    });

    return () => sub.subscription.unsubscribe();
  }, [nav]);

  async function load() {
    setErr("");

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        order_type,
        customer_name,
        status,
        created_at,
        order_items (
          id,
          qty,
          item_notes,
          unit_price_cents,
          menu_items ( name )
        )
      `
      )
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true });

    if (error) return setErr(error.message);
    setOrders(data || []);
  }

  // Poll for updates (simple + reliable for MVP)
  useEffect(() => {
    if (!session) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [session]);

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
        }}
      >
        <h1 style={{ margin: 0 }}>Kitchen Queue</h1>
        <button onClick={logout} style={{ padding: "8px 12px", borderRadius: 10 }}>
          Logout
        </button>
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

                    <div style={{ color: "#666", fontSize: 12 }}>
                      {new Date(o.created_at).toLocaleTimeString()}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {(o.order_items || []).map((it) => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <b>{it.qty}×</b> {it.menu_items?.name}
                          {it.item_notes ? (
                            <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div>
                          ) : null}
                        </div>
                        <div style={{ color: "#666", fontSize: 12 }}>
                          {money(it.unit_price_cents * it.qty)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {st === "queued" && (
                      <button
                        onClick={() => setStatus(o.id, "accepted")}
                        style={{ padding: "6px 10px", borderRadius: 10 }}
                      >
                        Accept
                      </button>
                    )}

                    {st === "accepted" && (
                      <button
                        onClick={() => setStatus(o.id, "preparing")}
                        style={{ padding: "6px 10px", borderRadius: 10 }}
                      >
                        Start Prep
                      </button>
                    )}

                    {st === "preparing" && (
                      <button
                        onClick={() => setStatus(o.id, "ready")}
                        style={{ padding: "6px 10px", borderRadius: 10 }}
                      >
                        Ready
                      </button>
                    )}

                    {st === "ready" && (
                      <button
                        onClick={() => setStatus(o.id, "completed")}
                        style={{ padding: "6px 10px", borderRadius: 10 }}
                      >
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
