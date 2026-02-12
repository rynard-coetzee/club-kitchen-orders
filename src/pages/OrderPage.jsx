// src/pages/OrderPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

export default function OrderPage() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]); // [{menu_item_id, name, price_cents, qty, item_notes}]
  const [name, setName] = useState("");
  const [orderType, setOrderType] = useState("dine_in"); // dine_in | collection

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);

  // status tracking (saved per device)
  const [activeOrder, setActiveOrder] = useState(null); // {order_id, guest_order_token, order_number}
  const [orderData, setOrderData] = useState(null);

  // UI helpers
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState({}); // {cat: boolean}

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

  const cartTotal = useMemo(
    () => cart.reduce((sum, x) => sum + x.price_cents * x.qty, 0),
    [cart]
  );

  // Load menu
  useEffect(() => {
    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("menu_items")
        .select("id,name,description,price_cents,category,sort_order,is_available")
        .eq("is_available", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) return setErr(error.message);
      setMenu(data || []);
    })();
  }, []);

  // Load last order from localStorage (so patron can refresh and still track it)
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

  // Poll order status
  useEffect(() => {
    if (!activeOrder?.order_id || !activeOrder?.guest_order_token) return;

    let cancelled = false;

    const fetchStatus = async () => {
      const { data, error } = await supabase.rpc("get_order_for_guest", {
        p_order_id: activeOrder.order_id,
        p_guest_token: activeOrder.guest_order_token,
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
  const orderNumber =
    orderData?.order?.order_number ?? activeOrder?.order_number ?? null;

  const isReady = String(status || "").toLowerCase() === "ready";
  const hasTrackedOrder = Boolean(orderData?.order);

  // Vibrate strongly on READY (mobile-friendly)
  useEffect(() => {
    if (!status) return;
    if (String(status).toLowerCase() !== "ready") return;

    try {
      if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 250, 80, 300]);
    } catch {
      // ignore
    }
  }, [status]);

  function addToCart(item) {
    setCart((prev) => {
      const idx = prev.findIndex(
        (x) => x.menu_item_id === item.id && (x.item_notes || "") === ""
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price_cents: item.price_cents,
          qty: 1,
          item_notes: "",
        },
      ];
    });
  }

  function decLine(i) {
    setCart((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], qty: copy[i].qty - 1 };
      if (copy[i].qty <= 0) copy.splice(i, 1);
      return copy;
    });
  }

  function incLine(i) {
    setCart((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
      return copy;
    });
  }

  function setNote(i, note) {
    setCart((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], item_notes: note };
      return copy;
    });
  }

  async function placeOrder() {
    setErr("");
    setMsg("");

    if (!name.trim()) return setErr("Please enter your name.");
    if (cart.length === 0) return setErr("Your cart is empty.");

    const payloadItems = cart.map((x) => ({
      menu_item_id: x.menu_item_id,
      qty: x.qty,
      item_notes: x.item_notes || "",
    }));

    setIsPlacing(true);
    const { data, error } = await supabase.rpc("place_order", {
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

    setCart([]);
    setMsg(`Order sent! Your order number is #${row.order_number}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNewOrder() {
    localStorage.removeItem("club_last_order");
    setActiveOrder(null);
    setOrderData(null);
    setCart([]);
    setMsg("");
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  return (
    <div
      style={{
        fontFamily: "Arial",
        padding: 16,
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      {/* HERO HEADER */}
      <div
        style={{
          borderRadius: 18,
          padding: 16,
          background:
            "linear-gradient(135deg, #0b1220 0%, #111827 50%, #0b1220 100%)",
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
          {/* Put logo in: public/clubhouse-logo.png */}
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
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>
              Clubhouse Kitchen
            </div>
            <div style={{ opacity: 0.85, marginTop: 3 }}>
              Order, get a number, collect at the counter when{" "}
              <b>READY</b>.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              ...statusPillStyle(status),
              ...(isReady
                ? {
                    background: "rgba(34,197,94,0.35)",
                    borderColor: "rgba(34,197,94,0.55)",
                  }
                : {}),
            }}
          >
            {status ? `STATUS: ${normalizeStatus(status)}` : "STATUS: —"}
          </div>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontWeight: 800,
            }}
          >
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

      {/* Messages */}
      {err && (
        <div
          style={{
            background: "#ffe5e5",
            padding: 12,
            borderRadius: 12,
            marginTop: 12,
            border: "1px solid #fecaca",
          }}
        >
          <b>Error:</b> {err}
        </div>
      )}
      {msg && (
        <div
          style={{
            background: "#e7f6e7",
            padding: 12,
            borderRadius: 12,
            marginTop: 12,
            border: "1px solid #bbf7d0",
          }}
        >
          {msg}
        </div>
      )}

      {/* Current tracked order status */}
      {hasTrackedOrder && (
        <div
          style={{
            marginTop: 14,
            border: "1px solid #eee",
            borderRadius: 16,
            padding: 14,
            background: isReady ? "#ecfdf5" : "white",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
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

              {/* BIG READY BANNER */}
              {isReady && (
                <div style={readyBannerStyle()}>
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.2,
                      fontWeight: 900,
                      opacity: 0.95,
                    }}
                  >
                    READY FOR COLLECTION
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 34,
                      fontWeight: 950,
                      lineHeight: 1,
                    }}
                  >
                    #{orderData.order.order_number}
                  </div>

                  <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
                    Please collect at the counter now ✅
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                    Name: <b>{orderData.order.customer_name}</b>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={startNewOrder}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Start a new order
            </button>
          </div>
        </div>
      )}

      {/* Inputs + Cart */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* MENU */}
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
                <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                  Tap an item to add it to your cart.
                </div>
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

            <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
              {filteredGrouped.map(([cat, list]) => {
                const expanded = expandedCats[cat] ?? true; // default open
                return (
                  <div
                    key={cat}
                    style={{
                      borderTop: "1px solid #f1f1f1",
                      paddingTop: 10,
                    }}
                  >
                    <button
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
                      <h3 style={{ margin: 0 }}>{cat}</h3>
                      <span style={{ color: "#666", fontSize: 12 }}>
                        {expanded ? "Hide" : "Show"} • {list.length}
                      </span>
                    </button>

                    {expanded && (
                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        {list.map((it) => (
                          <button
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
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "flex-start",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 900 }}>{it.name}</div>
                                {it.description ? (
                                  <div style={{ color: "#666", fontSize: 13 }}>
                                    {it.description}
                                  </div>
                                ) : null}
                              </div>

                              <div style={{ fontWeight: 900 }}>
                                {money(it.price_cents)}
                              </div>
                            </div>

                            <div
                              style={{
                                marginTop: 8,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  color: "#2563eb",
                                  fontSize: 12,
                                  fontWeight: 800,
                                }}
                              >
                                Tap to add
                              </div>
                              <div
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: 999,
                                  background: "#eff6ff",
                                  border: "1px solid #dbeafe",
                                  fontSize: 12,
                                  fontWeight: 900,
                                  color: "#1d4ed8",
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

              {!err && filteredGrouped.length === 0 && (
                <div style={{ color: "#777" }}>
                  No menu items match your search.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CART */}
        <div>
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 16,
              padding: 14,
              position: "sticky",
              top: 12,
              background: "white",
              boxShadow: "0 10px 25px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "baseline",
              }}
            >
              <h2 style={{ margin: 0 }}>Cart</h2>
              <div style={{ color: "#666", fontSize: 13 }}>
                {cart.length} item{cart.length === 1 ? "" : "s"}
              </div>
            </div>

            {cart.length === 0 ? (
              <div style={{ marginTop: 10, color: "#666" }}>
                Tap menu items to add them.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {cart.map((x, i) => (
                  <div
                    key={`${x.menu_item_id}-${i}`}
                    style={{
                      border: "1px solid #f0f0f0",
                      borderRadius: 14,
                      padding: 10,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{x.name}</div>
                      <div style={{ fontWeight: 900 }}>
                        {money(x.price_cents * x.qty)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 8,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          onClick={() => decLine(i)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                          aria-label="decrease"
                        >
                          −
                        </button>
                        <b>{x.qty}</b>
                        <button
                          onClick={() => incLine(i)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 12,
                            border: "1px solid #ddd",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                          aria-label="increase"
                        >
                          +
                        </button>
                      </div>
                      <div style={{ color: "#666", fontSize: 12 }}>
                        {money(x.price_cents)} each
                      </div>
                    </div>

                    <input
                      value={x.item_notes}
                      onChange={(e) => setNote(i, e.target.value)}
                      placeholder="Notes (optional) e.g. no onion"
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "white",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                borderTop: "1px solid #eee",
                marginTop: 14,
                paddingTop: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b>Total</b>
                <b>{money(cartTotal)}</b>
              </div>

              <button
                onClick={placeOrder}
                disabled={cart.length === 0 || isPlacing}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "none",
                  background:
                    cart.length === 0 || isPlacing ? "#cbd5e1" : "#2563eb",
                  color: "white",
                  fontWeight: 900,
                  cursor:
                    cart.length === 0 || isPlacing ? "not-allowed" : "pointer",
                  boxShadow: "0 12px 22px rgba(37, 99, 235, 0.22)",
                }}
              >
                {isPlacing ? "Placing…" : "Place Order"}
              </button>

              <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
                You’ll receive an order number and collect at the counter when{" "}
                <b>READY</b>.
              </div>

              {activeOrder?.order_id && (
                <button
                  onClick={startNewOrder}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 14,
                    border: "1px solid #ddd",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Start a new order
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Show items for tracked order */}
      {orderData?.items?.length ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #eee",
            borderRadius: 16,
            padding: 14,
            background: "white",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Your items</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {orderData.items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <b>{it.qty}×</b> {it.name}
                  {it.item_notes ? (
                    <div style={{ color: "#666", fontSize: 12 }}>
                      Note: {it.item_notes}
                    </div>
                  ) : null}
                </div>
                <div style={{ color: "#666" }}>
                  {money(it.unit_price_cents * it.qty)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 16, color: "#777", fontSize: 12 }}>
        Tip: If you refresh the page, your last order stays visible on this device.
      </div>
    </div>
  );
}
