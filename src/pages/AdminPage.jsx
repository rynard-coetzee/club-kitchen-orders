// src/pages/AdminPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AdminPage() {
  const nav = useNavigate();

  // ---------- Tabs ----------
  const [tab, setTab] = useState("menu"); // "menu" | "modifiers" | "assign"

  // ---------- Toast/messages ----------
  const [msg, setMsg] = useState({ type: "info", text: "" }); // info | error | success
  const setError = (text) => setMsg({ type: "error", text });
  const setSuccess = (text) => setMsg({ type: "success", text });
  const clearMsg = () => setMsg({ type: "info", text: "" });

  // ---------- Helpers ----------
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

  // ============================================================
  // MENU TAB (menu_items)
  // ============================================================
  const makeEmptyMenuForm = () => ({
    id: null,
    name: "",
    description: "",
    category: "",
    price: "",
    is_available: true,
    sort_order: 0,
  });

  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [menuForm, setMenuForm] = useState(() => makeEmptyMenuForm());
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuEditingId, setMenuEditingId] = useState(null);

  const menuCategories = useMemo(() => {
    const set = new Set();
    for (const it of menuItems) {
      if (it.category && String(it.category).trim()) set.add(String(it.category));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return menuItems.filter((it) => {
      const catOk = categoryFilter === "ALL" ? true : String(it.category || "") === categoryFilter;
      const sOk =
        !s ||
        String(it.name || "").toLowerCase().includes(s) ||
        String(it.description || "").toLowerCase().includes(s) ||
        String(it.category || "").toLowerCase().includes(s);
      return catOk && sOk;
    });
  }, [menuItems, categoryFilter, search]);

  async function loadMenu() {
    setMenuLoading(true);
    const { data, error } = await supabase
      .from("menu_items")
      .select("id,name,description,category,price_cents,is_available,sort_order")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setMenuItems([]);
      setMenuLoading(false);
      setError(`Failed to load menu_items: ${error.message}`);
      return;
    }
    setMenuItems(data || []);
    setMenuLoading(false);
  }

  async function saveMenuItem(e) {
    e.preventDefault();
    setMenuSaving(true);
    clearMsg();

    const name = menuForm.name.trim();
    if (!name) {
      setMenuSaving(false);
      setError("Name is required.");
      return;
    }

    const category = String(menuForm.category || "").trim();
    if (!category) {
      setMenuSaving(false);
      setError("Category (section) is required.");
      return;
    }

    const cents = displayToCents(menuForm.price);
    if (cents === null || cents < 0) {
      setMenuSaving(false);
      setError("Price must be a valid number (e.g. 12.50).");
      return;
    }

    const payload = {
      name,
      description: String(menuForm.description || "").trim() || null,
      category,
      price_cents: cents,
      is_available: !!menuForm.is_available,
      sort_order: Number.isFinite(Number(menuForm.sort_order)) ? Number(menuForm.sort_order) : 0,
    };

    let res;
    if (menuEditingId) {
      res = await supabase.from("menu_items").update(payload).eq("id", menuEditingId).select("id").single();
    } else {
      res = await supabase.from("menu_items").insert(payload).select("id").single();
    }

    if (res?.error) {
      setMenuSaving(false);
      setError(`Save failed: ${res.error.message}`);
      return;
    }

    setMenuSaving(false);
    setSuccess(menuEditingId ? "Item updated." : "Item added.");
    setMenuEditingId(null);
    setMenuForm(makeEmptyMenuForm());
    await loadMenu();
  }

  function startEditMenuItem(it) {
    clearMsg();
    setMenuEditingId(it.id);
    setMenuForm({
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

  function cancelEditMenuItem() {
    clearMsg();
    setMenuEditingId(null);
    setMenuForm(makeEmptyMenuForm());
  }

  async function deleteMenuItem(it) {
    clearMsg();
    const ok = window.confirm(`Delete "${it.name}"? This cannot be undone.`);
    if (!ok) return;

    const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
    if (error) {
      setError(`Delete failed: ${error.message}`);
      return;
    }

    if (menuEditingId === it.id) {
      setMenuEditingId(null);
      setMenuForm(makeEmptyMenuForm());
    }

    setSuccess("Item deleted.");
    await loadMenu();
  }

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

  async function toggleMenuAvailability(it) {
    clearMsg();
    const next = !it.is_available;

    setMenuItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_available: next } : x)));

    const { error } = await supabase.from("menu_items").update({ is_available: next }).eq("id", it.id);
    if (error) {
      setMenuItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, is_available: it.is_available } : x)));
      setError(`Availability update failed: ${error.message}`);
      return;
    }

    if (menuEditingId === it.id) {
      setMenuForm((f) => ({ ...f, is_available: next }));
    }

    setSuccess(`"${it.name}" is now ${next ? "Available" : "Out of stock"}.`);
  }

  // ============================================================
  // MODIFIERS TAB (modifier_groups + modifier_items)
  // ============================================================
  const makeEmptyGroupForm = () => ({
    id: null,
    name: "",
    kind: "extras", // only used if kind exists
    sort_order: 0,
    is_active: true,
  });

  const makeEmptyModifierItemForm = () => ({
    id: null,
    group_id: null,
    name: "",
    price: "", // in rands
    sort_order: 0,
    is_active: true,
  });

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [hasGroupKind, setHasGroupKind] = useState(false);

  const [groupFilterKind, setGroupFilterKind] = useState("all"); // all | extras | cooking
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [groupForm, setGroupForm] = useState(() => makeEmptyGroupForm());
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupEditingId, setGroupEditingId] = useState(null);

  const [modifierItems, setModifierItems] = useState([]);
  const [modifierItemsLoading, setModifierItemsLoading] = useState(false);

  const [modItemForm, setModItemForm] = useState(() => makeEmptyModifierItemForm());
  const [modItemSaving, setModItemSaving] = useState(false);
  const [modItemEditingId, setModItemEditingId] = useState(null);

  const filteredGroups = useMemo(() => {
    if (groupFilterKind === "all" || !hasGroupKind) return groups;
    return groups.filter((g) => String(g.kind || "").toLowerCase() === groupFilterKind);
  }, [groups, groupFilterKind, hasGroupKind]);

  async function loadGroups() {
    setGroupsLoading(true);

    // Try with 'kind' first; if that column doesn’t exist, retry without it.
    let res = await supabase
      .from("modifier_groups")
      .select("id,name,kind,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (res.error) {
      // fallback
      res = await supabase
        .from("modifier_groups")
        .select("id,name,sort_order,is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (res.error) {
        setGroups([]);
        setGroupsLoading(false);
        setError(`Failed to load modifier_groups: ${res.error.message}`);
        return;
      }

      setHasGroupKind(false);
      setGroups(res.data || []);
      setGroupsLoading(false);
      return;
    }

    setHasGroupKind(true);
    setGroups(res.data || []);
    setGroupsLoading(false);
  }

  async function loadModifierItems(groupId) {
    if (!groupId) {
      setModifierItems([]);
      return;
    }

    setModifierItemsLoading(true);
    const { data, error } = await supabase
      .from("modifier_items")
      .select("id,group_id,name,price_cents,sort_order,is_active")
      .eq("group_id", groupId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setModifierItems([]);
      setModifierItemsLoading(false);
      setError(`Failed to load modifier_items: ${error.message}`);
      return;
    }

    setModifierItems(data || []);
    setModifierItemsLoading(false);
  }

  function startEditGroup(g) {
    clearMsg();
    setGroupEditingId(g.id);
    setGroupForm({
      id: g.id,
      name: g.name || "",
      kind: String(g.kind || "extras"),
      sort_order: g.sort_order ?? 0,
      is_active: g.is_active ?? true,
    });
  }

  function cancelEditGroup() {
    clearMsg();
    setGroupEditingId(null);
    setGroupForm(makeEmptyGroupForm());
  }

  async function saveGroup(e) {
    e.preventDefault();
    setGroupSaving(true);
    clearMsg();

    const name = String(groupForm.name || "").trim();
    if (!name) {
      setGroupSaving(false);
      setError("Group name is required.");
      return;
    }

    const basePayload = {
      name,
      sort_order: Number.isFinite(Number(groupForm.sort_order)) ? Number(groupForm.sort_order) : 0,
      is_active: !!groupForm.is_active,
    };

    const payload = hasGroupKind ? { ...basePayload, kind: String(groupForm.kind || "extras") } : basePayload;

    let res;
    if (groupEditingId) {
      res = await supabase.from("modifier_groups").update(payload).eq("id", groupEditingId).select("id").single();
    } else {
      res = await supabase.from("modifier_groups").insert(payload).select("id").single();
    }

    if (res?.error) {
      setGroupSaving(false);
      setError(`Save group failed: ${res.error.message}`);
      return;
    }

    setGroupSaving(false);
    setSuccess(groupEditingId ? "Group updated." : "Group added.");
    setGroupEditingId(null);
    setGroupForm(makeEmptyGroupForm());

    await loadGroups();
  }

  async function deleteGroup(g) {
    clearMsg();
    const ok = window.confirm(`Delete group "${g.name}"?\nThis will also remove its items and assignments (if FK cascade exists).`);
    if (!ok) return;

    // Safety: prevent delete if items exist (even if cascade exists)
    const { data: countRows, error: countErr } = await supabase
      .from("modifier_items")
      .select("id", { count: "exact", head: true })
      .eq("group_id", g.id);

    if (countErr) {
      setError(`Pre-check failed: ${countErr.message}`);
      return;
    }

    const count = countRows?.length ? countRows.length : 0; // head:true usually returns null data; some configs differ
    // If your client returns null data with head:true, do a non-head count:
    // We'll do a fallback if data is null:
    if (countRows == null) {
      const tmp = await supabase.from("modifier_items").select("id").eq("group_id", g.id).limit(1);
      if (tmp.error) {
        setError(`Pre-check failed: ${tmp.error.message}`);
        return;
      }
      if ((tmp.data || []).length > 0) {
        setError(`Cannot delete "${g.name}" because it still has items. Delete/move items first.`);
        return;
      }
    } else if (count > 0) {
      setError(`Cannot delete "${g.name}" because it still has items. Delete/move items first.`);
      return;
    }

    const { error } = await supabase.from("modifier_groups").delete().eq("id", g.id);
    if (error) {
      setError(`Delete group failed: ${error.message}`);
      return;
    }

    if (selectedGroupId === g.id) {
      setSelectedGroupId(null);
      setModifierItems([]);
      setModItemEditingId(null);
      setModItemForm(makeEmptyModifierItemForm());
    }

    setSuccess("Group deleted.");
    await loadGroups();
  }

  function pickGroup(g) {
    clearMsg();
    setSelectedGroupId(g.id);
    setModItemEditingId(null);
    setModItemForm({ ...makeEmptyModifierItemForm(), group_id: g.id });
    loadModifierItems(g.id);
  }

  function startEditModItem(it) {
    clearMsg();
    setModItemEditingId(it.id);
    setModItemForm({
      id: it.id,
      group_id: it.group_id,
      name: it.name || "",
      price: centsToDisplay(it.price_cents),
      sort_order: it.sort_order ?? 0,
      is_active: it.is_active ?? true,
    });
  }

  function cancelEditModItem() {
    clearMsg();
    setModItemEditingId(null);
    setModItemForm({ ...makeEmptyModifierItemForm(), group_id: selectedGroupId });
  }

  async function saveModItem(e) {
    e.preventDefault();
    setModItemSaving(true);
    clearMsg();

    const groupId = Number(modItemForm.group_id || selectedGroupId || 0);
    if (!groupId) {
      setModItemSaving(false);
      setError("Select a group first.");
      return;
    }

    const name = String(modItemForm.name || "").trim();
    if (!name) {
      setModItemSaving(false);
      setError("Item name is required.");
      return;
    }

    const cents = displayToCents(modItemForm.price);
    if (cents === null || cents < 0) {
      setModItemSaving(false);
      setError("Price must be a valid number (e.g. 12.50). Use 0 for cooking instructions.");
      return;
    }

    const payload = {
      group_id: groupId,
      name,
      price_cents: cents,
      sort_order: Number.isFinite(Number(modItemForm.sort_order)) ? Number(modItemForm.sort_order) : 0,
      is_active: !!modItemForm.is_active,
    };

    let res;
    if (modItemEditingId) {
      res = await supabase.from("modifier_items").update(payload).eq("id", modItemEditingId).select("id").single();
    } else {
      res = await supabase.from("modifier_items").insert(payload).select("id").single();
    }

    if (res?.error) {
      setModItemSaving(false);
      setError(`Save item failed: ${res.error.message}`);
      return;
    }

    setModItemSaving(false);
    setSuccess(modItemEditingId ? "Modifier item updated." : "Modifier item added.");
    setModItemEditingId(null);
    setModItemForm({ ...makeEmptyModifierItemForm(), group_id: groupId });
    await loadModifierItems(groupId);
  }

  async function deleteModItem(it) {
    clearMsg();
    const ok = window.confirm(`Delete "${it.name}"?`);
    if (!ok) return;

    const { error } = await supabase.from("modifier_items").delete().eq("id", it.id);
    if (error) {
      setError(`Delete item failed: ${error.message}`);
      return;
    }

    if (modItemEditingId === it.id) {
      setModItemEditingId(null);
      setModItemForm({ ...makeEmptyModifierItemForm(), group_id: selectedGroupId });
    }

    setSuccess("Modifier item deleted.");
    await loadModifierItems(it.group_id);
  }

  // ============================================================
  // ASSIGN TAB (menu_item_modifier_groups)
  // ============================================================
  const [assignMenuItemId, setAssignMenuItemId] = useState("");
  const [assignedGroupIds, setAssignedGroupIds] = useState(new Set());
  const [assignLoading, setAssignLoading] = useState(false);

  async function loadAssignments(menuItemId) {
    const id = Number(menuItemId || 0);
    if (!id) {
      setAssignedGroupIds(new Set());
      return;
    }

    setAssignLoading(true);
    const { data, error } = await supabase
      .from("menu_item_modifier_groups")
      .select("group_id,sort_order")
      .eq("menu_item_id", id);

    if (error) {
      setAssignLoading(false);
      setError(`Failed to load assignments: ${error.message}`);
      return;
    }

    setAssignedGroupIds(new Set((data || []).map((r) => r.group_id)));
    setAssignLoading(false);
  }

  async function toggleAssignment(groupId) {
    clearMsg();
    const menuItemId = Number(assignMenuItemId || 0);
    if (!menuItemId) {
      setError("Select a menu item first.");
      return;
    }

    const isAssigned = assignedGroupIds.has(groupId);

    // optimistic
    setAssignedGroupIds((prev) => {
      const next = new Set(prev);
      if (isAssigned) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

    if (isAssigned) {
      const { error } = await supabase
        .from("menu_item_modifier_groups")
        .delete()
        .eq("menu_item_id", menuItemId)
        .eq("group_id", groupId);

      if (error) {
        // revert
        setAssignedGroupIds((prev) => {
          const next = new Set(prev);
          next.add(groupId);
          return next;
        });
        setError(`Unassign failed: ${error.message}`);
        return;
      }
      setSuccess("Unassigned.");
    } else {
      const { error } = await supabase.from("menu_item_modifier_groups").insert({
        menu_item_id: menuItemId,
        group_id: groupId,
        sort_order: 0,
      });

      if (error) {
        // revert
        setAssignedGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
        setError(`Assign failed: ${error.message}`);
        return;
      }
      setSuccess("Assigned.");
    }
  }

  // ============================================================
  // Initial load
  // ============================================================
  useEffect(() => {
    loadMenu();
    // Load groups early (used by modifiers + assign tabs)
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload modifier items when group selection changes
  useEffect(() => {
    if (tab !== "modifiers") return;
    if (selectedGroupId) loadModifierItems(selectedGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId, tab]);

  // Reload assignments when menu item changes
  useEffect(() => {
    if (tab !== "assign") return;
    loadAssignments(assignMenuItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignMenuItemId, tab]);

  // ============================================================
  // UI
  // ============================================================
  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto", textAlign: "left" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ color: "#666", marginTop: 4 }}>Menu • Extras • Cooking Instructions • Assignments</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              clearMsg();
              loadMenu();
              loadGroups();
              if (selectedGroupId) loadModifierItems(selectedGroupId);
              if (assignMenuItemId) loadAssignments(assignMenuItemId);
            }}
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

      {/* Tabs */}
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          ["menu", "Menu"],
          ["modifiers", "Extras & Cooking"],
          ["assign", "Assign to Items"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              clearMsg();
              setTab(k);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: tab === k ? "#111827" : "white",
              color: tab === k ? "white" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
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

      {/* ====================================================== */}
      {/* MENU TAB */}
      {/* ====================================================== */}
      {tab === "menu" ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
            {/* Items table */}
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>Menu Items</div>
                {menuLoading ? <div style={{ color: "#666" }}>Loading…</div> : null}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
                  >
                    <option value="ALL">All</option>
                    {menuCategories.map((c) => (
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
                    {!menuLoading && filteredMenuItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 10, color: "#666" }}>
                          No items match your filters.
                        </td>
                      </tr>
                    ) : null}

                    {filteredMenuItems.map((it) => (
                      <tr key={it.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                        <td style={{ padding: "8px 6px" }}>
                          <div style={{ fontWeight: 800 }}>{it.name}</div>
                          {it.description ? <div style={{ color: "#666", fontSize: 12 }}>{it.description}</div> : null}
                        </td>
                        <td style={{ padding: "8px 6px" }}>{it.category}</td>
                        <td style={{ padding: "8px 6px" }}>{centsToDisplay(it.price_cents)}</td>
                        <td style={{ padding: "8px 6px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            <AvailabilitySwitch checked={!!it.is_available} onChange={() => toggleMenuAvailability(it)} />
                            <span style={{ fontSize: 12, fontWeight: 900, color: it.is_available ? "#0a6b2b" : "#a40000" }}>
                              {it.is_available ? "Available" : "Out of stock"}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 6px" }}>{it.sort_order ?? 0}</td>
                        <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => startEditMenuItem(it)}
                            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMenuItem(it)}
                            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #f0c7c7", background: "white", fontWeight: 900, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
                  Showing <b>{filteredMenuItems.length}</b> of <b>{menuItems.length}</b> items
                </div>
              </div>
            </div>

            {/* Menu form */}
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{menuEditingId ? "Edit Item" : "Add Item"}</div>

              <form onSubmit={saveMenuItem} style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Name</span>
                  <input value={menuForm.name} onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Description</span>
                  <textarea
                    value={menuForm.description}
                    onChange={(e) => setMenuForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                  />
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Category (Section)</span>
                  <input
                    value={menuForm.category}
                    onChange={(e) => setMenuForm((f) => ({ ...f, category: e.target.value }))}
                    list="category-list"
                    placeholder='e.g. "Starters"'
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                  />
                  <datalist id="category-list">
                    {menuCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Price (e.g. 12.50)</span>
                  <input
                    value={menuForm.price}
                    onChange={(e) => setMenuForm((f) => ({ ...f, price: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0.00"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={!!menuForm.is_available} onChange={(e) => setMenuForm((f) => ({ ...f, is_available: e.target.checked }))} />
                    <span style={{ fontSize: 12, color: "#666" }}>Available</span>
                  </label>

                  <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                    <input value={menuForm.sort_order} onChange={(e) => setMenuForm((f) => ({ ...f, sort_order: e.target.value }))} inputMode="numeric" style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    disabled={menuSaving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      fontWeight: 900,
                      cursor: menuSaving ? "not-allowed" : "pointer",
                      opacity: menuSaving ? 0.7 : 1,
                      flex: 1,
                    }}
                  >
                    {menuSaving ? "Saving…" : menuEditingId ? "Save Changes" : "Add Item"}
                  </button>

                  {menuEditingId ? (
                    <button
                      type="button"
                      onClick={cancelEditMenuItem}
                      disabled={menuSaving}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                        fontWeight: 900,
                        cursor: menuSaving ? "not-allowed" : "pointer",
                        opacity: menuSaving ? 0.7 : 1,
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {/* ====================================================== */}
      {/* MODIFIERS TAB */}
      {/* ====================================================== */}
      {tab === "modifiers" ? (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Groups */}
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Groups (Extras / Cooking)</div>
              {groupsLoading ? <div style={{ color: "#666" }}>Loading…</div> : null}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={loadGroups}
                style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
              >
                Refresh
              </button>

              {hasGroupKind ? (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Filter kind</span>
                  <select value={groupFilterKind} onChange={(e) => setGroupFilterKind(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="all">All</option>
                    <option value="extras">Extras</option>
                    <option value="cooking">Cooking</option>
                  </select>
                </label>
              ) : (
                <div style={{ color: "#666", fontSize: 12 }}>
                  Tip: add a <code>kind</code> column to <code>modifier_groups</code> to separate Extras vs Cooking cleanly.
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    <th style={{ padding: "8px 6px" }}>Name</th>
                    {hasGroupKind ? <th style={{ padding: "8px 6px" }}>Kind</th> : null}
                    <th style={{ padding: "8px 6px" }}>Active</th>
                    <th style={{ padding: "8px 6px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g) => (
                    <tr key={g.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                      <td style={{ padding: "8px 6px" }}>
                        <button
                          type="button"
                          onClick={() => pickGroup(g)}
                          style={{
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            fontWeight: selectedGroupId === g.id ? 900 : 700,
                            cursor: "pointer",
                            textDecoration: selectedGroupId === g.id ? "underline" : "none",
                          }}
                        >
                          {g.name}
                        </button>
                      </td>
                      {hasGroupKind ? <td style={{ padding: "8px 6px" }}>{String(g.kind || "")}</td> : null}
                      <td style={{ padding: "8px 6px" }}>{g.is_active === false ? "No" : "Yes"}</td>
                      <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => startEditGroup(g)}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGroup(g)}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #f0c7c7", background: "white", fontWeight: 900, cursor: "pointer" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!groupsLoading && filteredGroups.length === 0 ? (
                    <tr>
                      <td colSpan={hasGroupKind ? 4 : 3} style={{ padding: 10, color: "#666" }}>
                        No groups yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{groupEditingId ? "Edit Group" : "Add Group"}</div>

              <form onSubmit={saveGroup} style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Name</span>
                  <input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                </label>

                {hasGroupKind ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Kind</span>
                    <select value={groupForm.kind} onChange={(e) => setGroupForm((f) => ({ ...f, kind: e.target.value }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                      <option value="extras">Extras</option>
                      <option value="cooking">Cooking</option>
                    </select>
                  </label>
                ) : null}

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={!!groupForm.is_active} onChange={(e) => setGroupForm((f) => ({ ...f, is_active: e.target.checked }))} />
                    <span style={{ fontSize: 12, color: "#666" }}>Active</span>
                  </label>

                  <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                    <input value={groupForm.sort_order} onChange={(e) => setGroupForm((f) => ({ ...f, sort_order: e.target.value }))} inputMode="numeric" style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    disabled={groupSaving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      fontWeight: 900,
                      cursor: groupSaving ? "not-allowed" : "pointer",
                      opacity: groupSaving ? 0.7 : 1,
                      flex: 1,
                    }}
                  >
                    {groupSaving ? "Saving…" : groupEditingId ? "Save Changes" : "Add Group"}
                  </button>

                  {groupEditingId ? (
                    <button
                      type="button"
                      onClick={cancelEditGroup}
                      disabled={groupSaving}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                        fontWeight: 900,
                        cursor: groupSaving ? "not-allowed" : "pointer",
                        opacity: groupSaving ? 0.7 : 1,
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>

          {/* Items within selected group */}
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Items in Group</div>
              {modifierItemsLoading ? <div style={{ color: "#666" }}>Loading…</div> : null}
            </div>

            {!selectedGroupId ? (
              <div style={{ marginTop: 10, color: "#666" }}>Pick a group on the left to manage its items.</div>
            ) : (
              <>
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                        <th style={{ padding: "8px 6px" }}>Name</th>
                        <th style={{ padding: "8px 6px" }}>Price</th>
                        <th style={{ padding: "8px 6px" }}>Active</th>
                        <th style={{ padding: "8px 6px" }}>Sort</th>
                        <th style={{ padding: "8px 6px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modifierItems.map((it) => (
                        <tr key={it.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                          <td style={{ padding: "8px 6px", fontWeight: 800 }}>{it.name}</td>
                          <td style={{ padding: "8px 6px" }}>{centsToDisplay(it.price_cents)}</td>
                          <td style={{ padding: "8px 6px" }}>{it.is_active === false ? "No" : "Yes"}</td>
                          <td style={{ padding: "8px 6px" }}>{it.sort_order ?? 0}</td>
                          <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => startEditModItem(it)}
                              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteModItem(it)}
                              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #f0c7c7", background: "white", fontWeight: 900, cursor: "pointer" }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!modifierItemsLoading && modifierItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 10, color: "#666" }}>
                            No items in this group.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>{modItemEditingId ? "Edit Item" : "Add Item"}</div>

                  <form onSubmit={saveModItem} style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#666" }}>Name</span>
                      <input value={modItemForm.name} onChange={(e) => setModItemForm((f) => ({ ...f, name: e.target.value }))} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                    </label>

                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#666" }}>Price (0 for cooking instructions)</span>
                      <input
                        value={modItemForm.price}
                        onChange={(e) => setModItemForm((f) => ({ ...f, price: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0.00"
                        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                      />
                    </label>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="checkbox" checked={!!modItemForm.is_active} onChange={(e) => setModItemForm((f) => ({ ...f, is_active: e.target.checked }))} />
                        <span style={{ fontSize: 12, color: "#666" }}>Active</span>
                      </label>

                      <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                        <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                        <input value={modItemForm.sort_order} onChange={(e) => setModItemForm((f) => ({ ...f, sort_order: e.target.value }))} inputMode="numeric" style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }} />
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="submit"
                        disabled={modItemSaving}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "white",
                          fontWeight: 900,
                          cursor: modItemSaving ? "not-allowed" : "pointer",
                          opacity: modItemSaving ? 0.7 : 1,
                          flex: 1,
                        }}
                      >
                        {modItemSaving ? "Saving…" : modItemEditingId ? "Save Changes" : "Add Item"}
                      </button>

                      {modItemEditingId ? (
                        <button
                          type="button"
                          onClick={cancelEditModItem}
                          disabled={modItemSaving}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "white",
                            fontWeight: 900,
                            cursor: modItemSaving ? "not-allowed" : "pointer",
                            opacity: modItemSaving ? 0.7 : 1,
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ====================================================== */}
      {/* ASSIGN TAB */}
      {/* ====================================================== */}
      {tab === "assign" ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          <div style={{ fontWeight: 900 }}>Assign Groups to Menu Items</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
            This writes to <code>menu_item_modifier_groups</code> using <code>(menu_item_id, group_id, sort_order)</code>.
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}>
            <div>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#666" }}>Menu item</span>
                <select
                  value={assignMenuItemId}
                  onChange={(e) => setAssignMenuItemId(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="">Select…</option>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.category ? `${m.category} — ` : ""}{m.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => loadAssignments(assignMenuItemId)}
                  disabled={!assignMenuItemId || assignLoading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    fontWeight: 900,
                    cursor: !assignMenuItemId || assignLoading ? "not-allowed" : "pointer",
                    opacity: !assignMenuItemId || assignLoading ? 0.7 : 1,
                  }}
                >
                  {assignLoading ? "Loading…" : "Reload assignments"}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Groups</div>

              <div style={{ display: "grid", gap: 8 }}>
                {groups.map((g) => {
                  const checked = assignedGroupIds.has(g.id);
                  const kindText = hasGroupKind ? String(g.kind || "").toLowerCase() : "";
                  const badge =
                    hasGroupKind && kindText
                      ? kindText === "cooking"
                        ? "Cooking"
                        : "Extras"
                      : null;

                  return (
                    <label
                      key={g.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "1px solid #eee",
                        borderRadius: 12,
                        background: checked ? "#f2fbf5" : "white",
                        opacity: g.is_active === false ? 0.6 : 1,
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleAssignment(g.id)} disabled={!assignMenuItemId || g.is_active === false} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 900 }}>{g.name}</div>
                        {badge ? (
                          <div style={{ marginTop: 2, fontSize: 12, color: "#666" }}>
                            Type: <b>{badge}</b>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>{g.is_active === false ? "Inactive" : ""}</div>
                    </label>
                  );
                })}

                {groups.length === 0 ? <div style={{ color: "#666" }}>No groups yet. Create groups in the Extras & Cooking tab.</div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}