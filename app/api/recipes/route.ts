import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normName } from "@/lib/normalize";
import { getAuthContext } from "@/lib/mobile-auth";
import { RecipeSchema } from "@/app/api/_shared";


const RECIPE_LIMIT = 200;

export async function GET(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: { workspaceId },
      orderBy: { title: "asc" },
      take: RECIPE_LIMIT,
      include: {
        ingredients: true,
        cookLogs: { orderBy: { cookedOn: "desc" } },
        techniques: { include: { technique: true } }
      }
    }),
    prisma.recipe.count({ where: { workspaceId } })
  ]);

  return NextResponse.json({ recipes, total, truncated: total > RECIPE_LIMIT });
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = RecipeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const r = parsed.data;

  // Handle techniques: find or create each one
  const techniqueConnections: { techniqueId: string }[] = [];
  if (r.techniques?.length) {
    for (const techName of r.techniques) {
      const normalized = normName(techName);
      const technique = await prisma.technique.upsert({
        where: { workspaceId_name: { workspaceId, name: normalized } },
        update: {},
        create: { workspaceId, name: normalized, comfort: 0 }
      });
      techniqueConnections.push({ techniqueId: technique.id });
    }
  }

  const created = await prisma.recipe.upsert({
    where: { workspaceId_title: { workspaceId, title: r.title.trim() } },
    update: {
      servings: r.servings ?? undefined,
      servingsMax: r.servingsMax ?? undefined,
      handsOnMin: r.handsOnMin ?? undefined,
      totalMin: r.totalMin ?? undefined,
      difficulty: r.difficulty ?? undefined,
      equipment: r.equipment ?? undefined,
      tags: r.tags ?? undefined,
      seasons: r.seasons ?? undefined,
      instructions: r.instructions,
      source: r.source ?? undefined,
      sourceRef: r.sourceRef ?? undefined,
      cuisine: r.cuisine ?? undefined,
      complexity: r.complexity ?? undefined,
      caloriesPerServing: r.caloriesPerServing ?? undefined,
      proteinG: r.proteinG ?? undefined,
      carbsG: r.carbsG ?? undefined,
      fatG: r.fatG ?? undefined,
      ingredients: {
        deleteMany: {},
        create: r.ingredients.map((i) => ({
          name: i.name,
          required: i.required ?? true,
          quantityText: i.quantityText ?? null,
          preparation: i.preparation ?? null,
          substitutions: i.substitutions ?? []
        }))
      },
      techniques: {
        deleteMany: {},
        create: techniqueConnections
      }
    },
    create: {
      workspaceId,
      title: r.title.trim(),
      servings: r.servings ?? 2,
      servingsMax: r.servingsMax ?? null,
      handsOnMin: r.handsOnMin ?? 15,
      totalMin: r.totalMin ?? 30,
      difficulty: r.difficulty ?? 2,
      equipment: r.equipment ?? [],
      tags: r.tags ?? [],
      seasons: r.seasons ?? [],
      instructions: r.instructions,
      source: r.source ?? "PERSONAL",
      sourceRef: r.sourceRef ?? null,
      cuisine: r.cuisine ?? null,
      complexity: r.complexity ?? "FAMILIAR",
      caloriesPerServing: r.caloriesPerServing ?? null,
      proteinG: r.proteinG ?? null,
      carbsG: r.carbsG ?? null,
      fatG: r.fatG ?? null,
      ingredients: {
        create: r.ingredients.map((i) => ({
          name: i.name,
          required: i.required ?? true,
          quantityText: i.quantityText ?? null,
          preparation: i.preparation ?? null,
          substitutions: i.substitutions ?? []
        }))
      },
      techniques: {
        create: techniqueConnections
      }
    }
  });

  return NextResponse.json({ recipe: created });
}

export async function PUT(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const body = await req.json();

  const UpdateSchema = RecipeSchema.extend({
    id: z.string().min(1),
    note: z.string().optional(),
  });

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id, note, ...r } = parsed.data;

  // Fetch existing recipe to detect changes and verify workspace ownership
  const existing = await prisma.recipe.findUnique({
    where: { id },
    include: { ingredients: true }
  });
  if (!existing || existing.workspaceId !== workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Handle techniques: find or create each one
  const techniqueConnections: { techniqueId: string }[] = [];
  if (r.techniques?.length) {
    for (const techName of r.techniques) {
      const normalized = normName(techName);
      const technique = await prisma.technique.upsert({
        where: { workspaceId_name: { workspaceId, name: normalized } },
        update: {},
        create: { workspaceId, name: normalized, comfort: 0 }
      });
      techniqueConnections.push({ techniqueId: technique.id });
    }
  }

  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      title: r.title.trim(),
      servings: r.servings ?? undefined,
      servingsMax: r.servingsMax ?? undefined,
      handsOnMin: r.handsOnMin ?? undefined,
      totalMin: r.totalMin ?? undefined,
      difficulty: r.difficulty ?? undefined,
      equipment: r.equipment ?? undefined,
      tags: r.tags ?? undefined,
      seasons: r.seasons ?? undefined,
      instructions: r.instructions,
      source: r.source ?? undefined,
      sourceRef: r.sourceRef ?? undefined,
      cuisine: r.cuisine ?? undefined,
      complexity: r.complexity ?? undefined,
      caloriesPerServing: r.caloriesPerServing ?? undefined,
      proteinG: r.proteinG ?? undefined,
      carbsG: r.carbsG ?? undefined,
      fatG: r.fatG ?? undefined,
      ingredients: {
        deleteMany: {},
        create: r.ingredients.map((i) => ({
          name: i.name,
          required: i.required ?? true,
          quantityText: i.quantityText ?? null,
          preparation: i.preparation ?? null,
          substitutions: i.substitutions ?? []
        }))
      },
      techniques: {
        deleteMany: {},
        create: techniqueConnections
      }
    }
  });

  // Detect changed fields and create edit log
  const changed: string[] = [];
  if (existing.title !== r.title.trim()) changed.push("title");
  if (existing.instructions !== r.instructions) changed.push("instructions");
  if (existing.servings !== (r.servings ?? existing.servings)) changed.push("servings");
  if (existing.totalMin !== (r.totalMin ?? existing.totalMin)) changed.push("totalMin");
  if (existing.handsOnMin !== (r.handsOnMin ?? existing.handsOnMin)) changed.push("handsOnMin");
  if (existing.difficulty !== (r.difficulty ?? existing.difficulty)) changed.push("difficulty");

  const ingKey = (i: { name: string; quantityText?: string | null }) =>
    `${i.name}|${i.quantityText ?? ""}`;
  const oldIngs = existing.ingredients.map(ingKey).sort().join("\n");
  const newIngs = r.ingredients.map(ingKey).sort().join("\n");
  if (oldIngs !== newIngs) changed.push("ingredients");

  if (changed.length > 0 || note) {
    await prisma.recipeEditLog.create({
      data: {
        recipeId: id,
        changedFields: changed,
        note: note ?? null,
      }
    });
  }

  return NextResponse.json({ recipe: updated });
}

export async function PATCH(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const body = await req.json();
  const { id, favorite } = body;
  if (!id || typeof favorite !== "boolean") {
    return NextResponse.json({ error: "id and favorite (boolean) required" }, { status: 400 });
  }

  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.recipe.update({
    where: { id },
    data: { favorite },
  });

  return NextResponse.json({ recipe: updated });
}

export async function DELETE(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Verify the recipe belongs to this workspace before deleting
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing || existing.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.recipeIngredient.deleteMany({ where: { recipeId: id } }),
    prisma.cookLog.deleteMany({ where: { recipeId: id } }),
    prisma.recipeTechnique.deleteMany({ where: { recipeId: id } }),
    prisma.recipe.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
