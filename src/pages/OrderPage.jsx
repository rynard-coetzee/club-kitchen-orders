// src/pages/OrderPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ding, initSound } from "../lib/sound";

function money(cents) {
  return `R${(cents / 100).toFixed(2)}`;
}

function groupByCategory(items) {
  const map = new Map();
  for (const it of items) {
    const cat = it.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(it);
  }
  return Array.from(map.entries());
}

function statusPillStyle(status) {
  const base = {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    letterSpacing: 0.3,
  };

  if (!status) return base;

  const s = String(status).toLowerCase();
  if (s === "queued") return { ...base, background: "rgba(59,130,246,0.18)" };
  if (s === "accepted") return { ...base, background: "rgba(168,85,247,0.18)" };
  if (s === "preparing") return { ...base, background: "rgba(245,158,11,0.20)" };
  if (s === "ready") return { ...base, background: "rgba(34,197,94,0.22)" };
  if (s === "completed") return { ...base, background: "rgba(107,114,128,0.25)" };
  return base;
}

function normalizeStatus(status) {
  return String(status || "").toUpperCase();
}

function readyBannerStyle() {
  return {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    background: "linear-gradient(135deg, #16a34a 0%, #22c55e 55%, #16a34a 100%)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 14px 30px rgba(34,197,94,0.25)",
  };
}

// ✅ case-insensitive Extras category
const EXTRAS_CATEGORY_LOWER = "extras";
function catLower(v) {
  return String(v || "").trim().toLowerCase();
}

export default function OrderPage() {
  const nav = useNavigate();
  const cartTopRef = useRef(null);

  const [menu, setMenu] = useState([]);
  // cart line:
  // { menu_item_id, name, price_cents, qty, item_notes, extras: [{menu_item_id,name,price_cents,qty}] }
  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [orderType, setOrderType] = useState("dine_in"); // dine_in | collection

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);
  const [isMenuLoading, setIsMenuLoading] = useState(false);

  // status tracking (saved per device)
  const [activeOrder, setActiveOrder] = useState(null); // {order_id, guest_order_token, order_number}
  const [orderData, setOrderData] = useState(null);

  // UI helpers
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState({}); // {cat: boolean}

  // Mobile layout helper
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Patron sound toggle (saved)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("patron_sound") === "1");
  const lastReadyOrderIdRef = useRef(null); // avoid dinging repeatedly while READY

  // Staff role (only staff sees Back button)
  const [staffRole, setStaffRole] = useState(null); // "kitchen" | "waiter" | null

  // ✅ “Add extras?” modal after choosing a main item
  const [extrasPickerOpen, setExtrasPickerOpen] = useState(false);
  const [extrasPickerParentIdx, setExtrasPickerParentIdx] = useState(null); // cart line index
  const lastAddedParentIdxRef = useRef(null);

  // ✅ Existing modal when user taps an extra directly
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);
  const [pendingExtra, setPendingExtra] = useState(null); // {id,name,price_cents}
  const [extraTargetIdx, setExtraTargetIdx] = useState(null); // selected cart line index

  const grouped = useMemo(() => groupByCategory(menu), [menu]);

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;

    return grouped
      .map(([cat, list]) => [
        cat,
        list.filter((it) => {
          const blob = `${it.name} ${it.description || ""}`.toLowerCase();
          return blob.includes(q);
        }),
      ])
      .filter(([, list]) => list.length > 0);
  }, [grouped, search]);

  const extrasItems = useMemo(() => {
    return (menu || []).filter((it) => catLower(it.category) === EXTRAS_CATEGORY_LOWER);
  }, [menu]);

  const cartTotal = useMemo(() => {
    let total = 0;
    for (const line of cart) {
      total += (line.price_cents || 0) * (line.qty || 0);
      for (const ex of line.extras || []) {
        total += (ex.price_cents || 0) * (ex.qty || 0);
      }
    }
    return total;
  }, [cart]);

  function ensureLineExtras(line) {
    return { ...line, extras: Array.isArray(line.extras) ? line.extras : [] };
  }

  function isExtrasItem(item) {
    return catLower(item?.category) === EXTRAS_CATEGORY_LOWER;
  }

  async function loadMenu() {
    setIsMenuLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("menu_items")
      .select("id,name,description,price_cents,category,sort_order,is_available")
      .eq("is_available", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    setIsMenuLoading(false);

    if (error) return setErr(error.message);
    setMenu(data || []);
  }

  useEffect(() => {
    loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("club_last_order");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.order_id && parsed?.guest_order_token) setActiveOrder(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function checkRole() {
      const { data } = await supabase.auth.getSession();
      const s = data.session || null;

      if (!alive) return;

      if (!s) {
        setStaffRole(null);
        return;
      }

      const { data: role, error } = await supabase.rpc("get_my_role");
      if (!alive) return;

      if (error) {
        setStaffRole(null);
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      setStaffRole(r === "kitchen" || r === "waiter" ? r : null);
    }

    checkRole();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      checkRole();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Poll order status
  useEffect(() => {
    if (!activeOrder?.order_id || !activeOrder?.guest_order_token) return;

    let cancelled = false;

    const fetchStatus = async () => {
      const { data, error } = await supabase.rpc("get_order_for_guest", {
        p_order_id: String(activeOrder.order_id || "").trim(),
        p_guest_token: String(activeOrder.guest_order_token || "").trim(),
      });

      if (cancelled) return;
      if (error) setErr(error.message);
      else setOrderData(data);
    };

    fetchStatus();
    const t = setInterval(fetchStatus, 2500);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeOrder]);

  const status = orderData?.order?.status || null;
  const orderNumber = orderData?.order?.order_number ?? activeOrder?.order_number ?? null;
  const orderId = orderData?.order?.id ?? activeOrder?.order_id ?? null;

  const isReady = String(status || "").toLowerCase() === "ready";
  const hasTrackedOrder = Boolean(orderData?.order);

  // Vibrate + SOUND on READY (once per order)
  useEffect(() => {
    if (!orderId) return;
    if (!status) return;

    const s = String(status).toLowerCase();

    if (s === "ready") {
      try {
        if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 250, 80, 300]);
      } catch {
        // ignore
      }

      if (soundOn && lastReadyOrderIdRef.current !== orderId) {
        try {
          initSound();
          ding();
        } catch {
          // ignore
        }
        lastReadyOrderIdRef.current = orderId;
      }
    }

    if (s !== "ready" && lastReadyOrderIdRef.current === orderId) {
      lastReadyOrderIdRef.current = null;
    }
  }, [status, soundOn, orderId]);

  function addExtraToParent(parentIdx, extraItem) {
    setCart((prev) => {
      const next = prev.map(ensureLineExtras);
      if (parentIdx == null || parentIdx < 0 || parentIdx >= next.length) return next;

      const parent = next[parentIdx];
      const extras = [...(parent.extras || [])];

      const exIdx = extras.findIndex((e) => e.menu_item_id === extraItem.id);
      if (exIdx >= 0) {
        extras[exIdx] = { ...extras[exIdx], qty: extras[exIdx].qty + 1 };
      } else {
        extras.push({
          menu_item_id: extraItem.id,
          name: extraItem.name,
          price_cents: extraItem.price_cents,
          qty: 1,
        });
      }

      next[parentIdx] = { ...parent, extras };
      return next;
    });
  }

  function openExtrasPickerForParent(parentIdx) {
    // only open if there are extras in menu
    if (!extrasItems.length) return;
    setExtrasPickerParentIdx(parentIdx);
    setExtrasPickerOpen(true);
  }

  function closeExtrasPicker() {
    setExtrasPickerOpen(false);
    setExtrasPickerParentIdx(null);
  }

  function addMainToCart(item) {
    setCart((prev) => {
      const next = prev.map(ensureLineExtras);
      const idx = next.findIndex((x) => x.menu_item_id === item.id && (x.item_notes || "") === "");
      if (idx >= 0) {
        const copy = [...next];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        lastAddedParentIdxRef.current = idx;
        return copy;
      }
      const newIdx = next.length;
      lastAddedParentIdxRef.current = newIdx;
      return [
        ...next,
        {
          menu_item_id: item.id,
          name: item.name,
          price_cents: item.price_cents,
          qty: 1,
          item_notes: "",
          extras: [],
        },
      ];
    });

    // ✅ after adding main item, offer extras
    queueMicrotask(() => {
      const idx = lastAddedParentIdxRef.current;
      if (typeof idx === "number") openExtrasPickerForParent(idx);
    });
  }

  function openExtrasModal(extraItem) {
    setErr("");
    setMsg("");

    if (cart.length === 0) {
      setErr("Please add a main item first, then choose extras.");
      return;
    }

    setPendingExtra({
      id: extraItem.id,
      name: extraItem.name,
      price_cents: extraItem.price_cents,
    });
    setExtraTargetIdx(0);
    setExtrasModalOpen(true);
  }

  function closeExtrasModal() {
    setExtrasModalOpen(false);
    setPendingExtra(null);
    setExtraTargetIdx(null);
  }

  function confirmAddExtra() {
    if (!pendingExtra) return;
    const idx = typeof extraTargetIdx === "number" ? extraTargetIdx : null;
    if (idx === null || idx < 0 || idx >= cart.length) {
      setErr("Please choose which item this extra is for.");
      return;
    }

    addExtraToParent(idx, { id: pendingExtra.id, name: pendingExtra.name, price_cents: pendingExtra.price_cents });
    closeExtrasModal();
  }

  function addToCart(item) {
    if (isExtrasItem(item)) openExtrasModal(item);
    else addMainToCart(item);
  }

  function decLine(i) {
    setCart((prev) => {
      const copy = prev.map(ensureLineExtras);
      copy[i] = { ...copy[i], qty: copy[i].qty - 1 };
      if (copy[i].qty <= 0) copy.splice(i, 1);
      return copy;
    });
  }

  function incLine(i) {
    setCart((prev) => {
      const copy = prev.map(ensureLineExtras);
      copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
      return copy;
    });
  }

  function setNote(i, note) {
    setCart((prev) => {
      const copy = prev.map(ensureLineExtras);
      copy[i] = { ...copy[i], item_notes: note };
      return copy;
    });
  }

  function decExtra(parentIdx, exIdx) {
    setCart((prev) => {
      const next = prev.map(ensureLineExtras);
      const parent = next[parentIdx];
      const extras = [...(parent.extras || [])];

      extras[exIdx] = { ...extras[exIdx], qty: extras[exIdx].qty - 1 };
      if (extras[exIdx].qty <= 0) extras.splice(exIdx, 1);

      next[parentIdx] = { ...parent, extras };
      return next;
    });
  }

  function incExtra(parentIdx, exIdx) {
    setCart((prev) => {
      const next = prev.map(ensureLineExtras);
      const parent = next[parentIdx];
      const extras = [...(parent.extras || [])];

      extras[exIdx] = { ...extras[exIdx], qty: extras[exIdx].qty + 1 };

      next[parentIdx] = { ...parent, extras };
      return next;
    });
  }

  async function placeOrder() {
    setErr("");
    setMsg("");

    if (!name.trim()) return setErr("Please enter your name.");
    if (cart.length === 0) return setErr("Your cart is empty.");

    // ✅ Flatten payload: extras become regular items with note "EXTRA FOR: <parent name>"
    const payloadItems = [];
    for (const line of cart.map(ensureLineExtras)) {
      payloadItems.push({
        menu_item_id: line.menu_item_id,
        qty: line.qty,
        item_notes: line.item_notes || "",
      });

      for (const ex of line.extras || []) {
        payloadItems.push({
          menu_item_id: ex.menu_item_id,
          qty: ex.qty,
          item_notes: `EXTRA FOR: ${line.name}`,
        });
      }
    }

    setIsPlacing(true);
    const { data, error } = await supabase.rpc("place_order", {
      // this will work once you drop the text overload
      p_order_type: orderType,
      p_customer_name: name.trim(),
      p_items: payloadItems,
    });
    setIsPlacing(false);

    if (error) return setErr(error.message);

    const row = Array.isArray(data) ? data[0] : data;

    const saved = {
      order_id: row.order_id,
      guest_order_token: row.guest_order_token,
      order_number: row.order_number,
    };

    localStorage.setItem("club_last_order", JSON.stringify(saved));
    setActiveOrder(saved);

    lastReadyOrderIdRef.current = null;

    setCart([]);
    setMsg(`Order sent! Your order number is #${row.order_number}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startNewOrder() {
    localStorage.removeItem("club_last_order");
    setActiveOrder(null);
    setOrderData(null);
    setCart([]);
    setMsg("");
    setErr("");
    setSearch("");
    lastReadyOrderIdRef.current = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadMenu();
  }

  function toggleCategory(cat) {
    setExpandedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  const orderTypeLabel = orderData?.order?.order_type
    ? orderData.order.order_type === "collection"
      ? "Collection"
      : "Dine-in"
    : orderType === "collection"
    ? "Collection"
    : "Dine-in";

  const MenuBlock = (
    <div>
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 14,
          background: "white",
          boxShadow: "0 10px 25px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Menu</h2>
            <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>Tap an item to add it to your cart.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ddd",
                fontWeight: 700,
                background: "white",
              }}
            >
              <option value="dine_in">Dine-in</option>
              <option value="collection">Collection</option>
            </select>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (required)"
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ddd",
                width: 240,
              }}
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ddd",
                width: 200,
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {isMenuLoading ? <div style={{ color: "#666" }}>Loading menu…</div> : null}
          {!isMenuLoading && !err && menu.length === 0 ? <div style={{ color: "#777" }}>Menu is empty.</div> : null}
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          {filteredGrouped.map(([cat, list]) => {
            const expanded = expandedCats[cat] ?? true;
            const isExtras = catLower(cat) === EXTRAS_CATEGORY_LOWER;

            return (
              <div key={cat} style={{ borderTop: "1px solid #f1f1f1", paddingTop: 10 }}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    {cat}{" "}
                    {isExtras ? (
                      <span style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>(extras)</span>
                    ) : null}
                  </h3>
                  <span style={{ color: "#666", fontSize: 12 }}>
                    {expanded ? "Hide" : "Show"} • {list.length}
                  </span>
                </button>

                {expanded && (
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {list.map((it) => (
                      <button
                        type="button"
                        key={it.id}
                        onClick={() => addToCart(it)}
                        style={{
                          textAlign: "left",
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid #eee",
                          background: "white",
                          cursor: "pointer",
                          boxShadow: "0 6px 14px rgba(0,0,0,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{it.name}</div>
                            {it.description ? <div style={{ color: "#666", fontSize: 13 }}>{it.description}</div> : null}
                          </div>

                          <div style={{ fontWeight: 900 }}>{money(it.price_cents)}</div>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ color: isExtras ? "#7c3aed" : "#2563eb", fontSize: 12, fontWeight: 800 }}>
                            {isExtras ? "Tap to attach extra" : "Tap to add"}
                          </div>
                          <div
                            style={{
                              padding: "5px 10px",
                              borderRadius: 999,
                              background: isExtras ? "#f5f3ff" : "#eff6ff",
                              border: isExtras ? "1px solid #e9d5ff" : "1px solid #dbeafe",
                              fontSize: 12,
                              fontWeight: 900,
                              color: isExtras ? "#6d28d9" : "#1d4ed8",
                            }}
                          >
                            + Add
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!err && !isMenuLoading && filteredGrouped.length === 0 && (
            <div style={{ color: "#777" }}>No menu items match your search.</div>
          )}
        </div>
      </div>
    </div>
  );

  const CartBlock = (
    // ✅ anchor for scrolling
    <div ref={cartTopRef}>
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 16,
          padding: 14,
          position: isMobile ? "static" : "sticky",
          top: isMobile ? "auto" : 12,
          background: "white",
          boxShadow: "0 10px 25px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Cart</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                initSound(); // user gesture
                const next = !soundOn;
                setSoundOn(next);
                localStorage.setItem("patron_sound", next ? "1" : "0");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: soundOn ? "#111" : "white",
                color: soundOn ? "white" : "#111",
                fontWeight: 900,
                cursor: "pointer",
              }}
              title="Enable sound alert when READY"
            >
              {soundOn ? "Sound: ON" : "Sound: OFF"}
            </button>

            <div style={{ color: "#666", fontSize: 13 }}>
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {cart.length === 0 ? (
          <div style={{ marginTop: 10, color: "#666" }}>Tap menu items to add them.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {cart.map((x, i) => (
              <div key={`${x.menu_item_id}-${i}`} style={{ border: "1px solid #f0f0f0", borderRadius: 14, padding: 10, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{x.name}</div>
                  <div style={{ fontWeight: 900 }}>{money(x.price_cents * x.qty)}</div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => decLine(i)}
                      style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 900 }}
                      aria-label="decrease"
                    >
                      −
                    </button>
                    <b>{x.qty}</b>
                    <button
                      type="button"
                      onClick={() => incLine(i)}
                      style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 900 }}
                      aria-label="increase"
                    >
                      +
                    </button>
                  </div>
                  <div style={{ color: "#666", fontSize: 12 }}>{money(x.price_cents)} each</div>
                </div>

                <input
                  value={x.item_notes}
                  onChange={(e) => setNote(i, e.target.value)}
                  placeholder="Notes (optional) e.g. no onion"
                  style={{ marginTop: 8, width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd", background: "white" }}
                />

                {Array.isArray(x.extras) && x.extras.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px dashed #ddd", paddingTop: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                      Extras for {x.name}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {x.extras.map((ex, exIdx) => (
                        <div key={`${ex.menu_item_id}-${exIdx}`} style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900 }}>{ex.name}</div>
                            <div style={{ fontWeight: 900 }}>{money(ex.price_cents * ex.qty)}</div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <button
                                type="button"
                                onClick={() => decExtra(i, exIdx)}
                                style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 900 }}
                                aria-label="decrease extra"
                              >
                                −
                              </button>
                              <b>{ex.qty}</b>
                              <button
                                type="button"
                                onClick={() => incExtra(i, exIdx)}
                                style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 900 }}
                                aria-label="increase extra"
                              >
                                +
                              </button>
                            </div>
                            <div style={{ color: "#666", fontSize: 12 }}>{money(ex.price_cents)} each</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid #eee", marginTop: 14, paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>Total</b>
            <b>{money(cartTotal)}</b>
          </div>

          <button
            type="button"
            onClick={placeOrder}
            disabled={cart.length === 0 || isPlacing}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "none",
              background: cart.length === 0 || isPlacing ? "#cbd5e1" : "#2563eb",
              color: "white",
              fontWeight: 900,
              cursor: cart.length === 0 || isPlacing ? "not-allowed" : "pointer",
              boxShadow: "0 12px 22px rgba(37, 99, 235, 0.22)",
            }}
          >
            {isPlacing ? "Placing…" : "Place Order"}
          </button>

          <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
            You’ll receive an order number and collect at the kitchen when <b>READY</b>.
          </div>

          {activeOrder?.order_id && (
            <button
              type="button"
              onClick={startNewOrder}
              style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 14, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
            >
              Start a new order
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 980, margin: "0 auto" }}>
      {/* HERO HEADER */}
      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background: "linear-gradient(135deg, #0b1220 0%, #111827 50%, #0b1220 100%)",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img
            src="/clubhouse-logo.png"
            alt="Clubhouse Kitchen"
            style={{
              height: 56,
              width: 56,
              objectFit: "cover",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
            }}
          />
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>Clubhouse Kitchen</div>
            <div style={{ opacity: 0.85, marginTop: 3 }}>
              Order, get a number, collect at the kitchen when <b>READY</b>.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {staffRole && (
            <button
              type="button"
              onClick={() => nav(staffRole === "kitchen" ? "/kitchen" : "/waiter")}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ← Back to {staffRole === "kitchen" ? "Kitchen" : "Waiter"}
            </button>
          )}

          <div style={{ ...statusPillStyle(status), ...(isReady ? { background: "rgba(34,197,94,0.35)", borderColor: "rgba(34,197,94,0.55)" } : {}) }}>
            {status ? `STATUS: ${normalizeStatus(status)}` : "STATUS: —"}
          </div>

          <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800 }}>
            {orderNumber ? (
              <>
                Order <span style={{ fontWeight: 950 }}>#{orderNumber}</span>
              </>
            ) : (
              "New order"
            )}
          </div>
        </div>
      </div>

      {err && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 12, marginTop: 12, border: "1px solid #fecaca" }}>
          <b>Error:</b> {err}
        </div>
      )}
      {msg && (
        <div style={{ background: "#e7f6e7", padding: 12, borderRadius: 12, marginTop: 12, border: "1px solid #bbf7d0" }}>
          {msg}
        </div>
      )}

      {hasTrackedOrder && (
        <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 16, padding: 14, background: isReady ? "#ecfdf5" : "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                Order #{orderData.order.order_number} • {orderTypeLabel}
              </div>
              <div style={{ marginTop: 6, fontSize: 22 }}>
                Status: <b>{normalizeStatus(status)}</b>
              </div>
              <div style={{ marginTop: 6, color: "#666" }}>
                Name: <b>{orderData.order.customer_name}</b>
              </div>

              {isReady && (
                <div style={readyBannerStyle()}>
                  <div style={{ fontSize: 12, letterSpacing: 1.2, fontWeight: 900, opacity: 0.95 }}>READY FOR COLLECTION</div>
                  <div style={{ marginTop: 8, fontSize: 34, fontWeight: 950, lineHeight: 1 }}>#{orderData.order.order_number}</div>
                  <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>Please collect at the kitchen now ✅</div>
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                    Name: <b>{orderData.order.customer_name}</b>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={startNewOrder}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 800, cursor: "pointer" }}
            >
              Start a new order
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr", gap: 16, marginTop: 16 }}>
        {isMobile ? (
          <>
            {CartBlock}
            {MenuBlock}
          </>
        ) : (
          <>
            {MenuBlock}
            {CartBlock}
          </>
        )}
      </div>

      <div style={{ marginTop: 16, color: "#777", fontSize: 12 }}>
        Tip: Turn Sound ON (in the cart) to hear a ding when your order becomes READY.
      </div>

      {/* ✅ Floating Cart shortcut */}
      <button
        type="button"
        onClick={() => {
          cartTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "white",
          boxShadow: "0 14px 30px rgba(0,0,0,0.18)",
          fontWeight: 900,
          cursor: "pointer",
        }}
        aria-label="Go to cart"
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🛒</span>
        <span>Cart</span>
        {cart.length > 0 ? (
          <span
            style={{
              marginLeft: 2,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#111827",
              color: "white",
              fontSize: 12,
              fontWeight: 950,
            }}
          >
            {cart.length}
          </span>
        ) : null}
      </button>

      {/* ✅ “Add extras?” picker modal (after adding main item) */}
      {extrasPickerOpen && typeof extrasPickerParentIdx === "number" && cart[extrasPickerParentIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeExtrasPicker}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 640,
              background: "white",
              borderRadius: 16,
              border: "1px solid #eee",
              boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
              <div style={{ fontSize: 16, fontWeight: 950 }}>Add Extras?</div>
              <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
                Select extras for <b>{cart[extrasPickerParentIdx].name}</b>
              </div>
            </div>

            <div style={{ padding: 14 }}>
              {extrasItems.length === 0 ? (
                <div style={{ color: "#666" }}>No extras found on the menu.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {extrasItems.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => addExtraToParent(extrasPickerParentIdx, ex)}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid #eee",
                        background: "#fafafa",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        fontWeight: 900,
                      }}
                    >
                      <span>{ex.name}</span>
                      <span>{money(ex.price_cents)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
                Tip: You can also add/remove extras later in the cart.
              </div>
            </div>

            <div style={{ padding: 14, borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeExtrasPicker}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Existing “choose which item this extra is for” modal (when tapping an extra item directly) */}
      {extrasModalOpen && pendingExtra && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeExtrasModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "white",
              borderRadius: 16,
              border: "1px solid #eee",
              boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
              <div style={{ fontSize: 16, fontWeight: 950 }}>Add Extra</div>
              <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>Choose which item this extra is for.</div>
            </div>

            <div style={{ padding: 14 }}>
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fafafa" }}>
                <div style={{ fontWeight: 950 }}>{pendingExtra.name}</div>
                <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>{money(pendingExtra.price_cents)}</div>
              </div>

              <div style={{ marginTop: 12, fontWeight: 900, fontSize: 13 }}>Select parent item:</div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {cart.map((line, idx) => (
                  <button
                    key={`${line.menu_item_id}-${idx}`}
                    type="button"
                    onClick={() => setExtraTargetIdx(idx)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid #e5e5e5",
                      background: extraTargetIdx === idx ? "#111" : "white",
                      color: extraTargetIdx === idx ? "white" : "#111",
                      cursor: "pointer",
                      fontWeight: 900,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      {line.name} <span style={{ opacity: 0.75, fontWeight: 800 }}>(x{line.qty})</span>
                    </span>
                    <span style={{ opacity: 0.75, fontWeight: 800 }}>{extraTargetIdx === idx ? "Selected" : "Select"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: 14, borderTop: "1px solid #eee", display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={closeExtrasModal}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmAddExtra}
                style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "#2563eb", color: "white", fontWeight: 950, cursor: "pointer" }}
              >
                Add to selected item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
