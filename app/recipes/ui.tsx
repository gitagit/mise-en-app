"use client";

import { formatCost, scaleQuantity } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal, Toast } from "@/app/components/Modal";
import Modal from "@/app/components/Modal";
import { normName } from "@/lib/normalize";
import { subtractQty } from "@/lib/quantity";

type Recipe = {
  id: string;
  title: string;
  servings: number;
  servingsMax: number | null;
  handsOnMin: number;
  totalMin: number;
  difficulty: number;
  equipment: string[];
  tags: string[];
  seasons: string[];
  instructions: string;
  source: string;
  sourceRef: string | null;
  cuisine: string | null;
  complexity: string;
  ingredients: { id: string; name: string; required: boolean; quantityText: string | null; preparation: string | null; substitutions: string[] }[];
  cookLogs: { id: string; rating: number; cookedOn: string; notes: string | null; wouldRepeat: boolean }[];
  techniques: { technique: { id: string; name: string } }[];
  caloriesPerServing: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  favorite: boolean;
};

const sources = ["PERSONAL", "FAMILY", "WEB", "COOKBOOK", "FRIEND"];
const complexities = ["FAMILIAR", "STRETCH", "CHALLENGE"];

function parseSteps(instructions: string): string[] {
  if (!instructions?.trim()) return [];
  const lines = instructions.split('\n').map(l => l.trim()).filter(Boolean);
  // Numbered format: "1. Step\n2. Step"
  if (lines.length > 1 && /^\d+\./.test(lines[0])) {
    return lines.map(l => l.replace(/^\d+\.\s*/, ''));
  }
  // Fallback: double-newline paragraphs (seed/legacy format)
  return instructions.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
}

type RecipesClientProps = {
  initialSearch?: string;
};

export default function RecipesClient({ initialSearch }: RecipesClientProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [servings, setServings] = useState(2);
  const [servingsMax, setServingsMax] = useState<number | "">("");
  const [totalMin, setTotalMin] = useState(30);
  const [handsOnMin, setHandsOnMin] = useState(15);
  const [difficulty, setDifficulty] = useState(2);
  const [equipment, setEquipment] = useState("STOVETOP");
  const [tags, setTags] = useState("WEEKNIGHT");
  const [seasons, setSeasons] = useState("");
  const [instructions, setInstructions] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  
  // New fields
  const [source, setSource] = useState("PERSONAL");
  const [sourceRef, setSourceRef] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [complexity, setComplexity] = useState("FAMILIAR");
  const [techniques, setTechniques] = useState("");

  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");
  const [filterCuisine, setFilterCuisine] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState<number | "">("");
  const [filterComplexity, setFilterComplexity] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterDuplicates, setFilterDuplicates] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);

  // UI collapse state
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showImport, setShowImport] = useState(false);

  // URL import state
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importedRecipe, setImportedRecipe] = useState<{
    title: string;
    servings: number;
    totalMin: number;
    handsOnMin: number;
    ingredients: { name: string; quantityText: string | null }[];
    instructions: string;
    cuisine: string | null;
    source: string;
    sourceRef: string;
    caloriesPerServing: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  } | null>(null);

  // Modal and toast state
  const [deleteModal, setDeleteModal] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [saving, setSaving] = useState(false);

  // Refine / Ask AI state
  const [refineModal, setRefineModal] = useState<{ id: string; title: string } | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineResult, setRefineResult] = useState<{ type: "answer"; text: string } | { type: "modified" } | null>(null);

  // Cook log form state (inline per recipe)
  const [logFormRecipeId, setLogFormRecipeId] = useState<string | null>(null);
  const [logRating, setLogRating] = useState(3);
  const [logNotes, setLogNotes] = useState("");
  const [logWouldRepeat, setLogWouldRepeat] = useState(false);
  const [logSaving, setLogSaving] = useState(false);

  // Leftover tracking — step 2 of the cook log flow
  type InventoryMatch = {
    ingredientName: string;
    recipeQty: string | null;
    batchId: string;
    currentQty: string;
    estimated: string | null;
  };
  const [logStep, setLogStep] = useState<1 | 2>(1);
  const [invMatches, setInvMatches] = useState<InventoryMatch[]>([]);
  const [matchQtys, setMatchQtys] = useState<Record<string, string>>({});
  const [invUpdating, setInvUpdating] = useState(false);

  // Edit history state
  type EditLogEntry = {
    id: string;
    editedAt: string;
    changedFields: string[];
    note: string | null;
  };
  const [editNote, setEditNote] = useState("");
  const [editHistory, setEditHistory] = useState<Record<string, EditLogEntry[]>>({});
  const [editHistoryOpen, setEditHistoryOpen] = useState<Record<string, boolean>>({});

  async function loadEditHistory(recipeId: string) {
    if (editHistory[recipeId]) return;
    const res = await fetch(`/api/recipes/${recipeId}/history`);
    const { logs } = await res.json();
    setEditHistory(h => ({ ...h, [recipeId]: logs }));
  }

  // Expansion state - tracks which recipes are expanded (all collapsed by default)
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());

  function toggleExpanded(recipeId: string) {
    setExpandedRecipes(prev => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
        // Fetch cost when expanding
        fetchRecipeCost(recipeId);
      }
      return next;
    });
  }

  function expandAll() {
    const allIds = recipes.map(r => r.id);
    setExpandedRecipes(new Set(allIds));
    // Fetch costs for all
    allIds.forEach(id => fetchRecipeCost(id));
  }

  function collapseAll() {
    setExpandedRecipes(new Set());
  }

  // Recipe scaling state - tracks desired servings per recipe
  const [scaledServings, setScaledServings] = useState<Record<string, number>>({});

  // Recipe cost state
  const [recipeCosts, setRecipeCosts] = useState<Record<string, {
    totalCents: number;
    costPerServing: number | null;
    matchedCount: number;
    totalIngredients: number;
    complete: boolean;
  } | null>>({});

  async function fetchRecipeCost(recipeId: string) {
    if (recipeCosts[recipeId] !== undefined) return; // Already fetched or loading
    setRecipeCosts(prev => ({ ...prev, [recipeId]: null })); // Mark as loading
    try {
      const res = await fetch(`/api/recipes/${recipeId}/cost`);
      const data = await res.json();
      setRecipeCosts(prev => ({
        ...prev,
        [recipeId]: {
          totalCents: data.totalCents,
          costPerServing: data.costPerServing,
          matchedCount: data.matchedCount,
          totalIngredients: data.totalIngredients,
          complete: data.complete
        }
      }));
    } catch {
      // Failed to fetch cost, leave as null
    }
  }

  function getScaledServings(r: Recipe): number {
    return scaledServings[r.id] ?? r.servings;
  }

  function setRecipeServings(recipeId: string, servings: number) {
    setScaledServings(prev => ({ ...prev, [recipeId]: servings }));
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error("Failed to load recipes");
      const data = await res.json();
      setRecipes(data.recipes);
      if (data.truncated) setToast({ message: `Showing first 200 of ${data.total} recipes.`, type: "info" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to load recipes", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function parseIngredients(txt: string) {
    return txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const req = /\(required\)/i.test(line);
        const opt = /\(optional\)/i.test(line);
        let clean = line.replace(/\((required|optional)\)/ig, "").trim();
        
        // Parse preparation if in brackets [diced]
        let preparation: string | undefined;
        const prepMatch = clean.match(/\[([^\]]+)\]/);
        if (prepMatch) {
          preparation = prepMatch[1];
          clean = clean.replace(/\[[^\]]+\]/, "").trim();
        }
        
        return { 
          name: clean, 
          required: opt ? false : req ? true : true, 
          preparation,
          substitutions: [] as string[] 
        };
      });
  }

  async function addRecipe() {
    if (!title.trim() || !ingredientsText.trim()) return;
    setSaving(true);

    try {
      const recipeData = {
        title,
        servings,
        servingsMax: servingsMax || undefined,
        totalMin,
        handsOnMin,
        difficulty,
        equipment: equipment.split(",").map(s=>s.trim()).filter(Boolean),
        tags: tags.split(",").map(s=>s.trim()).filter(Boolean),
        seasons: seasons ? seasons.split(",").map(s=>s.trim()).filter(Boolean) : [],
        instructions,
        ingredients: parseIngredients(ingredientsText),
        source,
        sourceRef: sourceRef || undefined,
        cuisine: cuisine || undefined,
        complexity,
        techniques: techniques ? techniques.split(",").map(s=>s.trim()).filter(Boolean) : []
      };

      const res = editingId
        ? await fetch("/api/recipes", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: editingId, ...recipeData, note: editNote || undefined })
          })
        : await fetch("/api/recipes", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(recipeData)
          });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.fieldErrors?.title?.[0] || "Failed to save recipe");
      }

      setToast({ message: editingId ? "Recipe updated" : "Recipe saved", type: "success" });
      cancelEdit();
      await refresh();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to save recipe", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setServings(2);
    setServingsMax("");
    setTotalMin(30);
    setHandsOnMin(15);
    setDifficulty(2);
    setEquipment("STOVETOP");
    setTags("WEEKNIGHT");
    setSeasons("");
    setInstructions("");
    setIngredientsText("");
    setSource("PERSONAL");
    setSourceRef("");
    setCuisine("");
    setComplexity("FAMILIAR");
    setTechniques("");
    setEditNote("");
  }

  // Extract unique values for filter dropdowns
  const allCuisines = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach(r => r.cuisine && set.add(r.cuisine));
    return Array.from(set).sort();
  }, [recipes]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach(r => r.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [recipes]);

  const duplicateMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (let i = 0; i < recipes.length; i++) {
      for (let j = i + 1; j < recipes.length; j++) {
        const a = new Set(recipes[i].ingredients.map(x => normName(x.name)));
        const b = new Set(recipes[j].ingredients.map(x => normName(x.name)));
        const inter = [...a].filter(x => b.has(x)).length;
        const union = new Set([...a, ...b]).size;
        if (union >= 3 && inter / union >= 0.65) {
          map.set(recipes[i].id, [...(map.get(recipes[i].id) ?? []), recipes[j].title]);
          map.set(recipes[j].id, [...(map.get(recipes[j].id) ?? []), recipes[i].title]);
        }
      }
    }
    return map;
  }, [recipes]);

  // Apply filters
  const filtered = useMemo(() => {
    return recipes.filter(r => {
      if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCuisine && r.cuisine !== filterCuisine) return false;
      if (filterDifficulty !== "" && r.difficulty !== filterDifficulty) return false;
      if (filterComplexity && r.complexity !== filterComplexity) return false;
      if (filterSource && r.source !== filterSource) return false;
      if (filterTag && !r.tags?.includes(filterTag)) return false;
      if (filterDuplicates && !duplicateMap.has(r.id)) return false;
      if (filterFavorites && !r.favorite) return false;
      return true;
    });
  }, [recipes, searchQuery, filterCuisine, filterDifficulty, filterComplexity, filterSource, filterTag, filterDuplicates, filterFavorites, duplicateMap]);

  const sorted = useMemo(() => filtered.slice().sort((a,b)=>a.title.localeCompare(b.title)), [filtered]);

  const favoriteCount = useMemo(() => recipes.filter(r => r.favorite).length, [recipes]);

  const hasFilters = searchQuery || filterCuisine || filterDifficulty !== "" || filterComplexity || filterSource || filterTag || filterDuplicates || filterFavorites;

  function clearFilters() {
    setSearchQuery("");
    setFilterCuisine("");
    setFilterDifficulty("");
    setFilterComplexity("");
    setFilterSource("");
    setFilterTag("");
    setFilterDuplicates(false);
    setFilterFavorites(false);
  }

  async function toggleFavorite(id: string, current: boolean) {
    const res = await fetch("/api/recipes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, favorite: !current }),
    });
    if (res.ok) {
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, favorite: !current } : r));
    }
  }

  function promptDelete(id: string, recipeTitle: string) {
    setDeleteModal({ id, title: recipeTitle });
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/recipes?id=${deleteModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete recipe");

      setToast({ message: `"${deleteModal.title}" deleted`, type: "success" });
      setDeleteModal(null);
      await refresh();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to delete", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  async function refineRecipe() {
    if (!refineModal || !refineInstruction.trim()) return;
    setRefining(true);
    setRefineResult(null);
    try {
      const res = await fetch(`/api/recipes/${refineModal.id}/refine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: refineInstruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refine failed");
      setRefineResult(data);
      if (data.type === "modified") await refresh();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Refine failed", type: "error" });
    } finally {
      setRefining(false);
    }
  }

  function openRefineModal(id: string, title: string) {
    setRefineModal({ id, title });
    setRefineInstruction("");
    setRefineResult(null);
  }

  function closeRefineModal() {
    setRefineModal(null);
    setRefineInstruction("");
    setRefineResult(null);
  }

  function editRecipe(r: Recipe) {
    setEditingId(r.id);
    setTitle(r.title);
    setServings(r.servings);
    setServingsMax(r.servingsMax ?? "");
    setTotalMin(r.totalMin);
    setHandsOnMin(r.handsOnMin);
    setDifficulty(r.difficulty);
    setEquipment(r.equipment?.join(", ") || "");
    setTags(r.tags?.join(", ") || "");
    setSeasons(r.seasons?.join(", ") || "");
    setInstructions(r.instructions || "");
    setCuisine(r.cuisine || "");
    setSource(r.source);
    setSourceRef(r.sourceRef || "");
    setComplexity(r.complexity);
    setTechniques(r.techniques?.map(t => t.technique.name).join(", ") || "");
    // Format ingredients back to text
    const ingText = r.ingredients.map(i => {
      let line = i.quantityText ? `${i.quantityText} ` : "";
      line += i.name;
      if (i.preparation) line += ` [${i.preparation}]`;
      line += i.required ? " (required)" : " (optional)";
      return line;
    }).join("\n");
    setIngredientsText(ingText);
    // Scroll to top of form and open the form
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function fetchRecipeFromUrl() {
    if (!importUrl.trim()) return;

    setImportLoading(true);
    setImportError("");
    setImportedRecipe(null);

    try {
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl })
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Failed to import recipe");
        return;
      }

      setImportedRecipe(data.recipe);
    } catch {
      setImportError("Failed to fetch recipe. Check the URL and try again.");
    } finally {
      setImportLoading(false);
    }
  }

  function useImportedRecipe() {
    if (!importedRecipe) return;

    // Populate the Add Recipe form with imported data
    setTitle(importedRecipe.title);
    setServings(importedRecipe.servings);
    setTotalMin(importedRecipe.totalMin);
    setHandsOnMin(importedRecipe.handsOnMin);
    setInstructions(importedRecipe.instructions);
    setCuisine(importedRecipe.cuisine || "");
    setSource("WEB");
    setSourceRef(importedRecipe.sourceRef);

    // Format ingredients
    const ingText = importedRecipe.ingredients
      .map(i => i.quantityText ? `${i.quantityText} ${i.name}` : i.name)
      .join("\n");
    setIngredientsText(ingText);

    // Clear import state and open add form
    setImportedRecipe(null);
    setImportUrl("");
    setShowImport(false);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearImport() {
    setImportUrl("");
    setImportError("");
    setImportedRecipe(null);
  }

  function openLogForm(recipeId: string) {
    setLogFormRecipeId(recipeId);
    setLogRating(3);
    setLogNotes("");
    setLogWouldRepeat(false);
    setLogStep(1);
  }

  function closeLogForm() {
    setLogFormRecipeId(null);
    setLogStep(1);
    setInvMatches([]);
    setMatchQtys({});
    setLogRating(3);
    setLogNotes("");
    setLogWouldRepeat(false);
  }

  async function submitLog(recipe: Recipe) {
    setLogSaving(true);
    try {
      const res = await fetch("/api/cooklogs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.id,
          rating: logRating,
          notes: logNotes.trim() || undefined,
          wouldRepeat: logWouldRepeat
        })
      });
      if (!res.ok) throw new Error("Failed to save");
      setToast({ message: "Cook logged!", type: "success" });
      await refresh();

      // Fetch inventory and build matches for step 2
      const invRes = await fetch("/api/inventory/items");
      const { items } = await invRes.json();
      const invMap = new Map<string, { batches: { id: string; quantityText: string }[] }>(
        items.map((it: any) => [normName(it.name), it])
      );
      const scaleFactor = getScaledServings(recipe) / recipe.servings;

      const matches: InventoryMatch[] = [];
      for (const ing of recipe.ingredients.filter((i) => i.required)) {
        const item = invMap.get(normName(ing.name));
        if (!item || !item.batches[0]) continue;
        const batch = item.batches[0];
        const estimated = ing.quantityText
          ? subtractQty(batch.quantityText, ing.quantityText, scaleFactor)
          : null;
        matches.push({
          ingredientName: ing.name,
          recipeQty: ing.quantityText,
          batchId: batch.id,
          currentQty: batch.quantityText,
          estimated,
        });
      }

      if (matches.length === 0) {
        closeLogForm();
        return;
      }

      const initQtys: Record<string, string> = {};
      for (const m of matches) {
        initQtys[m.batchId] = m.estimated ?? m.currentQty;
      }
      setInvMatches(matches);
      setMatchQtys(initQtys);
      setLogStep(2);
    } catch {
      setToast({ message: "Failed to save cook log", type: "error" });
    } finally {
      setLogSaving(false);
    }
  }

  async function updateInventory() {
    setInvUpdating(true);
    try {
      const changed = invMatches.filter(m => matchQtys[m.batchId] !== m.currentQty);
      const results = await Promise.all(changed.map(m =>
        fetch("/api/inventory/batches", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ batchId: m.batchId, quantityText: matchQtys[m.batchId] })
        }).then(r => r.json())
      ));
      const deleted = results.filter(r => r.deleted).length;
      if (deleted > 0) {
        setToast({ message: `${deleted} batch${deleted !== 1 ? "es" : ""} marked as used up and removed`, type: "info" });
      }
    } catch {
      setToast({ message: "Failed to update inventory", type: "error" });
    } finally {
      setInvUpdating(false);
      closeLogForm();
    }
  }

  return (
    <>
      {/* Import from URL */}
      <div className="card">
        <h3
          className="collapsible-header"
          onClick={() => setShowImport(!showImport)}
        >
          <span className={`collapse-icon ${showImport ? "open" : ""}`}>▶</span>
          Import from URL
        </h3>

        {showImport && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <input
                type="url"
                placeholder="Paste recipe URL (e.g., https://example.com/recipe)"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                style={{ flex: 1, minWidth: 250 }}
              />
              <button onClick={fetchRecipeFromUrl} disabled={importLoading || !importUrl.trim()}>
                {importLoading ? "Importing..." : "Fetch Recipe"}
              </button>
            </div>
            <p style={{ marginTop: 4 }}>
              <small className="muted">Works with most recipe sites that use structured data (AllRecipes, Food Network, etc.)</small>
            </p>

            {importError && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(200,50,50,0.1)", borderRadius: 8 }}>
                <strong style={{ color: "#c44" }}>Error:</strong> {importError}
              </div>
            )}

            {importedRecipe && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(100,180,100,0.1)", borderRadius: 8 }}>
                <h4 style={{ margin: "0 0 8px 0" }}>Preview: {importedRecipe.title}</h4>
                <div className="row" style={{ marginBottom: 8 }}>
                  <small className="muted">{importedRecipe.totalMin}m total</small>
                  <small className="muted">{importedRecipe.handsOnMin}m hands-on</small>
                  <small className="muted">Serves {importedRecipe.servings}</small>
                  {importedRecipe.cuisine && <small className="muted">{importedRecipe.cuisine}</small>}
                </div>
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 14 }}>
                    {importedRecipe.ingredients.length} ingredients
                  </summary>
                  <ul style={{ margin: "8px 0", paddingLeft: 20, fontSize: 14 }}>
                    {importedRecipe.ingredients.slice(0, 10).map((ing, i) => (
                      <li key={i}>{ing.quantityText ? `${ing.quantityText} ` : ""}{ing.name}</li>
                    ))}
                    {importedRecipe.ingredients.length > 10 && (
                      <li className="muted">...and {importedRecipe.ingredients.length - 10} more</li>
                    )}
                  </ul>
                </details>
                <div className="row">
                  <button onClick={useImportedRecipe}>Use This Recipe</button>
                  <button onClick={clearImport} style={{ color: "#888" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Recipe Form */}
      <div className="card" style={editingId ? { border: "2px solid var(--accent, #4a9eff)" } : undefined}>
        <h3
          className="collapsible-header"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <span className={`collapse-icon ${showAddForm ? "open" : ""}`}>▶</span>
          {editingId ? "Edit Recipe" : "Add Recipe"}
        </h3>

        {showAddForm && (
          <>
            <div className="row" style={{marginTop:12}}>
              <input placeholder="Title *" value={title} onChange={e=>setTitle(e.target.value)} style={{minWidth:280}}/>
              <input placeholder="Cuisine (e.g. Mexican)" value={cuisine} onChange={e=>setCuisine(e.target.value)} style={{minWidth:160}}/>
            </div>

            <div className="row" style={{marginTop:8}}>
              <label>Servings <input type="number" value={servings} onChange={e=>setServings(parseInt(e.target.value||"2",10))} style={{maxWidth:60}}/></label>
              <label>Max (scalable) <input type="number" value={servingsMax} onChange={e=>setServingsMax(e.target.value ? parseInt(e.target.value,10) : "")} style={{maxWidth:60}} placeholder="—"/></label>
              <label>Hands-on <input type="number" value={handsOnMin} onChange={e=>setHandsOnMin(parseInt(e.target.value||"15",10))} style={{maxWidth:60}}/> min</label>
              <label>Total <input type="number" value={totalMin} onChange={e=>setTotalMin(parseInt(e.target.value||"30",10))} style={{maxWidth:60}}/> min</label>
              <label>Difficulty
                <select value={difficulty} onChange={e=>setDifficulty(parseInt(e.target.value))}>
                  {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            <div className="row" style={{marginTop:8}}>
              <label>Source
                <select value={source} onChange={e=>setSource(e.target.value)}>
                  {sources.map(s=><option key={s} value={s}>{s.toLowerCase()}</option>)}
                </select>
              </label>
              <input placeholder="Source ref (URL, book, etc.)" value={sourceRef} onChange={e=>setSourceRef(e.target.value)} style={{minWidth:240}}/>
              <label>Complexity
                <select value={complexity} onChange={e=>setComplexity(e.target.value)}>
                  {complexities.map(c=><option key={c} value={c}>{c.toLowerCase()}</option>)}
                </select>
              </label>
            </div>

            <div className="row" style={{marginTop:8}}>
              <input placeholder="Equipment (comma-separated)" value={equipment} onChange={e=>setEquipment(e.target.value)} style={{minWidth:220}}/>
              <input placeholder="Tags (comma-separated)" value={tags} onChange={e=>setTags(e.target.value)} style={{minWidth:220}}/>
              <input placeholder="Seasons (or leave empty for any)" value={seasons} onChange={e=>setSeasons(e.target.value)} style={{minWidth:200}}/>
            </div>

            <div className="row" style={{marginTop:8}}>
              <input placeholder="Techniques (comma-separated, e.g. braising, sautéing)" value={techniques} onChange={e=>setTechniques(e.target.value)} style={{width:"100%"}}/>
            </div>

            <div style={{marginTop:12}}>
              <label style={{display:"block", marginBottom:4}}>Ingredients (one per line) *</label>
              <textarea
                rows={5}
                style={{width:"100%"}}
                value={ingredientsText}
                onChange={e=>setIngredientsText(e.target.value)}
                placeholder={"chicken thighs (required)\nsoy sauce (required)\nblack pepper [ground] (optional)"}
              />
              <small className="muted">Format: <code>name [prep] (required/optional)</code></small>
            </div>

            <div style={{marginTop:12}}>
              <label style={{display:"block", marginBottom:4}}>Instructions</label>
              <textarea rows={5} style={{width:"100%"}} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Step 1..."/>
            </div>

            {editingId && (
              <div style={{marginTop:12}}>
                <label style={{display:"block", marginBottom:4, fontSize:12, opacity:0.6}}>What changed? (optional)</label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="e.g. Reduced salt, added garlic"
                  rows={2}
                  style={{width:"100%", fontSize:13}}
                />
              </div>
            )}

            <div className="row" style={{marginTop:12}}>
              <button onClick={addRecipe} disabled={saving || !title.trim() || !ingredientsText.trim()}>
                {saving ? "Saving..." : editingId ? "Update Recipe" : "Save Recipe"}
              </button>
              {editingId && <button onClick={cancelEdit} disabled={saving} style={{color: "#888"}}>Cancel</button>}
              <button onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
            </div>
            {editingId && (
              <p style={{marginTop: 8}}><small className="muted">Editing recipe. Click Update to save changes or Cancel to discard.</small></p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3
          className="collapsible-header"
          onClick={() => setShowFilters(!showFilters)}
        >
          <span className={`collapse-icon ${showFilters ? "open" : ""}`}>▶</span>
          Filter Recipes
          {hasFilters && <span style={{marginLeft: 8, fontSize: 12, opacity: 0.7}}>({Object.values({searchQuery, filterCuisine, filterDifficulty, filterComplexity, filterSource, filterTag, filterFavorites}).filter(Boolean).length} active)</span>}
        </h3>

        {showFilters && (
          <>
            <div className="row" style={{marginTop: 8}}>
              <input
                placeholder="Search by title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{minWidth: 200}}
              />
              <select value={filterCuisine} onChange={e => setFilterCuisine(e.target.value)}>
                <option value="">All cuisines</option>
                {allCuisines.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="row" style={{marginTop: 8}}>
              <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value ? parseInt(e.target.value) : "")}>
                <option value="">Any difficulty</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>Difficulty {n}</option>)}
              </select>
              <select value={filterComplexity} onChange={e => setFilterComplexity(e.target.value)}>
                <option value="">Any complexity</option>
                {complexities.map(c => <option key={c} value={c}>{c.toLowerCase()}</option>)}
              </select>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                <option value="">Any source</option>
                {sources.map(s => <option key={s} value={s}>{s.toLowerCase()}</option>)}
              </select>
              <button
                onClick={() => setFilterFavorites(f => !f)}
                style={{
                  background: filterFavorites ? "var(--accent)" : undefined,
                  color: filterFavorites ? "#fff" : undefined,
                  border: filterFavorites ? "none" : undefined
                }}
              >
                {filterFavorites ? "Showing favorites" : `Favorites${favoriteCount > 0 ? ` (${favoriteCount})` : ""}`}
              </button>
              <button
                onClick={() => setFilterDuplicates(f => !f)}
                style={{
                  background: filterDuplicates ? "#c80" : undefined,
                  color: filterDuplicates ? "#fff" : undefined,
                  border: filterDuplicates ? "none" : undefined
                }}
              >
                {filterDuplicates ? "Showing duplicates" : `Duplicates${duplicateMap.size > 0 ? ` (${duplicateMap.size})` : ""}`}
              </button>
              {hasFilters && (
                <button onClick={clearFilters}>Clear filters</button>
              )}
            </div>
          </>
        )}
        <p style={{marginTop: 8, marginBottom: 0}}>
          <small className="muted">Showing {filtered.length} of {recipes.length} recipes</small>
        </p>
      </div>

      {loading ? (
        <div>
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="skeleton-card">
              <div className="skeleton skeleton-heading" style={{ width: "50%" }} />
              <div className="skeleton skeleton-line medium" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📖</div>
          <h3>No recipes yet</h3>
          <p>Add your first recipe using the form above, or head to Suggest to generate ideas from your inventory.</p>
          <a href="/suggest" className="empty-state-action">Get suggestions</a>
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>No matches</h3>
          <p>No recipes match your current filters. Try adjusting them.</p>
        </div>
      ) : (
        <>
          <div className="row" style={{margin:"16px 0 8px", justifyContent:"space-between", alignItems:"center"}}>
            <span style={{opacity:0.7}}>{sorted.length} recipes</span>
            <div className="row" style={{gap:8}}>
              <button onClick={expandAll} style={{padding:"2px 8px", fontSize:12}}>Expand All</button>
              <button onClick={collapseAll} style={{padding:"2px 8px", fontSize:12}}>Collapse All</button>
            </div>
          </div>

          {sorted.map(r => {
        const isExpanded = expandedRecipes.has(r.id);
        return (
          <div key={r.id} className="card">
            <div
              className="row"
              style={{justifyContent:"space-between", alignItems:"flex-start", cursor:"pointer"}}
              onClick={() => toggleExpanded(r.id)}
            >
              <div>
                <h3 style={{margin:"0 0 4px 0", display:"flex", alignItems:"center"}}>
                  <span style={{marginRight:8, opacity:0.5}}>{isExpanded ? "▼" : "▶"}</span>
                  {r.title}
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(r.id, r.favorite); }}
                    aria-label={r.favorite ? "Remove from favorites" : "Add to favorites"}
                    title={r.favorite ? "Remove from favorites" : "Add to favorites"}
                    style={{
                      marginLeft: 8,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: "0 4px",
                      opacity: r.favorite ? 1 : 0.3,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {r.favorite ? "\u2764\uFE0F" : "\u2661"}
                  </button>
                </h3>
                <small className="muted">
                  {r.totalMin}m total • {r.handsOnMin}m hands-on • serves {r.servings}{r.servingsMax ? `-${r.servingsMax}` : ""} • difficulty {r.difficulty}
                </small>
                {r.caloriesPerServing != null && (
                  <div style={{marginTop:4, fontSize:13, opacity:0.75}}>
                    ≈{r.caloriesPerServing} cal&nbsp;·&nbsp;{r.proteinG}g protein&nbsp;·&nbsp;{r.carbsG}g carbs&nbsp;·&nbsp;{r.fatG}g fat
                    <span style={{marginLeft:6, fontSize:11, opacity:0.6}}>(per serving, AI estimate)</span>
                  </div>
                )}
                <div style={{marginTop:4}}>
                  {r.cuisine && <span className="tag">{r.cuisine}</span>}
                  <span className="tag">{r.complexity.toLowerCase()}</span>
                  <span className="tag">{r.source.toLowerCase()}</span>
                  {r.techniques?.map(t => <span key={t.technique.id} className="tag tech">{t.technique.name}</span>)}
                </div>
                {duplicateMap.has(r.id) && (
                  <div style={{fontSize:11, color:"#c80", marginTop:2}} title={`Similar to: ${duplicateMap.get(r.id)!.join(", ")}`}>
                    ⚠ possible duplicate
                  </div>
                )}
              </div>
              {r.cookLogs.length > 0 && (
                <div style={{textAlign:"right"}}>
                  <small className="muted">
                    Made {r.cookLogs.length}× • Avg {(r.cookLogs.reduce((a,l)=>a+l.rating,0)/r.cookLogs.length).toFixed(1)}★
                  </small>
                </div>
              )}
            </div>

            {isExpanded && (
              <>
                {r.sourceRef && <div style={{marginTop:4}}><small className="muted">Source: {r.sourceRef}</small></div>}

                <div className="row" style={{marginTop:8}}>
                  <small className="muted">Equipment: {(r.equipment ?? []).join(", ") || "—"}</small>
                  <small className="muted">Tags: {(r.tags ?? []).join(", ") || "—"}</small>
                  {r.seasons?.length > 0 && <small className="muted">Seasons: {r.seasons.join(", ")}</small>}
                </div>

                <div style={{marginTop:12, marginBottom:6, display:"flex", alignItems:"center", gap:12}}>
                  <h4 style={{margin:0}}>Ingredients</h4>
                  <label style={{display:"flex", alignItems:"center", gap:4, fontSize:14}}>
                    for
                    <input
                      type="number"
                      min={1}
                      max={r.servingsMax || 20}
                      value={getScaledServings(r)}
                      onChange={e => setRecipeServings(r.id, parseInt(e.target.value) || r.servings)}
                      onClick={e => e.stopPropagation()}
                      style={{width:50, padding:"2px 4px"}}
                    />
                    servings
                    {getScaledServings(r) !== r.servings && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRecipeServings(r.id, r.servings); }}
                        style={{padding:"2px 6px", fontSize:12}}
                      >
                        Reset
                      </button>
                    )}
                  </label>
                </div>
                <ul style={{margin:0, paddingLeft:20}}>
                  {r.ingredients.map(i => {
                    const ratio = getScaledServings(r) / r.servings;
                    const scaledQty = scaleQuantity(i.quantityText, ratio);
                    const subs = Array.isArray(i.substitutions) ? i.substitutions : [];
                    return (
                      <li key={i.id}>
                        {scaledQty && <span>{scaledQty} </span>}
                        {i.name}
                        {i.preparation && <span className="muted"> ({i.preparation})</span>}
                        {!i.required && <small className="muted"> (optional)</small>}
                        {subs.length > 0 && (
                          <small className="muted" style={{ marginLeft: 6 }}>
                            — or: {subs.join(", ")}
                          </small>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {r.caloriesPerServing != null && (() => {
                  const s = getScaledServings(r);
                  return (
                    <div style={{marginTop:8, fontSize:13, opacity:0.75}}>
                      ≈{r.caloriesPerServing * s} cal&nbsp;·&nbsp;{(r.proteinG ?? 0) * s}g protein
                      &nbsp;·&nbsp;{(r.carbsG ?? 0) * s}g carbs&nbsp;·&nbsp;{(r.fatG ?? 0) * s}g fat
                      <span style={{marginLeft:6, fontSize:11, opacity:0.6}}>
                        (total for {s} serving{s !== 1 ? "s" : ""}, AI estimate)
                      </span>
                    </div>
                  );
                })()}

                {/* Cost estimate */}
                {recipeCosts[r.id] !== undefined && (
                  <div style={{marginTop: 12, padding: 8, background: "rgba(127,127,127,0.08)", borderRadius: 6}}>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                      <span style={{fontWeight: 500}}>Estimated Cost</span>
                      <span>
                        {recipeCosts[r.id] === null ? (
                          <span className="muted">Loading...</span>
                        ) : (() => {
                          const scalingRatio = getScaledServings(r) / r.servings;
                          const scaledTotal = Math.round(recipeCosts[r.id]!.totalCents * scalingRatio);
                          const scaledPerServing = recipeCosts[r.id]!.costPerServing;
                          return (
                            <>
                              <strong>{formatCost(scaledTotal)}</strong>
                              {scaledPerServing != null && (
                                <span className="muted"> ({formatCost(scaledPerServing)}/serving)</span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                    {recipeCosts[r.id] && (
                      <small className="muted" style={{display: "block", marginTop: 4}}>
                        Based on {recipeCosts[r.id]!.matchedCount}/{recipeCosts[r.id]!.totalIngredients} ingredients with prices
                        {!recipeCosts[r.id]!.complete && " (incomplete - some required ingredients missing prices)"}
                      </small>
                    )}
                  </div>
                )}

                {r.instructions && (
                  <>
                    <h4 style={{marginTop:12, marginBottom:6}}>Instructions</h4>
                    <ol style={{paddingLeft:20, margin:0}}>
                      {parseSteps(r.instructions).map((step, i) => (
                        <li key={i} style={{marginBottom:6}}>{step}</li>
                      ))}
                    </ol>
                  </>
                )}

                {/* Cook history */}
                {r.cookLogs.length > 0 && (
                  <div style={{marginTop:16}}>
                    <h4 style={{margin:"0 0 8px 0"}}>Cook History</h4>
                    {r.cookLogs.slice(0, 3).map(log => (
                      <div key={log.id} style={{marginBottom:8, paddingBottom:8, borderBottom:"1px solid rgba(127,127,127,0.1)"}}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                          <span style={{fontSize:15, letterSpacing:1}}>
                            {"★".repeat(log.rating)}
                            <span style={{opacity:0.25}}>{"★".repeat(5 - log.rating)}</span>
                          </span>
                          <span style={{fontSize:12, opacity:0.6}}>
                            {new Date(log.cookedOn).toLocaleDateString()}
                            {!log.wouldRepeat && <span style={{marginLeft:8, color:"#c66"}}>wouldn&apos;t repeat</span>}
                          </span>
                        </div>
                        {log.notes && (
                          <p style={{margin:"4px 0 0", fontSize:13, opacity:0.8, fontStyle:"italic"}}>&ldquo;{log.notes}&rdquo;</p>
                        )}
                      </div>
                    ))}
                    {r.cookLogs.length > 3 && (
                      <small className="muted">+{r.cookLogs.length - 3} more — see History page</small>
                    )}
                  </div>
                )}

                {/* Edit History */}
                <div style={{marginTop:8}}>
                  <button
                    onClick={() => {
                      const open = !editHistoryOpen[r.id];
                      setEditHistoryOpen(h => ({ ...h, [r.id]: open }));
                      if (open) loadEditHistory(r.id);
                    }}
                    style={{fontSize:12, opacity:0.6, background:"none", border:"none", cursor:"pointer", padding:0}}
                  >
                    {editHistoryOpen[r.id] ? "▾" : "▸"} Edit history
                  </button>
                  {editHistoryOpen[r.id] && (
                    <div style={{marginTop:6, fontSize:12, opacity:0.75}}>
                      {!editHistory[r.id] ? (
                        <span>Loading...</span>
                      ) : editHistory[r.id].length === 0 ? (
                        <span style={{opacity:0.5}}>No edits recorded.</span>
                      ) : (
                        editHistory[r.id].map(e => (
                          <div key={e.id} style={{marginBottom:6}}>
                            <span style={{opacity:0.5}}>{new Date(e.editedAt).toLocaleDateString()}</span>
                            {e.changedFields.length > 0 && (
                              <span style={{marginLeft:6}}>{e.changedFields.join(", ")}</span>
                            )}
                            {e.note && <div style={{marginTop:2, fontStyle:"italic"}}>{e.note}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Log a Cook */}
                {logFormRecipeId === r.id ? (
                  <div style={{marginTop:12, padding:12, background:"rgba(127,127,127,0.08)", borderRadius:8}} onClick={e => e.stopPropagation()}>
                    {logStep === 1 ? (
                      <>
                        <h4 style={{margin:"0 0 10px 0"}}>Log a Cook</h4>
                        <div style={{display:"flex", alignItems:"center", gap:4, marginBottom:8}}>
                          <span style={{fontSize:13, marginRight:4}}>Rating:</span>
                          {[1,2,3,4,5].map(n => (
                            <button
                              key={n}
                              onClick={() => setLogRating(n)}
                              style={{padding:"2px 2px", fontSize:20, lineHeight:1, background:"none", border:"none", cursor:"pointer", color: logRating >= n ? "#f5a623" : "rgba(127,127,127,0.3)"}}
                            >★</button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Notes (optional) — what worked, what to change next time"
                          value={logNotes}
                          onChange={e => setLogNotes(e.target.value)}
                          style={{width:"100%", marginBottom:8, boxSizing:"border-box"}}
                        />
                        <div className="row" style={{alignItems:"center"}}>
                          <label style={{display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer"}}>
                            <input type="checkbox" checked={logWouldRepeat} onChange={e => setLogWouldRepeat(e.target.checked)}/>
                            Would make again
                          </label>
                          <button onClick={() => submitLog(r)} disabled={logSaving}>{logSaving ? "Saving..." : "Save"}</button>
                          <button onClick={closeLogForm} style={{color:"#888"}}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                          <strong style={{fontSize:14}}>Update inventory</strong>
                          <button onClick={closeLogForm} style={{fontSize:12, opacity:0.5, background:"none", border:"none", cursor:"pointer"}}>Skip →</button>
                        </div>
                        {invMatches.map(m => (
                          <div key={m.batchId} style={{display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap"}}>
                            <span style={{flex:1, fontSize:13, minWidth:120}}>
                              {m.ingredientName}
                              {m.recipeQty && <span className="muted" style={{marginLeft:4}}>({m.recipeQty} used)</span>}
                            </span>
                            <input
                              value={matchQtys[m.batchId] ?? m.currentQty}
                              onChange={e => setMatchQtys(q => ({ ...q, [m.batchId]: e.target.value }))}
                              placeholder="remaining"
                              style={{width:90, fontSize:13}}
                            />
                            <label style={{fontSize:12, whiteSpace:"nowrap", cursor:"pointer", display:"flex", alignItems:"center", gap:4}}>
                              <input
                                type="checkbox"
                                checked={(matchQtys[m.batchId] ?? m.currentQty) === "0"}
                                onChange={e => setMatchQtys(q => ({ ...q, [m.batchId]: e.target.checked ? "0" : m.currentQty }))}
                              />
                              none left
                            </label>
                          </div>
                        ))}
                        <div className="row" style={{marginTop:10}}>
                          <button onClick={updateInventory} disabled={invUpdating}>
                            {invUpdating ? "Updating..." : "Update inventory"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{marginTop:10, display:"flex", gap:8, flexWrap:"wrap"}}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openLogForm(r.id); }}
                      style={{padding:"4px 12px", fontSize:13}}
                    >+ Log a Cook</button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const url = `${window.location.origin}/r/${r.id}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          setToast({ message: "Share link copied to clipboard!", type: "success" });
                        } catch {
                          setToast({ message: `Share link: ${url}`, type: "info" });
                        }
                      }}
                      style={{padding:"4px 12px", fontSize:13, opacity:0.65}}
                    >Share</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openRefineModal(r.id, r.title); }}
                      style={{padding:"4px 12px", fontSize:13, opacity:0.75}}
                    >✨ Ask AI</button>
                  </div>
                )}

                <div className="row" style={{marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(127,127,127,0.2)"}}>
                  <button onClick={(e) => { e.stopPropagation(); editRecipe(r); }} style={{padding: "4px 12px"}}>Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); promptDelete(r.id, r.title); }} style={{padding: "4px 12px", color: "#c44"}}>Delete</button>
                </div>
              </>
            )}
          </div>
        );
      })}
        </>
      )}

      <Modal
        open={!!refineModal}
        onClose={closeRefineModal}
        title={refineModal ? `✨ Ask AI — ${refineModal.title}` : "Ask AI"}
      >
        {refineResult?.type === "answer" ? (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {refineResult.text}
            </p>
            <button onClick={() => setRefineResult(null)} style={{ fontSize: 13 }}>
              ← Ask another question
            </button>
          </div>
        ) : refineResult?.type === "modified" ? (
          <div>
            <p style={{ margin: "0 0 14px" }}>✅ Recipe updated.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setRefineResult(null)} style={{ fontSize: 13 }}>
                ← Make another change
              </button>
              <button onClick={closeRefineModal} style={{ fontSize: 13, opacity: 0.6 }}>Done</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 13, opacity: 0.65 }}>
              Ask a question or request a change:
            </p>
            <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13, opacity: 0.65 }}>
              <li>Make this dairy-free</li>
              <li>Cut the cook time in half</li>
              <li>Can I substitute chicken for beef?</li>
              <li>Add a wine pairing suggestion</li>
            </ul>
            <textarea
              rows={3}
              value={refineInstruction}
              onChange={e => setRefineInstruction(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) refineRecipe(); }}
              placeholder="What would you like to change or ask?"
              style={{ width: "100%", fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
              autoFocus
            />
            <button
              onClick={refineRecipe}
              disabled={refining || !refineInstruction.trim()}
              style={{ width: "100%", fontWeight: 600, padding: "10px" }}
            >
              {refining ? "Thinking… (may take 20s)" : "Ask AI →"}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        title="Delete Recipe"
        message={`Are you sure you want to delete "${deleteModal?.title}" and all its cook logs? This cannot be undone.`}
        confirmText="Delete"
        loading={deleting}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
