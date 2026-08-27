# Kitchen Manager — Project Handoff Document

**Generated:** February 23, 2026  
**Purpose:** Context transfer for continued development in Claude Code

---

## 1. Project Overview

### What We're Building
A personal kitchen management application with multiple interconnected goals:

1. **Inventory Tracking** — Maintain what ingredients, spices, and items are on hand, with batch/expiration tracking
2. **Recipe Suggestions** — Suggest recipes (familiar or new) based on available inventory, scored by fit
3. **Grocery Planning** — Optimize shopping with "ship online" vs "buy in-store" separation
4. **Skill Growth** — Track cooking techniques and suggest recipes that help the user grow as a chef
5. **Recipe Generation** (next to build) — Use Claude API to generate recipes based on current inventory

### Who It's For
A household (currently single-user) that wants to:
- Reduce food waste by using what they have
- Get dinner ideas without decision fatigue
- Gradually expand their cooking repertoire
- Streamline grocery shopping

---

## 2. Current Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Database | SQLite via Prisma ORM |
| Language | TypeScript |
| Styling | Minimal CSS (globals.css) |
| Validation | Zod |
| Runtime | Node.js |

### Why SQLite?
- Single-user/household app, no need for Postgres complexity
- File-based, easy to backup and reset
- Note: SQLite doesn't support enums or JSON fields natively, so we use strings with app-level validation

---

## 3. Project Structure

```
kitchen-manager-app/
├── app/
│   ├── api/
│   │   ├── _shared.ts          # Shared constants and Zod schemas
│   │   ├── cooklogs/route.ts   # POST cook log entries
│   │   ├── grocery/plan/route.ts
│   │   ├── inventory/
│   │   │   ├── items/route.ts  # GET/POST inventory items
│   │   │   └── import/route.ts # Bulk text import
│   │   ├── recipes/route.ts    # GET/POST recipes
│   │   ├── suggest/route.ts    # POST get scored suggestions
│   │   └── techniques/route.ts # GET/POST techniques
│   ├── grocery/                # Grocery list UI
│   ├── inventory/              # Inventory management UI
│   ├── recipes/                # Recipe CRUD UI
│   ├── suggest/                # Suggestion engine UI
│   ├── techniques/             # Skill tracking UI
│   ├── layout.tsx              # Nav and layout
│   ├── page.tsx                # Home page
│   └── globals.css
├── lib/
│   ├── db.ts                   # Prisma client singleton
│   ├── normalize.ts            # Name normalization (lowercase, trim)
│   └── scoring.ts              # Recipe scoring algorithm
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── seed.ts                 # Example seed data
│   └── dev.db                  # SQLite database file
└── package.json
```

---

## 4. Database Schema (Key Models)

### Item + ItemBatch
Tracks inventory with batch support (multiple purchases of same item with different expiration dates).

```
Item: id, name (unique), category, location, staple, parLevel, preferredBrand, notes
ItemBatch: id, itemId, quantityText, expiresOn, purchasedOn
```

### Recipe + RecipeIngredient
Recipes with metadata for filtering and scoring.

```
Recipe: id, title, servings, servingsMax, handsOnMin, totalMin, difficulty,
        source, sourceRef, cuisine, complexity, equipment (JSON string),
        tags (JSON string), seasons (JSON string), instructions

RecipeIngredient: id, recipeId, name, required, quantityText, preparation,
                  substitutions (JSON string)
```

### Technique + RecipeTechnique
Tracks cooking skills and links them to recipes.

```
Technique: id, name, description, difficulty (1-5), comfort (0-3)
           comfort: 0=untried, 1=learning, 2=comfortable, 3=confident

RecipeTechnique: recipeId, techniqueId (join table)
```

### CookLog
Tracks when recipes are cooked (exists in schema, no UI yet).

```
CookLog: id, recipeId, cookedOn, rating (1-5), notes, wouldRepeat, servedTo
```

### GroceryItem
Generated shopping lists.

```
GroceryItem: id, name, channel (SHIP/IN_PERSON/EITHER), quantityText, reason, priority, acquired
```

### String Constants (No Enums in SQLite)
Defined in `app/api/_shared.ts`:
- ItemCategories: PANTRY, SPICE, FROZEN, PRODUCE, MEAT, DAIRY, CONDIMENT, BAKING, BEVERAGE, OTHER
- ItemLocations: PANTRY, FRIDGE, FREEZER, COUNTER, OTHER
- GroceryChannels: SHIP, IN_PERSON, EITHER
- RecipeSources: PERSONAL, FAMILY, WEB, COOKBOOK, FRIEND
- Complexities: FAMILIAR, STRETCH, CHALLENGE

---

## 5. Scoring Algorithm (lib/scoring.ts)

The suggestion engine scores recipes based on multiple factors:

| Factor | Points | Description |
|--------|--------|-------------|
| Ingredient coverage | +60 max | % of required ingredients you have |
| Missing penalty | -12 each | Per missing required ingredient |
| Expiring bonus | +12 | Uses items expiring within 5 days |
| Must-use bonus | +8 each | Uses specifically requested ingredients |
| Time fit | +8 / -20 | Within or over time constraint |
| Equipment match | +8 / -25 | Has required equipment or not |
| Tag matching | +5 / -6 | Include/exclude tag filters |
| Season fit | +5 / -8 | Matches current season |
| Cuisine filter | +10 / -15 | Matches requested cuisine |
| Cuisine variety | +15 new, +8 old | Boosts cuisines not cooked recently |
| Complexity match | +8 / -5 | Matches requested difficulty |
| Technique growth | +6-15 | Boosts recipes teaching new techniques |
| Historical rating | ±6 | Based on past cook log ratings |
| Recency penalty | -6 | If made in last 14 days |

---

## 6. Current State

### What's Working
- ✅ Inventory CRUD with batch tracking
- ✅ Bulk inventory import from text
- ✅ Recipe CRUD with full metadata
- ✅ Technique tracking with comfort levels
- ✅ Suggestion engine with multi-factor scoring
- ✅ Grocery list generation (ship vs in-person)
- ✅ Example seed data (25 items, 4 recipes, 10 techniques)

### What's Seeded (Example Data Only)
The current data is **placeholder examples**, not real:
- Recipes are made-up (Chicken Tinga, Honey Dijon Salmon, Aglio e Olio, Beef & Broccoli)
- Inventory is generic staples
- User needs to enter their own real data

### What's Missing
- ❌ User preferences (dietary restrictions, dislikes, default equipment)
- ❌ Cook log UI (schema exists, no frontend)
- ❌ Inventory drift controls (staleness, confirmation)
- ❌ Recipe generation via Claude API
- ❌ Photo-based inventory capture
- ❌ Mobile app / PWA

---

## 7. Agreed Next Steps (Priority Order)

### 7.1 Recipe Generation (Hybrid Approach) — NEXT
**Goal:** Solve the cold-start problem of having no real recipes.

**Approach:**
- Add endpoint that sends current inventory + preferences to Claude API
- Claude generates 3-5 recipe ideas with ingredients, instructions, metadata
- User can "Save to my recipes" to persist good ones
- Over time, builds a personalized recipe library

**Why hybrid:** Generated recipes are tailored to actual inventory. Saved ones integrate with existing scoring system.

### 7.2 User Preferences
Add a preferences table and settings UI:
- Dietary restrictions (vegetarian, gluten-free, etc.)
- Allergies and hard excludes
- Disliked ingredients
- Default equipment available
- Time preferences (weeknight vs weekend defaults)
- Spice tolerance, protein goals

Wire these into both scoring algorithm and generation prompts.

### 7.3 Inventory Drift Controls
- Add `lastConfirmed` timestamp to items
- Surface "stale" items (not confirmed in X days)
- Quick confirm/remove UI
- "Use soon" section for expiring items

### 7.4 Cook Log UI (After-Cooking Flow)
- "I made this" button on recipes
- Auto-suggest inventory deductions based on recipe ingredients
- Capture rating, notes, would-repeat
- Use history to improve future suggestions

### 7.5 Photo-Based Inventory Capture (Later)
- Mobile camera integration
- Vision API (Claude vision or similar)
- Confirmation UI for extracted items
- Canonical name mapping

---

## 8. Design Principles

1. **Manual works first** — Always ensure manual entry is fast before automating
2. **Flexible data structures** — Quantities as freeform text, JSON arrays as strings
3. **Multi-factor scoring** — Balance practical (ingredients, time) with growth (techniques, variety)
4. **SQLite compatibility** — No enums or JSON fields; use strings with app validation
5. **Progressive enhancement** — Core features work without AI; AI adds convenience

---

## 9. Known Technical Decisions

### Why strings instead of enums?
SQLite doesn't support native enums. We define valid values in `_shared.ts` and validate with Zod.

### Why JSON arrays as strings?
SQLite doesn't support JSON fields. We store `["OVEN","STOVETOP"]` as a string and parse in TypeScript.

### Why ItemBatch separate from Item?
Handles real-world scenario: "I have 2 cans of chickpeas bought last week and 1 can bought today with different expiration dates."

### Why store techniques separately?
Allows tracking skill progression independent of recipes, and linking many recipes to same technique.

---

## 10. Commands Reference

```bash
# Install dependencies
npm install

# Initialize/reset database
npx prisma migrate dev --name init
npx prisma generate

# Seed example data
npm run db:seed

# Run dev server
npm run dev

# View database in browser
npx prisma studio

# Reset everything
npx prisma migrate reset
```

---

## 11. User Context

The user:
- Is setting this up on a fresh Windows PC
- Has VS Code with integrated terminal
- Wants to reduce food waste and decision fatigue around meals
- Is interested in growing cooking skills over time
- Values practical, working software over theoretical perfection
- Is open to photo-based capture and AI features when they add clear value

---

## 12. Files to Reference

When implementing new features, key files to understand:

| Feature Area | Key Files |
|--------------|-----------|
| API patterns | `app/api/recipes/route.ts`, `app/api/_shared.ts` |
| Scoring logic | `lib/scoring.ts` |
| UI patterns | `app/suggest/ui.tsx`, `app/recipes/ui.tsx` |
| Database | `prisma/schema.prisma` |
| Seed data examples | `prisma/seed.ts` |

---

## 13. Next Session Checklist

When starting in Claude Code:

1. [ ] Read this document for context
2. [ ] Review `prisma/schema.prisma` for current data model
3. [ ] Check `lib/scoring.ts` for suggestion logic
4. [ ] Implement recipe generation endpoint with Claude API
5. [ ] Add "Get Recipe Ideas" UI to the suggest page
6. [ ] Add save-to-recipes flow for generated recipes

---

*End of handoff document*
