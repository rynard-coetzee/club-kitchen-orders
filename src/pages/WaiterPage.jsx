// src/pages/WaiterPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

const COLUMNS = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];
const ACTIVE_STATUSES = ["queued", "accepted", "preparing", "ready", "awaiting_payment"];

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

/** ✅ OLD fallback (extras were separate order_items with "EXTRA FOR:") */
function parseExtraFor(note) {
  const s = String(note || "").trim();
  const prefix = "EXTRA FOR:";
  if (!s.toUpperCase().startsWith(prefix)) return null;
  return s.slice(prefix.length).trim();
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
function groupItemsWithOldExtras(orderItems) {
  const list = Array.isArray(orderItems) ? orderItems : [];
  const mains = [];
  const extras = [];

  for (const it of list) {
    const parentName = parseExtraFor(it.item_notes);
    if (parentName) extras.push({ ...it, __parentName: parentName });
    else mains.push({ ...it, __oldExtras: [] });
  }

  const unmatched = [];
  for (const ex of extras) {
    const idx = findBestParentIndex(mains, ex.__parentName);
    if (idx >= 0) mains[idx].__oldExtras.push(ex);
    else unmatched.push(ex);
  }

  return [...mains, ...unmatched];
}

/** ✅ NEW modifiers parsing: { groups:[{name, selected:[{name, price_cents}]}]} */
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseExtrasGroups(extras) {
  if (!extras) return { lines: [], addPerUnitCents: 0 };

  if (typeof extras === "object" && !Array.isArray(extras) && Array.isArray(extras.groups)) {
    const groups = safeArray(extras.groups);
    const lines = [];
    let addPerUnitCents = 0;

    for (const g of groups) {
      const gName = String(g?.name || "").trim() || "Option";
      const selected = safeArray(g?.selected);
      if (selected.length === 0) continue;

      const parts = selected.map((s) => {
        const n = String(s?.name || "").trim() || "Selected";
        const pc = Number(s?.price_cents || 0);
        if (pc > 0) {
          addPerUnitCents += pc;
          return `${n} (+${money(pc)})`;
        }
        return n;
      });

      lines.push(`${gName}: ${parts.join(", ")}`);
    }

    return { lines, addPerUnitCents };
  }

  if (Array.isArray(extras)) {
    const lines = [];
    let addPerUnitCents = 0;

    for (const ex of extras) {
      const label = String(ex?.label ?? ex?.name ?? "Extra").trim();
      const value = String(ex?.value ?? ex?.choice ?? "").trim();
      const pc = Number(ex?.price_cents || 0);
      const qty = ex?.qty ?? ex?.quantity;

      if (pc > 0) addPerUnitCents += pc;

      if (value) lines.push(`${label}: ${value}${pc > 0 ? ` (+${money(pc)})` : ""}`);
      else if (typeof qty === "number") lines.push(`${qty}× ${label}${pc > 0 ? ` (+${money(pc)})` : ""}`);
      else lines.push(`${label}${pc > 0 ? ` (+${money(pc)})` : ""}`);
    }

    return { lines, addPerUnitCents };
  }

  return { lines: [], addPerUnitCents: 0 };
}

function renderExtrasUnderItem(extras) {
  const { lines } = parseExtrasGroups(extras);
  if (!lines.length) return null;

  return (
    <div style={{ marginTop: 6, marginLeft: 14, display: "grid", gap: 4 }}>
      {lines.map((t, idx) => (
        <div key={idx} style={{ fontSize: 12, color: "#555" }}>
          • {t}
        </div>
      ))}
    </div>
  );
}

function itemTotalCents(it) {
  const base = Number(it?.unit_price_cents || 0);
  const qty = Number(it?.qty || 0);
  const { addPerUnitCents } = parseExtrasGroups(it?.extras);
  return (base + addPerUnitCents) * qty;
}

function orderTotalCents(orderItems) {
  const list = Array.isArray(orderItems) ? orderItems : [];
  let total = 0;

  for (const it of list) {
    const isOldExtraLine = Boolean(parseExtraFor(it?.item_notes));
    if (isOldExtraLine) continue;
    total += itemTotalCents(it);
  }

  const hasAnyMain = list.some((x) => !parseExtraFor(x?.item_notes));
  if (!hasAnyMain) {
    for (const it of list) {
      total += Number(it?.unit_price_cents || 0) * Number(it?.qty || 0);
    }
  }

  return total;
}

export default function WaiterPage() {
  const nav = useNavigate();

  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [compact, setCompact] = useState(false);

  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("waiter_sound") === "1");
  const prevStatusMapRef = useRef(new Map());

  const pollRef = useRef(null);
  const aliveRef = useRef(true);

  async function ensureSession() {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;

    const refreshed = await supabase.auth.refreshSession();
    return refreshed?.data?.session || null;
  }

  async function ensureWaiterRole() {
    const { data: role, error } = await supabase.rpc("get_my_role");
    if (error) return { ok: false, reason: "role_error" };
    const r = String(role || "").trim().toLowerCase();
    if (r !== "waiter") return { ok: false, reason: "not_waiter", role: r };
    return { ok: true, role: r };
  }

  useEffect(() => {
    const decide = () => setCompact(window.innerWidth < 900);
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  async function load() {
    setErr("");

    const s = await ensureSession();
    if (!aliveRef.current) return;

    if (!s) {
      stopPolling();
      nav("/login", { replace: true });
      return;
    }

    const roleRes = await ensureWaiterRole();
    if (!aliveRef.current) return;

    if (!roleRes.ok) {
      stopPolling();
      if (roleRes.reason === "not_waiter") nav("/kitchen", { replace: true });
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
      for (const o of nextOrders) prevMap.set(o.id, String(o.status || "").trim().toLowerCase());
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
    if (!pollRef.current) pollRef.current = setInterval(load, 3000);

    return () => {
      aliveRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

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

    if (newStatus === "cancelled" || newStatus === "paid") {
      setOrders((cur) => cur.filter((o) => o.id !== orderId));
    } else {
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    }

    try {
      const rpcCall = supabase.rpc("staff_set_status", { p_order_id: orderId, p_new_status: newStatus });
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
            Accept
          </button>
        )}

        {st === "accepted" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "preparing")} style={btnBase}>
            Start Prep
          </button>
        )}

        {st === "preparing" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "ready")} style={btnBase}>
            Ready
          </button>
        )}

        {st === "ready" && (
          <button type="button" disabled={busy} onClick={() => setStatus(o.id, "awaiting_payment")} style={btnBase}>
            Complete
          </button>
        )}

        {st === "awaiting_payment" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(o.id, "paid")}
            style={{ ...btnBase, border: "1px solid #bbf7d0", background: "#ecfdf5" }}
          >
            Paid
          </button>
        )}
      </div>
    );
  }

  function OrderCard({ o }) {
    const style = overdueCardStyle(o.mins);
    const groupedItems = groupItemsWithOldExtras(o.order_items || []);
    const total = orderTotalCents(o.order_items || []);

    return (
      <div style={{ border: `1px solid ${style.borderColor}`, background: style.background, borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              #{o.order_number} • {o.order_type === "collection" ? "Collection" : "Dine-in"}
            </div>
            <div style={{ color: "#666", marginTop: 2 }}>{o.customer_name}</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={chipStyle(o.status)}>{statusLabel(o.status)}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>{o.mins} min ago</div>
            <div style={{ marginTop: 6, fontWeight: 950 }}>Total: {money(total)}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {groupedItems.map((it) => {
            const isUnmatchedOldExtra = Boolean(parseExtraFor(it.item_notes));
            const lineTotal = isUnmatchedOldExtra
              ? Number(it.unit_price_cents || 0) * Number(it.qty || 0)
              : itemTotalCents(it);

            return (
              <div key={it.id} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <b>{it.qty}×</b> {it.name || (isUnmatchedOldExtra ? "Extra" : "")}

                    {it.item_notes && !isUnmatchedOldExtra ? <div style={{ color: "#666" }}>Note: {it.item_notes}</div> : null}

                    {/* ✅ NEW jsonb modifiers */}
                    {!isUnmatchedOldExtra ? renderExtrasUnderItem(it.extras) : null}

                    {isUnmatchedOldExtra ? <div style={{ color: "#6b7280" }}>{it.item_notes}</div> : null}
                  </div>

                  <div style={{ fontWeight: 900 }}>{money(lineTotal)}</div>
                </div>

                {Array.isArray(it.__oldExtras) && it.__oldExtras.length > 0 ? (
                  <div style={{ marginLeft: 14, display: "grid", gap: 6 }}>
                    {it.__oldExtras.map((ex) => (
                      <div key={ex.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <span style={{ opacity: 0.7 }}>↳</span> <b>{ex.qty}×</b> {ex.name}
                        </div>
                        <div style={{ color: "#666", fontSize: 12 }}>{money((ex.unit_price_cents || 0) * (ex.qty || 0))}</div>
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
          {flatSorted.length === 0 ? <div style={{ color: "#777" }}>No active orders</div> : null}
          {flatSorted.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
          {COLUMNS.map((st) => (
            <div key={st} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fafafa", minHeight: 260 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h2 style={{ margin: 0, textTransform: "capitalize" }}>{st.replace("_", " ")}</h2>
                <div style={{ color: "#666", fontSize: 12 }}>{(byStatus.get(st) || []).length}</div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {(byStatus.get(st) || []).length === 0 ? <div style={{ color: "#777" }}>No orders</div> : null}
                {(byStatus.get(st) || []).map((o) => (
                  <OrderCard key={o.id} o={o} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
