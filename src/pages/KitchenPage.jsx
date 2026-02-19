// src/pages/KitchenPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

function money(cents) {
  return `R${(Number(cents || 0) / 100).toFixed(2)}`;
}

function withTimeout(promise, ms, message = "Request timed out. Please try again.") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/** OLD fallback (extras stored as separate order_items with "EXTRA FOR:" in item_notes) */
function parseExtraFor(note) {
  const raw = String(note || "").trim();
  const upper = raw.toUpperCase();
  const prefix = "EXTRA FOR:";
  if (!upper.startsWith(prefix)) return null;
  return raw.slice(prefix.length).trim();
}
function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}
function findBestParentIndex(mains, parentName) {
  const p = normName(parentName);
  if (!p) return -1;

  for (let i = 0; i < mains.length; i++) {
    if (normName(mains[i].name) === p) return i;
  }
  for (let i = 0; i < mains.length; i++) {
    const m = normName(mains[i].name);
    if (!m) continue;
    if (m.includes(p) || p.includes(m)) return i;
  }
  return -1;
}
function groupItemsWithExtras(orderItems) {
  const list = Array.isArray(orderItems) ? orderItems : [];
  const mains = [];
  const extras = [];

  for (const it of list) {
    const parentName = parseExtraFor(it.item_notes);
    if (parentName) extras.push({ ...it, __parentName: parentName });
    else mains.push({ ...it, __extras: [] });
  }

  const unmatched = [];
  for (const ex of extras) {
    const idx = findBestParentIndex(mains, ex.__parentName);
    if (idx >= 0) mains[idx].__extras.push(ex);
    else unmatched.push(ex);
  }

  return [...mains, ...unmatched];
}

/** NEW: parse order_items.extras jsonb that looks like:
 * {"groups":[{"name":"Cooking","group_id":1,"selected":[{"id":1,"name":"Rare","price_cents":0}]}]}
 */
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseExtrasGroups(extrasJson) {
  // Accept: null, [], {}, {"groups":[...]}
  const obj = extrasJson && typeof extrasJson === "object" ? extrasJson : null;
  const groups = obj && !Array.isArray(obj) ? safeArray(obj.groups) : safeArray(extrasJson);

  // We only support the new real format: [{name, selected:[{name,price_cents}]}] OR {groups:[...]}
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

    if (names.length) {
      lines.push({ group: gName, value: names.join(", ") });
    }
  }

  return { lines, totalExtrasCents };
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

function itemTotalCents(it) {
  const qty = Number(it?.qty || 0);
  const base = Number(it?.unit_price_cents || 0) * qty;

  // extrasJson total is “per item instance”, so multiply by qty
  const { totalExtrasCents } = parseExtrasGroups(it?.extras);
  const extrasTotal = totalExtrasCents * qty;

  return base + extrasTotal;
}

function orderTotalCents(orderItems) {
  const list = Array.isArray(orderItems) ? orderItems : [];
  let total = 0;

  for (const it of list) {
    // If it is an OLD “extra line item” via notes, treat as normal item (it has its own unit_price_cents)
    total += itemTotalCents(it);
  }
  return total;
}

const COLUMNS = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];
const ACTIVE_STATUSES = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];

export default function KitchenPage() {
  const nav = useNavigate();

  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);

  // sound
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("kitchen_sound") === "1");
  const seenQueuedRef = useRef(new Set());

  const pollRef = useRef(null);
  const aliveRef = useRef(true);

  async function ensureSession() {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    const refreshed = await supabase.auth.refreshSession();
    return refreshed?.data?.session || null;
  }

  async function ensureKitchenRole() {
    const { data: role, error } = await supabase.rpc("get_my_role");
    if (error) return { ok: false, reason: "role_error" };
    const r = String(role || "").trim().toLowerCase();
    if (r !== "kitchen") return { ok: false, reason: "not_kitchen", role: r };
    return { ok: true, role: r };
  }

  async function load() {
    setErr("");

    const s = await ensureSession();
    if (!aliveRef.current) return;

    if (!s) {
      stopPolling();
      nav("/login", { replace: true });
      return;
    }

    const roleRes = await ensureKitchenRole();
    if (!aliveRef.current) return;

    if (!roleRes.ok) {
      stopPolling();
      if (roleRes.reason === "not_kitchen") nav("/waiter", { replace: true });
      else nav("/login", { replace: true });
      return;
    }

    const { data, error } = await supabase.rpc("staff_list_active_orders", { p_bust: Date.now() });
    if (!aliveRef.current) return;

    if (error) {
      setErr(error.message);
      return;
    }

    const nextOrders = (data || [])
      .filter((o) => ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()))
      .map((o) => ({
        ...o,
        order_items: Array.isArray(o.order_items) ? o.order_items : o.order_items || [],
      }));

    if (soundOn) {
      const seen = seenQueuedRef.current;
      for (const o of nextOrders) {
        if (String(o.status || "").toLowerCase() === "queued" && !seen.has(o.id)) {
          initSound();
          ding();
          seen.add(o.id);
        }
      }
      for (const id of Array.from(seen)) {
        const stillQueued = nextOrders.some((o) => o.id === id && String(o.status || "").toLowerCase() === "queued");
        if (!stillQueued) seen.delete(id);
      }
    }

    setOrders(nextOrders);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    aliveRef.current = true;

    load();
    if (!pollRef.current) pollRef.current = setInterval(load, 2500);

    return () => {
      aliveRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

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

    if (newStatus === "cancelled" || newStatus === "paid") {
      setOrders((cur) => cur.filter((o) => o.id !== orderId));
    } else {
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    }

    try {
      const rpcCall = supabase.rpc("kitchen_set_status", {
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
      stopPolling();
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
      border: "1px solid #ddd",
      background: "white",
      fontWeight: 900,
    };

    return (
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus(o.id, "cancelled")}
          style={{ ...btnBase, border: "1px solid #fecaca", background: "#fff1f2" }}
        >
          Cancel
        </button>

        {st === "queued" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "accepted")} style={btnBase}>
            {busy ? "Accepting…" : "Accept"}
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
            style={{ ...btnBase, border: "1px solid #bbf7d0", background: "#ecfdf5" }}
          >
            {busy ? "Updating…" : "Paid"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Kitchen Queue</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => nav("/order")}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            + New Order
          </button>

          <button
            type="button"
            onClick={() => nav("/reports")}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
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
          <div key={st} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, minHeight: 200, background: "white" }}>
            <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{st.replace("_", " ")}</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {(grouped.get(st) || []).map((o) => {
                const total = orderTotalCents(o.order_items || []);
                return (
                  <div key={o.id} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
                        </div>
                        <div style={{ color: "#666" }}>{o.customer_name}</div>
                        {o.customer_phone ? <div style={{ color: "#666", fontSize: 12 }}>Tel: {o.customer_phone}</div> : null}
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#666", fontSize: 12 }}>{new Date(o.created_at).toLocaleTimeString()}</div>
                        <div style={{ marginTop: 6, fontWeight: 950 }}>{money(total)}</div>
                        <div style={{ color: "#666", fontSize: 12 }}>Order total</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {groupItemsWithExtras(o.order_items || []).map((it) => {
                        const isUnmatchedExtra = Boolean(parseExtraFor(it.item_notes));
                        const lineTotal = itemTotalCents(it);

                        return (
                          <div key={it.id} style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div>
                                <b>{it.qty}×</b> {it.name || (isUnmatchedExtra ? "Extra" : "")}

                                {it.item_notes && !isUnmatchedExtra ? (
                                  <div style={{ color: "#666", fontSize: 12 }}>Note: {it.item_notes}</div>
                                ) : null}

                                {/* ✅ NEW jsonb extras (Cooking, Add-ons, etc) */}
                                {renderExtrasUnderItem(it.extras)}

                                {/* unmatched extras from old approach */}
                                {isUnmatchedExtra ? <div style={{ color: "#6b7280", fontSize: 12 }}>{it.item_notes}</div> : null}
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <div style={{ color: "#666", fontSize: 12 }}>{money(lineTotal)}</div>
                                <div style={{ color: "#9ca3af", fontSize: 11 }}>line total</div>
                              </div>
                            </div>

                            {/* old approach nested extras */}
                            {Array.isArray(it.__extras) && it.__extras.length > 0 ? (
                              <div style={{ marginLeft: 14, display: "grid", gap: 6 }}>
                                {it.__extras.map((ex) => (
                                  <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div style={{ color: "#111" }}>
                                      <span style={{ opacity: 0.7 }}>↳</span> <b>{ex.qty}×</b> {ex.name}
                                    </div>
                                    <div style={{ color: "#666", fontSize: 12 }}>
                                      {money(itemTotalCents(ex))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <ActionRow o={o} />
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
