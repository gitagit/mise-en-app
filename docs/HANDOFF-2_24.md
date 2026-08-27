# Kitchen Manager — Project Handoff Document

**Generated:** February 24, 2026
**Supersedes:** HANDOFF-2_23.md
**Purpose:** Context transfer for continued development in Claude Code

---

## 1. Project Overview

A personal kitchen management application for a single household. Core goals:

1. **Inventory Tracking** — Pantry/fridge/freezer items with batch and expiration tracking
2. **Recipe Suggestions** — Score saved recipes by ingredient fit, time, equipment, skill growth, and cost
3. **Grocery Planning** — Auto-generate shopping lists split by SHIP vs IN_PERSON channel
4. **Skill Growth** — Track cooking techniques (untried → learning → comfortable → confident) and suggest recipes that teach new ones
5. **AI Assistance** — Recipe generation and photo inventory capture via Claude API

### Who It's For

A household (currently single-user) that wants to reduce food waste, get dinner ideas without decision fatigue, and gradually expand their cooking repertoire.

---

## 2. Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Database | **PostgreSQL** via Prisma ORM (migrated from SQLite) |
| Language | TypeScript |
| Styling | Minimal custom CSS (`globals.css`) |
| Validation | Zod |
| Runtime | Node.js |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — claude-sonnet-4-6 |
| Unit Tests | Vitest (142 tests, all passing) |
| E2E Tests | Playwright (6 tests, all passing) |

### Why PostgreSQL (was SQLite)?
Migrated during this session for real CHECK constraints, proper JSON support, and future multi-user readiness. Database: `kitchen_manager` on `localhost:5432`. Connection string in `.env` as `DATABASE_URL`.

---

## 3. Project Structure

```
kitchen-manager-app/
├── app/
│   ├── api/
│   │   ├── _shared.ts                  # Shared Zod schemas and string constants
│   │   ├── cooklogs/route.ts            # GET/POST cook log entries
│   │   ├── generate/route.ts           # POST: AI-generate recipes via Claude
│   │   ├── grocery/plan/route.ts       # POST: generate grocery list (atomic transaction)
│   │   ├── inventory/
│   │   │   ├── items/route.ts          # GET/POST/PUT/DELETE inventory items
│   │   │   ├── import/route.ts         # POST: bulk text import
│   │   │   └── capture/route.ts        # POST: photo scan via Claude vision (5MB limit/image)
│   │   ├── mealplan/route.ts           # GET/POST/DELETE meal plan entries
│   │   ├── preferences/route.ts        # GET/PUT user preferences singleton
│   │   ├── recipes/
│   │   │   ├── route.ts                # GET/POST/PUT/DELETE recipes
│   │   │   ├── import/route.ts         # POST: import recipe from URL (SSRF-protected)
│   │   │   └── [id]/cost/route.ts      # GET: cost per serving for a recipe
│   │   ├── stats/route.ts              # GET: all cooking statistics
│   │   ├── suggest/route.ts            # POST: scored recipe suggestions
│   │   └── techniques/route.ts         # GET/POST techniques, update comfort levels
│   ├── grocery/ui.tsx + page.tsx
│   ├── history/ui.tsx + page.tsx       # Cook log history view
│   ├── inventory/ui.tsx + page.tsx
│   ├── mealplan/ui.tsx + page.tsx      # Weekly meal planning calendar
│   ├── recipes/ui.tsx + page.tsx
│   ├── stats/ui.tsx + page.tsx         # Full stats dashboard
│   ├── suggest/ui.tsx + page.tsx
│   ├── techniques/ui.tsx + page.tsx    # Skill tracking
│   ├── preferences/ui.tsx + page.tsx
│   ├── layout.tsx                      # Nav and global layout
│   ├── page.tsx                        # Home/onboarding
│   └── globals.css
├── lib/
│   ├── db.ts                           # Prisma client singleton
│   ├── normalize.ts                    # normName(): lowercase + strip hyphens/underscores
│   └── scoring.ts                      # Multi-factor recipe scoring algorithm
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                         # Seeds 73 real-ish inventory items + recipes
│   └── migrations/
│       └── 20260224011924_add_check_constraints/  # DB CHECK constraints
├── tests/
│   ├── e2e/                            # Playwright E2E tests
│   │   ├── inventory.spec.ts
│   │   ├── recipes.spec.ts
│   │   ├── suggest.spec.ts
│   │   └── grocery.spec.ts
│   └── (unit tests in tests/)
├── playwright.config.ts
└── package.json
```

---

## 4. Database Schema

### Item + ItemBatch
```
Item: id, name (unique), category, location, staple, parLevel, preferredBrand,
      notes, defaultCostCents (Int?), createdAt, updatedAt
ItemBatch: id, itemId, quantityText, expiresOn, purchasedOn, costCents (Int?), createdAt
```
**Cost pattern:** `batch.costCents ?? item.defaultCostCents ?? null`. Always in **cents** (e.g., 499 = $4.99).

### Recipe + RecipeIngredient
```
Recipe: id, title (unique), servings, servingsMax, handsOnMin, totalMin,
        difficulty (1-5), source, sourceRef, cuisine, complexity,
        equipment (JSON string array), tags (JSON string array),
        seasons (JSON string array), instructions, createdAt, updatedAt

RecipeIngredient: id, recipeId, name, required, quantityText, preparation,
                  categoryHint, substitutions (JSON string array)
```

### CookLog
```
CookLog: id, recipeId, cookedOn, rating (1-5), notes, wouldRepeat, servedTo
```
CHECK constraint: `rating >= 1 AND rating <= 5`

### Technique + RecipeTechnique
```
Technique: id, name (unique), description, difficulty (1-5), comfort (0-3)
           comfort: 0=untried, 1=learning, 2=comfortable, 3=confident
RecipeTechnique: recipeId, techniqueId (unique pair)
```
CHECK constraints: `difficulty 1-5`, `comfort 0-3`

### GroceryItem
```
GroceryItem: id, name, channel (SHIP/IN_PERSON/EITHER), quantityText, reason,
             priority (1-3), acquired, createdAt
```
CHECK constraint: `priority >= 1 AND priority <= 3`

### UserPreferences (singleton)
```
UserPreferences: id, equipment (JSON string), defaultServings, defaultMaxTimeMin,
                 dietaryTagsExclude (JSON string), cuisinesExclude (JSON string),
                 defaultComplexity, wantVariety, wantGrowth, createdAt, updatedAt
```
Note: comment in schema marks where to add `userId` for future multi-user support.

### MealPlan
```
MealPlan: id, date, slot (breakfast/lunch/dinner), recipeId?, notes, servings?
          Unique constraint: (date, slot)
```

---

## 5. Scoring Algorithm (lib/scoring.ts)

`scoreRecipe()` is a pure function — it never touches the database. Cost enrichment is done in the API layer.

| Factor | Points | Notes |
|--------|--------|-------|
| Ingredient coverage | +60 max | % of required ingredients in inventory |
| Missing penalty | -12 each | Per missing required ingredient |
| Expiring bonus | +12 | Uses any item expiring within 5 days |
| Must-use bonus | +8 each | Hits specifically requested ingredients |
| Time fit | +8 / -20 | Within or over constraint |
| Equipment match | +8 / -25 | Has required equipment or not |
| Tag include/exclude | +5 / -6, -10 | Include and exclude tag filters |
| Occasion | +6 / -3 | Matches requested meal type |
| Season fit | +5 / -8 | Matches season filter |
| Cuisine filter | +10 / -15 | Matches requested cuisine |
| Cuisine variety | +15 new, +8 old | Boosts cuisines not cooked recently (last 21d) |
| Complexity match | +8 / -5 | Matches requested complexity |
| Technique growth | +6–15 | Boosts recipes with untried/learning techniques |
| Historical rating | ±6 | Based on past cook log avg rating vs 3 stars |
| Recency penalty | -6 | If cooked in last 14 days |
| Favorite bonus | +4 | High-rated + allWouldRepeat |
| No-repeat penalty | -8 | Any log marked wouldRepeat=false |

**Cost per serving** is computed in `app/api/suggest/route.ts` after scoring, not inside `scoreRecipe()`. It builds an `itemCostMap` from inventory items and calculates `totalCents / recipe.servings`.

**Known limitation:** Unmatched ingredients contribute $0 to cost, so recipes with many non-inventory ingredients show understated costs. No threshold guard yet — shows cost even with 1 ingredient matched.

---

## 6. Complete Feature Status

### ✅ Working

| Feature | Location | Notes |
|---------|----------|-------|
| Inventory CRUD | `/inventory` | Items + batches, cost, expiration |
| Bulk text import | `/inventory` | Paste formatted list |
| Photo capture | `/inventory` | Claude vision, up to 5 images, 5MB/image limit |
| Recipe CRUD | `/recipes` | Full metadata, techniques, ingredients with substitutions |
| Recipe URL import | `/recipes` | JSON-LD extraction, SSRF-protected, 10s timeout |
| Smart suggestions | `/suggest` | 15+ scoring factors, top 10 results |
| Cost per serving | `/suggest` | Badge on result cards (`~$X.XX/serving`) |
| AI recipe generation | `/suggest` | Claude generates 3-5 new recipes; save to library |
| "I Made This" | `/suggest` | Log cook + inventory deductions in one flow |
| Grocery list | `/grocery` | From selected recipes, SHIP vs IN_PERSON, atomic transaction |
| Meal planning | `/mealplan` | Weekly calendar, breakfast/lunch/dinner slots |
| Cook history | `/history` | All cook logs, filter by recipe/date |
| Skills tracking | `/techniques` | Comfort level per technique, linked to recipes |
| Stats dashboard | `/stats` | Streaks, ratings, cuisines, techniques, avg cost/meal |
| User preferences | `/preferences` | Equipment, time, dietary, complexity, variety/growth |
| DB CHECK constraints | Migration | Rating, difficulty, comfort, priority all bounded |
| Unit tests | `tests/` | 142 passing (Vitest) |
| E2E tests | `tests/e2e/` | 6 passing (Playwright) |

### ❌ Not Yet Built

| Feature | Priority | Notes |
|---------|----------|-------|
| **Replace seeded inventory** | High | 73 placeholder items need clearing; real data to be entered via photo/import |
| **Inventory drift controls** | High | No `lastConfirmed` timestamp; stale items silently corrupt suggestions |
| **PWA / mobile** | Medium | No manifest, no service worker; grocery list unusable offline |
| **Multi-user / auth** | Low | Schema has no userId; entire DB is shared global state |
| **Par level enforcement** | Low | Field exists but grocery only checks "staple + zero batches," not quantity thresholds |

---

## 7. Known Issues and Technical Debt

### 1. Ingredient matching is fragile
`normName()` does: lowercase → trim → replace `[_-]+` with space → collapse whitespace. It does NOT handle synonyms. "garbanzo beans" ≠ "chickpeas". "green onion" ≠ "scallion". Suggestions are only as good as the match. Substitutions partially compensate but must be manually curated per ingredient.

### 2. Cost coverage is understated
Ingredients not found in the inventory cost map contribute $0. A recipe where only 2 of 10 ingredients are in the cost map will show a very low per-serving cost. No minimum coverage threshold is enforced before showing a cost badge.

### 3. `(item as any).defaultCostCents` in suggest and stats routes
Both routes cast to `any` to access `defaultCostCents`. The field IS in the schema but the Prisma client may not have regenerated properly after it was added. If TypeScript starts complaining, run `npx prisma generate`. The correct type-safe access should just work after that.

### 4. Par level is stub-only
`Item.parLevel` is an `Int?` in the schema but `quantityText` is freeform text. There's no quantity normalization layer (no unit conversion, no parsing "2 cups" vs "500g"). Proper par level enforcement would require either numeric quantity tracking or a separate quantity model. Currently, grocery generation only adds staples with zero batches — a much weaker check than par level implies.

### 5. No inventory drift tracking
There's no `lastConfirmed DateTime?` field on Item or ItemBatch. As the user cooks and items get used up without being updated, the inventory becomes progressively less accurate and suggestions degrade.

---

## 8. Next Session Priorities (Recommended Order)

### Priority 1: Replace seeded inventory with real data
The 73 seeded placeholder items need to go. Plan:
1. Add a "Clear all inventory" button/confirmation in the UI (or a one-off seed-reset script)
2. Use photo capture and/or bulk import to enter real pantry/fridge items
3. Verify suggestion scoring works correctly before relying on it

### Priority 2: Inventory drift controls
Add `lastConfirmed DateTime?` to the `Item` model (new migration). Then:
- Surface "stale" badge on items not confirmed in 14+ days
- Quick confirm (tap to update `lastConfirmed`) and quick remove on inventory list
- "Needs confirmation" section at the top of `/inventory`
- After cooking ("I Made This"), prompt to review which ingredients were used up

### Priority 3: PWA basics
Add `public/manifest.json` and a minimal service worker that caches the grocery list for offline use. This makes the app usable in the grocery store without internet.

### Priority 4: Cost display honesty
In `app/api/suggest/route.ts`, only set `costPerServing` if at least half the recipe's required ingredients matched the cost map. Otherwise return `null` so the UI shows nothing instead of a misleading low number.

---

## 9. Key Technical Patterns

### API pattern
All routes: parse body with Zod → early return 400 on failure → Prisma operation → return JSON. See `app/api/recipes/route.ts` as the reference.

### Name normalization
Always use `normName()` from `lib/normalize.ts` when comparing ingredient names to inventory names. Stored names go through `normName()` at write time (the API normalizes before `upsert`/`create`). Test item names in E2E tests must use spaces not hyphens (hyphens get stripped by `normName`).

### Cost map pattern (used in suggest and stats)
```ts
const itemCostMap = new Map<string, number>();
for (const item of items) {
  const cost = item.batches[0]?.costCents ?? item.defaultCostCents ?? null;
  if (cost != null) itemCostMap.set(normName(item.name), cost);
}
```

### JSON array fields
`equipment`, `tags`, `seasons`, `substitutions` are stored as JSON strings in PostgreSQL (legacy from SQLite migration). Parse with `JSON.parse(value)` or use the `parseJsonArray()` helper in `lib/scoring.ts`. Not yet migrated to proper Postgres JSON columns — a future cleanup opportunity.

### Grocery list transaction
```ts
await prisma.$transaction([
  prisma.groceryItem.deleteMany({}),
  prisma.groceryItem.createMany({ data: [...] })
]);
```
The entire grocery list is wiped and recreated atomically — no partial states.

### E2E test patterns
- Dev server must be running (`npm run dev`) before `npm run test:e2e`
- `reuseExistingServer: true` in `playwright.config.ts`
- Item names in tests must not contain hyphens (normName converts them to spaces)
- Use `page.getByRole("cell", { name, exact: true })` not `getByText` when checking table row content — avoids ambiguity with modal dialogs that may contain the same text

---

## 10. Commands Reference

```bash
# Dev
npm run dev                          # Start development server on :3000

# Tests
npm run test:run                     # Run 142 unit tests (Vitest)
npm run test:e2e                     # Run 6 E2E tests (Playwright, requires dev server)

# Database
npx prisma migrate dev               # Apply pending migrations
npx prisma migrate dev --create-only --name <name>  # Create empty migration file
npx prisma generate                  # Regenerate Prisma client (after schema changes)
npx prisma studio                    # Browse DB at localhost:5555
npx prisma migrate reset             # Nuke and reseed (destructive)
npm run db:seed                      # Run seed.ts only

# Build
npm run build                        # Runs: prisma generate + migrate deploy + next build
```

---

## 11. User Context

- Single household, single user currently
- Windows 11, VS Code with integrated terminal
- Goal: reduce food waste, reduce decision fatigue around meals, grow cooking skills over time
- Values working software over theoretical perfection
- Comfortable with AI features when they add clear value
- Next immediate action before building new features: replace the 73 seeded inventory items with real pantry/fridge data

---

## 12. Repository

- GitHub: `gitagit/Kitchen-Manager` (private)
- Branch: `main`
- Last commit: `64b344e` — "Add E2E tests, DB constraints, security hardening, and cost metric"

---

*End of handoff document — supersedes HANDOFF-2_23.md*
