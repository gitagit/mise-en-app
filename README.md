# Kitchen Manager

A kitchen management app for tracking inventory, finding recipes based on what you have,
planning grocery runs, and growing your cooking skills over time.

**Live:** [mise-en-app.vercel.app](https://mise-en-app.vercel.app) &nbsp;| &nbsp;**Stack:** Next.js 15 - TypeScript - Prisma - PostgreSQL - NextAuth - Claude API

<!-- SCREENSHOT -->

## Features

- **Inventory tracking** — Manage pantry, fridge, and freezer items with batch/expiration tracking
- **Recipe management** — Store recipes with cuisine, source, techniques, and complexity ratings
- **Smart suggestions** — Get dinner ideas scored by ingredient coverage, expiring items, cuisine variety, and skill growth opportunities
- **Grocery planning** — Generate shopping lists split into "ship" (online) vs "in-person" (fresh items)
- **Skill tracking** — Monitor cooking techniques and get suggestions to help you grow

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (requires a PostgreSQL database)
cp .env.example .env   # then fill in DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET

# 3. Initialize database
npx prisma migrate dev --name init
npx prisma generate

# 4. (Optional) Seed with example data
npm run db:seed

# 5. Run dev server
npm run dev
```

Open http://localhost:3000

## Pages

| Page | Description |
|------|-------------|
| `/` | Home — overview and getting started |
| `/inventory` | Manage what's in your kitchen |
| `/recipes` | Add and view recipes |
| `/suggest` | Get dinner suggestions based on constraints |
| `/grocery` | Generate shopping lists |
| `/techniques` | Track your cooking skills |

## API Endpoints

- `GET/POST /api/inventory/items` — List/add inventory items
- `POST /api/inventory/import` — Bulk import from rough text
- `GET/POST /api/recipes` — List/add recipes
- `POST /api/suggest` — Get scored recipe suggestions
- `POST /api/grocery/plan` — Generate grocery list
- `POST /api/cooklogs` — Log when you cook a recipe
- `GET/POST /api/techniques` — Manage cooking techniques

## Suggestion Scoring

The `/api/suggest` endpoint scores recipes based on:

- **Ingredient coverage** (60 pts max) — Do you have what's needed?
- **Missing penalty** (-12 per missing item) — Fewer missing = better
- **Expiring bonus** (+12) — Uses items about to expire
- **Time fit** (+8 within time, penalty for over)
- **Equipment match** (+8 if you have required equipment)
- **Tag matching** (+5/-6 for include/exclude tags)
- **Cuisine variety** (+15 for new cuisine, +8 if >3 weeks since last)
- **Technique growth** (+6-15 for learning opportunities)
- **Historical rating** (boost for highly-rated recipes)
- **Recency penalty** (-6 if made in last 2 weeks)

## Data Model Highlights

- **Item + ItemBatch** — Tracks multiple batches of the same item (different purchase/expiry dates)
- **Recipe** — Includes `cuisine`, `source`, `complexity`, `servingsMax` (for scalable recipes)
- **Technique** — Tracks difficulty and your comfort level (untried → learning → comfortable → confident)
- **RecipeTechnique** — Links recipes to techniques they teach

## Deployment

Production runs on **Vercel** at [mise-en-app.vercel.app](https://mise-en-app.vercel.app).
The Vercel project is named `mise-en-place` for historical reasons; the production
domain is `mise-en-app.vercel.app`.

To link the Vercel CLI to the correct project after a fresh clone:

```bash
vercel link --project mise-en-place
```

Do **not** run `vercel link` without `--project` — it may auto-detect an incorrect project.

Required Vercel environment variables (set under project Settings → Environment Variables):

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Neon PostgreSQL pooled connection string |
| `DIRECT_URL` | Neon PostgreSQL direct connection string (required by Prisma) |
| `NEXTAUTH_SECRET` | 32-byte base64 secret (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `NEXTAUTH_URL` | Production base URL (e.g. `https://mise-en-app.vercel.app`) |
| `ANTHROPIC_API_KEY` | For AI generate / inventory scan features |
| `NEXT_PUBLIC_BASE_URL` | Same as `NEXTAUTH_URL` |

## Future Ideas

- Meal planning calendar
- Recipe import from URLs
- Barcode scanning for inventory
- Cost tracking per meal
- Nutrition data
- Integration with grocery delivery APIs
