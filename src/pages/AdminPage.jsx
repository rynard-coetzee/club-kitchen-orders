import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AdminPage() {
  const nav = useNavigate();

  const [tab, setTab] = useState("menu"); // menu | categories | modifiers | assign

  const [msg, setMsg] = useState({ type: "info", text: "" });
  const setError = (text) => setMsg({ type: "error", text });
  const setSuccess = (text) => setMsg({ type: "success", text });
  const clearMsg = () => setMsg({ type: "info", text: "" });
  const [recipeMenuItemId, setRecipeMenuItemId] = useState("");
  const [recipeItems, setRecipeItems] = useState([]);
  // ============================================================
  // RECIPE TAB
  // ============================================================
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("unit");
  // ============================================================
  // MODIFIER RECIPE TAB
  // ============================================================
  const [modRecipeItemId, setModRecipeItemId] = useState("");
  const [modRecipeItems, setModRecipeItems] = useState([]);
  const [modRecipeLoading, setModRecipeLoading] = useState(false);

  const [modNewIngredientId, setModNewIngredientId] = useState("");
  const [modNewQty, setModNewQty] = useState("");
  const [modNewUnit, setModNewUnit] = useState("unit");
  async function loadModifierRecipe(modifierId) {
    if (!modifierId) {
      setModRecipeItems([]);
      return;
    }

    setModRecipeLoading(true);

    const { data, error } = await supabase
      .from("modifier_item_ingredients")
      .select(`
        id,
        ingredient_id,
        qty,
        unit,
        ingredients(name)
      `)
      .eq("modifier_item_id", modifierId);

    setModRecipeLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setModRecipeItems(data || []);
  }
  async function addModifierRecipeItem() {
    clearMsg();

    if (!modRecipeItemId || !modNewIngredientId || !modNewQty) {
      setError("Fill all fields");
      return;
    }

    const qty = Number(modNewQty);
    if (qty <= 0) {
      setError("Invalid quantity");
      return;
    }

    // prevent duplicates
    const exists = modRecipeItems.find(r => r.ingredient_id == modNewIngredientId);
    if (exists) {
      setError("Ingredient already added");
      return;
    }

    const { error } = await supabase
      .from("modifier_item_ingredients")
      .insert({
        modifier_item_id: modRecipeItemId,
        ingredient_id: modNewIngredientId,
        qty,
        unit: modNewUnit
      });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Ingredient added");

    setModNewIngredientId("");
    setModNewQty("");
    setModNewUnit("unit");

    loadModifierRecipe(modRecipeItemId);
  }
  async function updateModifierRecipeQty(id, qty) {
    const val = Number(qty);
    if (!val || val <= 0) return;

    const { error } = await supabase
      .from("modifier_item_ingredients")
      .update({ qty: val })
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    loadModifierRecipe(modRecipeItemId);
  }
  async function deleteModifierRecipeItem(id) {
    const { error } = await supabase
      .from("modifier_item_ingredients")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Removed");
    loadModifierRecipe(modRecipeItemId);
  }
  async function loadRecipe(menuItemId) {
    if (!menuItemId) {
      setRecipeItems([]);
      return;
    }

    setRecipeLoading(true);

    const { data, error } = await supabase
      .from("menu_item_ingredients")
      .select(`
        id,
        ingredient_id,
        qty,
        unit,
        ingredients(name)
      `)
      .eq("menu_item_id", menuItemId);

    setRecipeLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setRecipeItems(data || []);
  }
  async function deleteIngredient(id) {
    clearMsg();

    const { error } = await supabase
      .from("ingredients")
      .update({ is_active: false }) // ✅ THIS LINE
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Ingredient removed");
    loadIngredients();
  }
  async function addRecipeItem() {
    clearMsg();

    if (!recipeMenuItemId || !newIngredientId || !newQty) {
      setError("Fill all fields");
      return;
    }

    const qty = Number(newQty);
    if (qty <= 0) {
      setError("Invalid quantity");
      return;
    }

    // prevent duplicates
    const exists = recipeItems.find(r => r.ingredient_id == newIngredientId);
    if (exists) {
      setError("Ingredient already added");
      return;
    }
    const ingredient = ingredients.find(i => i.id == newIngredientId);

    if (ingredient && ingredient.unit !== newUnit) {
      setError(`Unit must match ingredient unit (${ingredient.unit})`);
      return;
    }
    const { error } = await supabase
      .from("menu_item_ingredients")
      .insert({
        menu_item_id: recipeMenuItemId,
        ingredient_id: newIngredientId,
        qty,
        unit: newUnit
      });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Ingredient added");

    setNewIngredientId("");
    setNewQty("");
    setNewUnit("unit");

    loadRecipe(recipeMenuItemId);
  }
  async function updateRecipeQty(id, qty) {
    const val = Number(qty);
    if (!val || val <= 0) return;

    const { error } = await supabase
      .from("menu_item_ingredients")
      .update({ qty: val })
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    loadRecipe(recipeMenuItemId);
  }
  async function addIngredientToRecipe(ingredientId, qty) {
    if (!recipeMenuItemId) return;

    const { error } = await supabase
      .from("menu_item_ingredients")
      .insert({
        menu_item_id: recipeMenuItemId,
        ingredient_id: ingredientId,
        qty: Number(qty),
      });

    if (error) {
      setError(error.message);
      return;
    }

    loadRecipe(recipeMenuItemId);
  }
  async function deleteRecipeItem(id) {
    const { error } = await supabase
      .from("menu_item_ingredients")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Removed");
    loadRecipe(recipeMenuItemId);
  }
  async function logout() {
    clearMsg();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(`Logout failed: ${error.message}`);
      return;
    }
    nav("/login", { replace: true });
  }

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
  // CATEGORIES TAB
  // ============================================================
  const makeEmptyCategoryForm = () => ({
    id: null,
    name: "",
    is_main: false,
    sort_order: 0,
    is_active: true,
  });

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryForm, setCategoryForm] = useState(() => makeEmptyCategoryForm());
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState(null);

  // =====================
  // STOCK STATE
  // =====================
  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  const makeEmptyIngredientForm = () => ({
    id: null,
    name: "",
    unit: "unit",
    cost_per_unit: "",
    is_active: true,
  });

  const [ingredientForm, setIngredientForm] = useState(makeEmptyIngredientForm());
  const [ingredientSaving, setIngredientSaving] = useState(false);
  const [ingredientEditingId, setIngredientEditingId] = useState(null);

  // stock loading
  const [stockLoadQty, setStockLoadQty] = useState("");
  const [stockLoadIngredientId, setStockLoadIngredientId] = useState(null);
  async function loadIngredients() {
    const { data, error } = await supabase
      .from("ingredients")
      .select(`
        id,
        name,
        unit,
        cost_per_unit,
        is_active,
        stock_movements(change_qty)
      `)
      .eq("is_active", true);

    if (error) {
      setError(error.message);
      return;
    }

    console.log("FULL RAW DATA:", data); // 👈 BIG picture

    const cleaned = (data || []).map((ing) => {
      console.log("ING RAW:", ing);

      const movements = Array.isArray(ing.stock_movements)
        ? ing.stock_movements
        : [];

      console.log("MOVEMENTS:", movements);

      const totalStock = movements.reduce((sum, m) => {
        const val = Number(m.change_qty || 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

      console.log("CALCULATED TOTAL:", totalStock);

      const result = {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        cost_per_unit: ing.cost_per_unit,
        stock_qty: totalStock,
      };

      console.log("ING CLEANED:", result); // 👈 FINAL VALUE USED IN UI

      return result;
    });

    console.log("FINAL CLEANED ARRAY:", cleaned); // 👈 what React receives

    setIngredients(cleaned);
  }
  async function saveIngredient(e) {
    e.preventDefault();
    setIngredientSaving(true);
    clearMsg();

    const name = ingredientForm.name.trim();
    if (!name) {
      setIngredientSaving(false);
      setError("Name is required");
      return;
    }

    const payload = {
      name,
      unit: ingredientForm.unit,
      cost_per_unit: Number(ingredientForm.cost_per_unit || 0),
      is_active: !!ingredientForm.is_active,
    };

    let res;
    if (ingredientEditingId) {
      res = await supabase.from("ingredients").update(payload).eq("id", ingredientEditingId);
    } else {
      const { data: existing } = await supabase
        .from("ingredients")
        .select("id, is_active")
        .ilike("name", payload.name)
        .maybeSingle();

      if (existing) {
        // ✅ revive existing ingredient
        res = await supabase
          .from("ingredients")
          .update({
            ...payload,
            is_active: true,
          })
          .eq("id", existing.id);
      } else {
        // ✅ normal insert
        res = await supabase
          .from("ingredients")
          .insert(payload);
      }
    }

    if (res.error) {
      setIngredientSaving(false);
      setError(res.error.message);
      return;
    }

    setIngredientSaving(false);
    setSuccess(ingredientEditingId ? "Ingredient updated" : "Ingredient added");

    setIngredientForm(makeEmptyIngredientForm());
    setIngredientEditingId(null);
    loadIngredients();
  }
  async function addStock(ingredientId) {
    clearMsg();

    const qty = Number(stockLoadQty);
    if (!qty || qty <= 0) {
      setError("Enter valid quantity");
      return;
    }

    const { error } = await supabase.from("stock_movements").insert({
      ingredient_id: ingredientId,
      change_qty: qty,
      reason: "purchase",
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Stock added");
    setStockLoadQty("");
    setStockLoadIngredientId(null);

    loadIngredients();
  }
  async function loadCategories() {
    setCategoriesLoading(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("id,name,is_main,sort_order,is_active")
      .order("is_main", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setCategories([]);
      setCategoriesLoading(false);
      setError(`Failed to load categories: ${error.message}`);
      return;
    }

    setCategories(data || []);
    setCategoriesLoading(false);
  }

  async function saveCategory(e) {
    e.preventDefault();
    setCategorySaving(true);
    clearMsg();

    const name = String(categoryForm.name || "").trim();
    if (!name) {
      setCategorySaving(false);
      setError("Category name is required.");
      return;
    }

    const payload = {
      name,
      is_main: !!categoryForm.is_main,
      sort_order: Number.isFinite(Number(categoryForm.sort_order)) ? Number(categoryForm.sort_order) : 0,
      is_active: !!categoryForm.is_active,
    };

    let res;
    if (categoryEditingId) {
      const old = categories.find((c) => c.id === categoryEditingId);

      res = await supabase.from("menu_categories").update(payload).eq("id", categoryEditingId).select("id").single();

      if (!res?.error && old && old.name !== name) {
        // keep existing app working by updating menu_items.category text too
        const sync = await supabase.from("menu_items").update({ category: name }).eq("category", old.name);
        if (sync.error) {
          setCategorySaving(false);
          setError(`Category saved, but menu_items sync failed: ${sync.error.message}`);
          return;
        }
      }
    } else {
      res = await supabase.from("menu_categories").insert(payload).select("id").single();
    }

    if (res?.error) {
      setCategorySaving(false);
      setError(`Save category failed: ${res.error.message}`);
      return;
    }

    setCategorySaving(false);
    setSuccess(categoryEditingId ? "Category updated." : "Category added.");
    setCategoryEditingId(null);
    setCategoryForm(makeEmptyCategoryForm());
    await loadCategories();
    await loadMenu();
  }

  function startEditCategory(cat) {
    clearMsg();
    setCategoryEditingId(cat.id);
    setCategoryForm({
      id: cat.id,
      name: cat.name || "",
      is_main: !!cat.is_main,
      sort_order: cat.sort_order ?? 0,
      is_active: cat.is_active ?? true,
    });
  }

  function cancelEditCategory() {
    clearMsg();
    setCategoryEditingId(null);
    setCategoryForm(makeEmptyCategoryForm());
  }

  async function deleteCategory(cat) {
    clearMsg();

    const inUse = menuItems.filter((m) => String(m.category || "") === String(cat.name || ""));
    if (inUse.length > 0) {
      setError(`Cannot delete "${cat.name}" because ${inUse.length} menu item(s) still use it.`);
      return;
    }

    const ok = window.confirm(`Delete category "${cat.name}"?`);
    if (!ok) return;

    const { error } = await supabase.from("menu_categories").delete().eq("id", cat.id);
    if (error) {
      setError(`Delete category failed: ${error.message}`);
      return;
    }

    if (categoryEditingId === cat.id) {
      setCategoryEditingId(null);
      setCategoryForm(makeEmptyCategoryForm());
    }

    setSuccess("Category deleted.");
    await loadCategories();
  }

  // ============================================================
  // MENU TAB
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
  const [dragCategoryId, setDragCategoryId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [menuForm, setMenuForm] = useState(() => makeEmptyMenuForm());
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuEditingId, setMenuEditingId] = useState(null);

  const activeCategoryNames = useMemo(() => {
    return categories
      .filter((c) => c.is_active !== false)
      .map((c) => c.name);
  }, [categories]);

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
  async function reorderCategoriesByDrag(sourceId, targetId) {
  clearMsg();
  if (!sourceId || !targetId || sourceId === targetId) return;

  const ordered = [...categories].sort((a, b) => {
    if ((b.is_main ? 1 : 0) !== (a.is_main ? 1 : 0)) {
      return (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0);
    }
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const sourceIndex = ordered.findIndex((c) => c.id === sourceId);
  const targetIndex = ordered.findIndex((c) => c.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const sourceCat = ordered[sourceIndex];
  const targetCat = ordered[targetIndex];

  // Optional rule: only reorder within same main/normal bucket
  if (!!sourceCat.is_main !== !!targetCat.is_main) {
    setError("You can only drag categories within the same type (main with main, normal with normal).");
    return;
  }

  const next = [...ordered];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);

  // reassign sort_order sequentially inside each bucket
  const updates = [];
  let mainOrder = 0;
  let normalOrder = 0;

  for (const cat of next) {
    const newSort = cat.is_main ? mainOrder++ : normalOrder++;
    if ((cat.sort_order ?? 0) !== newSort) {
      updates.push(
        supabase.from("menu_categories").update({ sort_order: newSort }).eq("id", cat.id)
      );
    }
  }

  if (!updates.length) return;

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    setError(`Failed to reorder categories: ${failed.error.message}`);
    return;
  }

  setSuccess("Category order updated.");
  await loadCategories();
} 

  async function moveCategory(catId, direction) {
  clearMsg();

  const ordered = [...categories].sort((a, b) => {
    if ((b.is_main ? 1 : 0) !== (a.is_main ? 1 : 0)) {
      return (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0);
    }
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const idx = ordered.findIndex((c) => c.id === catId);
  if (idx < 0) return;

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= ordered.length) return;

  const current = ordered[idx];
  const target = ordered[targetIdx];

  // keep main and normal categories separate
  if (!!current.is_main !== !!target.is_main) {
    setError("You can only reorder within the same type (main with main, normal with normal).");
    return;
  }

  const next = [...ordered];
  const [moved] = next.splice(idx, 1);
  next.splice(targetIdx, 0, moved);

  let mainOrder = 0;
  let normalOrder = 0;

  const updates = [];
  for (const cat of next) {
    const newSort = cat.is_main ? mainOrder++ : normalOrder++;
    if ((cat.sort_order ?? 0) !== newSort) {
      updates.push(
        supabase.from("menu_categories").update({ sort_order: newSort }).eq("id", cat.id)
      );
    }
  }

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    setError(`Failed to reorder categories: ${failed.error.message}`);
    return;
  }

  setSuccess("Category order updated.");
  await loadCategories();
}

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
      setError("Category is required.");
      return;
    }

    const categoryExists = categories.some((c) => String(c.name) === category);
    if (!categoryExists) {
      setMenuSaving(false);
      setError("Please create/select a category first in the Categories tab.");
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
  // MODIFIERS TAB
  // ============================================================
  const makeEmptyGroupForm = () => ({
    id: null,
    name: "",
    kind: "extras",
    is_required: false,
    min_select: 0,
    max_select: 1,
    sort_order: 0,
    is_active: true,
  });

  const makeEmptyModifierItemForm = () => ({
    id: null,
    group_id: null,
    name: "",
    price: "",
    sort_order: 0,
    is_active: true,
  });

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [hasGroupKind, setHasGroupKind] = useState(false);

  const [groupFilterKind, setGroupFilterKind] = useState("all");
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

    let res = await supabase
      .from("modifier_groups")
      .select("id,name,kind,is_required,min_select,max_select,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (res.error) {
      res = await supabase
        .from("modifier_groups")
        .select("id,name,is_required,min_select,max_select,sort_order,is_active")
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

  async function loadModifierItems(groupId = null) {
    setModifierItemsLoading(true);

    let query = supabase
      .from("modifier_items")
      .select("id,group_id,name,price_cents,sort_order,is_active");

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query.order("name", { ascending: true });

    setModifierItemsLoading(false);

    if (error) {
      setModifierItems([]);
      setError(`Failed to load modifier_items: ${error.message}`);
      return;
    }

    setModifierItems(data || []);
  }

  function startEditGroup(g) {
    clearMsg();
    setGroupEditingId(g.id);
    setGroupForm({
      id: g.id,
      name: g.name || "",
      kind: String(g.kind || "extras"),
      is_required: !!g.is_required,
      min_select: Number.isFinite(Number(g.min_select)) ? Number(g.min_select) : 0,
      max_select: Number.isFinite(Number(g.max_select)) ? Number(g.max_select) : 1,
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

    const minSel = Number(groupForm.min_select);
    const maxSel = Number(groupForm.max_select);

    if (!Number.isInteger(minSel) || minSel < 0) {
      setGroupSaving(false);
      setError("Min select must be an integer ≥ 0.");
      return;
    }

    if (!Number.isInteger(maxSel) || maxSel < 1) {
      setGroupSaving(false);
      setError("Max select must be an integer ≥ 1.");
      return;
    }

    if (minSel > maxSel) {
      setGroupSaving(false);
      setError("Min select cannot be greater than max select.");
      return;
    }

    const basePayload = {
      name,
      is_required: !!groupForm.is_required,
      min_select: minSel,
      max_select: maxSel,
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

    const tmp = await supabase.from("modifier_items").select("id").eq("group_id", g.id).limit(1);
    if (tmp.error) {
      setError(`Pre-check failed: ${tmp.error.message}`);
      return;
    }
    if ((tmp.data || []).length > 0) {
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
  // ASSIGN TAB
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
    loadCategories();
    loadMenu();
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (tab === "stock" || tab === "recipes" || tab === "modifierRecipes") {
      loadIngredients();
    }
  }, [tab])
  useEffect(() => {
    if (tab !== "modifiers") return;
    if (selectedGroupId) loadModifierItems(selectedGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId, tab]);
  useEffect(() => {
    if (tab === "modifierRecipes") {
      loadModifierItems(); // 👈 load ALL modifiers
    }
  }, [tab]);
  useEffect(() => {
    if (tab !== "assign") return;
    loadAssignments(assignMenuItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignMenuItemId, tab]);

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 1200, margin: "0 auto", textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ color: "#666", marginTop: 4 }}>Menu • Categories • Extras • Cooking Instructions • Assignments</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              clearMsg();
              loadCategories();
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
            onClick={logout}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          ["menu", "Menu"],
          ["categories", "Categories"],
          ["modifiers", "Extras & Cooking"],
          ["assign", "Assign to Items"],
          ["stock", "Stock"],
          ["recipes", "Recipes"],
          ["modifierRecipes", "Modifier Recipes"],
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
      {tab === "recipes" ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>

          <div style={{ fontWeight: 900 }}>Recipe Builder</div>

          {/* SELECT MENU ITEM */}
          <div style={{ marginTop: 12 }}>
            <select
              value={recipeMenuItemId}
              onChange={(e) => {
                setRecipeMenuItemId(e.target.value);
                loadRecipe(e.target.value);
              }}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
            >
              <option value="">Select menu item...</option>
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* ADD INGREDIENT */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>

            <select
              value={newIngredientId}
              onChange={(e) => setNewIngredientId(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="">Ingredient...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Qty"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="unit">Unit</option>
              <option value="g">Gram</option>
              <option value="ml">ML</option>
            </select>

            <button
              onClick={addRecipeItem}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "none",
                background: "#16a34a",
                color: "white",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              Add
            </button>
          </div>

          {/* RECIPE LIST */}
          <div style={{ marginTop: 14 }}>
            {recipeLoading ? (
              <div>Loading...</div>
            ) : recipeItems.length === 0 ? (
              <div style={{ color: "#666" }}>No ingredients yet</div>
            ) : (
              <table style={{ width: "100%", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recipeItems.map((r) => (
                    <tr key={r.id}>
                      <td>{r.ingredients?.name}</td>

                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={r.qty}
                          onBlur={(e) => updateRecipeQty(r.id, e.target.value)}
                          style={{ width: 80 }}
                        />
                      </td>

                      <td>{r.unit}</td>

                      <td>
                        <button
                          onClick={() => deleteRecipeItem(r.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "none",
                            background: "#dc2626",
                            color: "white",
                            cursor: "pointer"
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      ) : null}
      {tab === "modifierRecipes" ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
          
          <div style={{ fontWeight: 900 }}>Modifier Recipe Builder</div>

          {/* SELECT MODIFIER */}
          <div style={{ marginTop: 12 }}>
            <select
              value={modRecipeItemId}
              onChange={(e) => {
                setModRecipeItemId(e.target.value);
                loadModifierRecipe(e.target.value);
              }}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
            >
              <option value="">Select modifier...</option>
              {modifierItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* ADD INGREDIENT */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
            
            <select
              value={modNewIngredientId}
              onChange={(e) => setModNewIngredientId(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="">Ingredient...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Qty"
              value={modNewQty}
              onChange={(e) => setModNewQty(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <select
              value={modNewUnit}
              onChange={(e) => setModNewUnit(e.target.value)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="unit">Unit</option>
              <option value="g">Gram</option>
              <option value="ml">ML</option>
            </select>

            <button
              onClick={addModifierRecipeItem}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "none",
                background: "#16a34a",
                color: "white",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              Add
            </button>
          </div>

          {/* LIST */}
          <div style={{ marginTop: 14 }}>
            {modRecipeLoading ? (
              <div>Loading...</div>
            ) : modRecipeItems.length === 0 ? (
              <div style={{ color: "#666" }}>No ingredients yet</div>
            ) : (
              <table style={{ width: "100%", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {modRecipeItems.map((r) => (
                    <tr key={r.id}>
                      <td>{r.ingredients?.name}</td>

                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={r.qty}
                          onBlur={(e) => updateModifierRecipeQty(r.id, e.target.value)}
                          style={{ width: 80 }}
                        />
                      </td>

                      <td>{r.unit}</td>

                      <td>
                        <button
                          onClick={() => deleteModifierRecipeItem(r.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "none",
                            background: "#dc2626",
                            color: "white",
                            cursor: "pointer"
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      ) : null}
      {tab === "menu" ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
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
                    {activeCategoryNames.map((c) => (
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

            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{menuEditingId ? "Edit Item" : "Add Item"}</div>

              <form onSubmit={saveMenuItem} style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Name</span>
                  <input
                    value={menuForm.name}
                    onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                  />
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
                  <span style={{ fontSize: 12, color: "#666" }}>Category</span>
                  <select
                    value={menuForm.category}
                    onChange={(e) => setMenuForm((f) => ({ ...f, category: e.target.value }))}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="">Select…</option>
                    {activeCategoryNames.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
                    <input
                      type="checkbox"
                      checked={!!menuForm.is_available}
                      onChange={(e) => setMenuForm((f) => ({ ...f, is_available: e.target.checked }))}
                    />
                    <span style={{ fontSize: 12, color: "#666" }}>Available</span>
                  </label>

                  <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                    <input
                      value={menuForm.sort_order}
                      onChange={(e) => setMenuForm((f) => ({ ...f, sort_order: e.target.value }))}
                      inputMode="numeric"
                      style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                    />
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

      {tab === "categories" ? (
        
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Categories</div>
              {categoriesLoading ? <div style={{ color: "#666" }}>Loading…</div> : null}
            </div>
            <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
              Drag categories to reorder them, or use ↑ / ↓.
            </div>
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    <th style={{ padding: "8px 6px" }}>Name</th>
                    <th style={{ padding: "8px 6px" }}>Type</th>
                    <th style={{ padding: "8px 6px" }}>Active</th>
                    <th style={{ padding: "8px 6px" }}>Sort</th>
                    <th style={{ padding: "8px 6px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, idx) => (
                    <tr
                      key={cat.id}
                      draggable
                      onDragStart={() => setDragCategoryId(cat.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async () => {
                        await reorderCategoriesByDrag(dragCategoryId, cat.id);
                        setDragCategoryId(null);
                      }}
                      onDragEnd={() => setDragCategoryId(null)}
                      style={{
                        borderBottom: "1px solid #f2f2f2",
                        background: dragCategoryId === cat.id ? "#f8fafc" : "transparent",
                        cursor: "grab",
                      }}
                    >
                      <td style={{ padding: "8px 6px", fontWeight: 800 }}>{cat.name}</td>
                      <td style={{ padding: "8px 6px" }}>{cat.is_main ? "Main" : "Normal"}</td>
                      <td style={{ padding: "8px 6px" }}>{cat.is_active === false ? "No" : "Yes"}</td>
                      <td style={{ padding: "8px 6px" }}>{cat.sort_order ?? 0}</td>
                      <td style={{ padding: "8px 6px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => moveCategory(cat.id, "up")}
                          disabled={idx === 0}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "white",
                            fontWeight: 900,
                            cursor: idx === 0 ? "not-allowed" : "pointer",
                            opacity: idx === 0 ? 0.6 : 1,
                          }}
                        >
                           ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(cat.id, "down")}
                          disabled={idx === categories.length - 1}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            background: "white",
                            fontWeight: 900,
                            cursor: idx === categories.length - 1 ? "not-allowed" : "pointer",
                            opacity: idx === categories.length - 1 ? 0.6 : 1,
                          }}
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={() => startEditCategory(cat)}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", fontWeight: 900, cursor: "pointer" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(cat)}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #f0c7c7", background: "white", fontWeight: 900, cursor: "pointer" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!categoriesLoading && categories.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 10, color: "#666" }}>
                        No categories yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{categoryEditingId ? "Edit Category" : "Add Category"}</div>

            <form onSubmit={saveCategory} style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#666" }}>Name</span>
                <input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!categoryForm.is_main}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, is_main: e.target.checked }))}
                />
                <span style={{ fontSize: 12, color: "#666" }}>Main category (always displayed first)</span>
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!categoryForm.is_active}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12, color: "#666" }}>Active</span>
                </label>

                <label style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 160 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Sort Order</span>
                  <input
                    value={categoryForm.sort_order}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: e.target.value }))}
                    inputMode="numeric"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={categorySaving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    fontWeight: 900,
                    cursor: categorySaving ? "not-allowed" : "pointer",
                    opacity: categorySaving ? 0.7 : 1,
                    flex: 1,
                  }}
                >
                  {categorySaving ? "Saving…" : categoryEditingId ? "Save Changes" : "Add Category"}
                </button>

                {categoryEditingId ? (
                  <button
                    type="button"
                    onClick={cancelEditCategory}
                    disabled={categorySaving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      fontWeight: 900,
                      cursor: categorySaving ? "not-allowed" : "pointer",
                      opacity: categorySaving ? 0.7 : 1,
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {tab === "modifiers" ? (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              ) : null}
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
                    <input
                      type="checkbox"
                      checked={!!groupForm.is_required}
                      onChange={(e) => setGroupForm((f) => ({ ...f, is_required: e.target.checked }))}
                    />
                    <span style={{ fontSize: 12, color: "#666" }}>Required</span>
                  </label>

                  <label style={{ display: "grid", gap: 4, minWidth: 120 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Min Select</span>
                    <input
                      value={groupForm.min_select}
                      onChange={(e) => setGroupForm((f) => ({ ...f, min_select: e.target.value }))}
                      inputMode="numeric"
                      style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 4, minWidth: 120 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>Max Select</span>
                    <input
                      value={groupForm.max_select}
                      onChange={(e) => setGroupForm((f) => ({ ...f, max_select: e.target.value }))}
                      inputMode="numeric"
                      style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
                    />
                  </label>
                </div>

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
      {/* ====================================================== */}
      {/* STOCK TAB */}
      {/* ====================================================== */}
      {tab === "stock" ? (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
          
          {/* LEFT: Ingredients */}
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ fontWeight: 900 }}>Ingredients</div>

            <table style={{ width: "100%", marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stock</th>
                  <th>Cost</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td>{ing.name}</td>

                    <td>
                      {ing.stock_qty}{" "}
                      <span style={{ color: "#666", fontSize: 12 }}>
                        {ing.unit}
                      </span>
                    </td>

                    <td>R{Number(ing.cost_per_unit).toFixed(2)}</td>

                    <td style={{ display: "flex", gap: 8 }}>
                      
                      {/* EXISTING LOAD BUTTON */}
                      <button
                        onClick={() => setStockLoadIngredientId(ing.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          background: "white",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Load
                      </button>

                      {/* ✅ NEW DELETE BUTTON */}
                      <button
                        onClick={() => {
                          if (!confirm("Delete this ingredient?")) return;
                          deleteIngredient(ing.id);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #fecaca",
                          background: "#fff5f5",
                          color: "#b91c1c",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {stockLoadIngredientId && (
              <div style={{ marginTop: 10 }}>
                <input
                  value={stockLoadQty}
                  onChange={(e) => setStockLoadQty(e.target.value)}
                  placeholder="Qty"
                />
                <button onClick={() => addStock(stockLoadIngredientId)}>
                  Add
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: Add Ingredient */}
          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "white" }}>
            <div style={{ fontWeight: 900 }}>
              {ingredientEditingId ? "Edit Ingredient" : "Add Ingredient"}
            </div>

            <form onSubmit={saveIngredient}>
              <input
                placeholder="Name"
                value={ingredientForm.name}
                onChange={(e) => setIngredientForm(f => ({ ...f, name: e.target.value }))}
              />

              <select
                value={ingredientForm.unit}
                onChange={(e) =>
                  setIngredientForm((f) => ({
                    ...f,
                    unit: e.target.value
                  }))
                }
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid #ddd"
                }}
              >
                <option value="unit">Unit</option>
                <option value="g">Gram (g)</option>
                <option value="ml">Millilitre (ml)</option>
              </select>

              <input
                placeholder="Cost"
                value={ingredientForm.cost_per_unit}
                onChange={(e) => setIngredientForm(f => ({ ...f, cost_per_unit: e.target.value }))}
              />

              <button type="submit">
                Save
              </button>
            </form>
          </div>
        </div>
      ) : null}

    
    </div>
  );
}