// src/pages/AdminPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient"; // <-- adjust if your path differs

// Menu “sections” in your DB are just menu_items.category (text)
export default function AdminPage() {
  const nav = useNavigate();

  // Data
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI filters
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Messages
  const [msg, setMsg] = useState({ type: "info", text: "" }); // type: info | error | success

  // Category tools
  const [newCategory, setNewCategory] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");

  // Create/Edit form
  const emptyForm = {
    id: null,
    name: "",
    description: "",
    category: "",
    price: "", // in rands (or your currency), user-friendly
    is_available: true,
    sort_order: 0,
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ---------- Helpers ----------
  const categories = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it.category && String(it.category).trim()) set.add(String(it.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      const catOk = categoryFilter === "ALL" ? true : String(it.category || "") === categoryFilter;
      const sOk =
        !s ||
        String(it.name || "").toLowerCase().includes(s) ||
        String(it.description || "").toLowerCase().includes(s) ||
        String(it.category || "").toLowerCase().includes(s);
      return catOk && sOk;
    });
  }, [items, categoryFilter, search]);

  function centsToDisplay(price_cents) {
    const n = Number(price_cents || 0);
    return (n / 100).toFixed(2);
  }

  function displayToCents(val) {
    const v = String(val || "").trim().replace(",", ".");
    if (!v) return 0;
    const num = Number(v);
    if (Number.isNaN(num)) return null;
    return Math.round(num * 100);
  }

  function setError(text) {
    setMsg({ type: "error", text });
  }
  function setSuccess(text) {
    setMsg({ type: "success", text });
  }
  function clearMsg() {
    setMsg({ type: "info", text: "" });
  }

  // ---------- Load ----------
  async function loadMenu() {
    setLoading(true);
    clearMsg();

    const { data, error } = await supabase
      .from("menu_items")
      .select("id,name,description,category,price_cents,is_available,sort_order")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setError(`Failed to load menu_items: ${error.message}`);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- CRUD ----------
  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    clearMsg();

    const name = form.name.trim();
    if (!name) {
      setSaving(false);
      setError("Name is required.");
      return;
    }

    const category = String(form.category || "").trim();
    if (!category) {
      setSaving(false);
      setError("Category (section) is required.");
      return;
    }

    const cents = displayToCents(form.price);
    if (cents === null || cents < 0) {
      setSaving(false);
      setError("Price must be a valid number (e.g. 12.50).");
      return;
    }

    const payload = {
      name,
      description: String(form.description || "").trim() || null,
      category,
      price_cents: cents,
      is_available: !!form.is_available,
      sort_order: Number.isFinite(Number(form.sort_order)) ? Number(form.sort_order) : 0,
    };

    let res;
    if (form.id) {
      res = await supabase.from("menu_items").update(payload).eq("id", form.id).select("id").single();
    } else {
      res = await supabase.from("menu_items").insert(payload).select("id").single();
    }

    const { error } = res || {};
    if (error) {
      setSaving(false);
      setError(`Save failed: ${error.message}`);
      return;
    }

    setSaving(false);
    setSuccess(form.id ? "Item updated." : "Item added.");
    setForm(emptyForm);
    await loadMenu();
  }

  function startEdit(it) {
    clearMsg();
    setForm({
      id: it.id,
      name: it.name || "",
      description: it.description || "",
      category: it.category || "",
      price: centsToDisplay(it.price_cents),
      is_available: !!it.is_available,
      sort_order: it.sort_order ?? 0,
    });
    if (it.category) setCategoryFilter(String(it.category));
  }

  function cancelEdit() {
    clearMsg();
    setForm(emptyForm);
  }

  async function deleteItem(it) {
    clearMsg();
    const ok = window.confirm(`Delete "${it.name}"? This cannot be undone.`);
    if (!ok) return;

    const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
    if (error) {
      setError(`Delete failed: ${error.message}`);
      return;
    }
    setSuccess("Item deleted.");
    await loadMenu();
  }

  // ---------- Availability toggle (slider style) ----------
  async function toggleAvailability(it) {
    clearMsg();

    const next = !it.is_available;

    // Optimistic UI update
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_available: next } : x)));

    const { error } = await supabase.from("menu_items").update({ is_available: next }).eq("id", it.id);

    if (error) {
      // revert if failed
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_available: it.is_available } : x)));
      setError(`Availability update failed: ${error.message}`);
      return;
    }

    setSuccess(`"${it.name}" is now ${next ? "Available" : "Out of stock"}.`);
  }

  // ---------- Category tools ----------
  async function addCategory() {
    clearMsg();
    const cat = newCategory.trim();
    if (!cat) return setError("Enter a category name to add.");

    setForm((f) => ({ ...f, category: cat }));
    setNewCategory("");
    setSuccess(`Category "${cat}" ready. Now add an item to make it appear in the menu.`);
  }

  async function renameCategory() {
    clearMsg();
    const from = renameFrom.trim();
    const to = renameTo.trim();

    if (!from || !to) return setError("Select 'from' and enter 'to' category.");
    if (from === to) return setError("New category must be different.");

    const ok = window.confirm(`Rename category "${from}" → "${to}"?\nThis updates ALL items in that category.`);
    if (!ok) return;

    const { error } = await supabase.from("menu_items").update({ category: to }).eq("category", from);
    if (error) {
      setError(`Rename failed: ${error.message}`);
      return;
    }
    setSuccess("Category renamed.");
    setRenameFrom("");
    setRenameTo("");
    await loadMenu();
  }

  async function deleteCategoryIfEmpty() {
    clearMsg();
    const cat = renameFrom.trim();
    if (!cat) return setError("Pick a category in the Rename 'from' box to delete.");

    const count = items.filter((i) => String(i.category || "") === cat).length;
    if (count > 0) {
      setError(`Can't delete "${cat}" because it still has ${count} item(s). Delete or move the items first.`);
      return;
    }

    setSuccess(`"${cat}" is already empty (categories only exist when items exist).`);
  }

  // ---------- Small UI component: slider switch ----------
  function AvailabilitySwitch({ checked, onChange, labelOn = "Available", labelOff = "Out of stock" }) {
    return (
      <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        title={checked ? labelOn : labelOff}
        style={{
          border: "1px solid #ddd",
          background: "white",
          borderRadius: 999,
          padding: 4,
          width: 54,
          height: 28,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: checked ? "flex-end" : "flex-start",
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: checked ? "#22c55e" : "#ef4444",
            display: "inline-block",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            transition: "transform 150ms ease",
          }}
        />
      </button>
    );
  }

  // ---------- UI ----------
  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto", textAlign: "left" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ color: "#666", marginTop: 4 }}>Menu management (items + categories/sections)</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={loadMenu}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => nav(-1)}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Back
          </button>
        </div>
      </div>

      {/* Message */}
      {msg.text ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #eee",
            background: msg.type === "error" ? "#ffecec" : msg.type === "success" ? "#eefbf1" : "#f6f6f6",
            color: msg.type === "error" ? "#a40000" : msg.type === "success" ? "#0a6b2b" : "#333",
          }}
        >
          {msg.text}
        </div>
      ) : null}

      {/* Top controls */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Filters */}
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Browse</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
              >
                <option value="ALL">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="name / description / category"
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
            Showing <b>{filteredItems.length}</b> of <b>{items.length}</b> items
          </div>
        </div>

        {/* Category tools */}
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Categories (Sections)</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 12, color: "#666" }}>New category name</span>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder='e.g. "Burgers"'
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>
            <button
              type="button"
              onClick={addCategory}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
            >
              Use in form
            </button>
          </div>

          <div style={{ height: 10 }} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, minWidth: 220 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Rename from</span>
              <select
                value={renameFrom}
                onChange={(e) => setRenameFrom(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Rename to</span>
              <input
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                placeholder='e.g. "Mains"'
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <button
              type="button"
              onClick={renameCategory}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
            >
              Rename
            </button>

            <button
              type="button"
              onClick={deleteCategoryIfEmpty}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #f0c7c7",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
              title="Categories only exist when items exist. This checks emptiness."
            >
              Delete (if empty)
            </button>
          </div>

          <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
            Note: categories are derived from <code>menu_items.category</code>. A category “exists” only if at least one item uses it.
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        {/* Items table */}
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Menu Items</div>
            {loading ? <div style={{ color: "#666" }}>Loading…</div> : null}
          </div>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "8px 6px" }}>Name</th>
                  <th style={{ padding: "8px 6px" }}>Category</th>
                  <th style={{ padding: "8px 6px" }}>Price</th>
                  <th style={{ padding: "8px 6px" }}>Availability</th>
                  <th style={{ padding: "8px 6px" }}>Sort</th>
                  <th style={{ padding: "8px 6px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 10, color: "#666" }}>
                      No items match your filters.
                    </td>
                  </tr>
                ) : null}

                {filteredItems.map((it) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                    <td style={{ padding: "8px 6px" }}>
                      <div style={{ fontWeight: 800 }}>{it.name}</div>
                      {it.description ? <div style={{ color: "#666", fontSize: 12 }}>{it.description}</div> : null}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{it.category}</td>
                    <td style={{ padding: "8px 6px" }}>{centsToDisplay(it.price_cents)}</td>
                    <td style={{ padding: "8px 6px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <AvailabilitySwitch checked={!!it.is_available} onChange={() => toggleAvailability(it)} />
                        <span style={{ fontSize: 12, fontWeight: 900, color: it.is_available ? "#0a6b2b" : "#a40000" }}>
                          {it.is_available ? "Available" : "Out of stock"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 6px" }}>{it.sort_order ?? 0}</td>
                    <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => startEdit(it)}
                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(it)}
                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #f0c7c7", background: "white", fontWeight: 900, cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>{form.id ? "Edit Item" : "Add Item"}</div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Category (Section)</span>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                list="category-list"
                placeholder='e.g. "Starters"'
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
              <datalist id="category-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>Price (e.g. 12.50)</span>
              <input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
                style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!form.is_available}
                  onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
                />
                <span style={{ fontSize: 12, color: "#666" }}>Available</span>
              </label>

              <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                <input
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  inputMode="numeric"
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  fontWeight: 900,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  flex: 1,
                }}
              >
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Item"}
              </button>

              {form.id ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    fontWeight: 900,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 4, color: "#666", fontSize: 12 }}>
              Tip: You can mark an item out of stock using the slider in the list.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}