import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/mobile-auth";
import { MealPlanSchema } from "@/app/api/_shared";


export async function GET(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  const where: { workspaceId: string; date?: { gte?: Date; lte?: Date } } = { workspaceId };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }

  const plans = await prisma.mealPlan.findMany({
    where,
    orderBy: [{ date: "asc" }, { slot: "asc" }],
    include: {
      recipe: {
        select: {
          title: true,
          servings: true,
          caloriesPerServing: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        }
      }
    }
  });

  return NextResponse.json({ plans });
}

export async function POST(req: Request) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = MealPlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, slot, recipeId, notes, servings } = parsed.data;
  const dateObj = new Date(date);

  // Upsert: update if exists for this workspace+date+slot, otherwise create
  const plan = await prisma.mealPlan.upsert({
    where: {
      workspaceId_date_slot: { workspaceId, date: dateObj, slot }
    },
    update: {
      recipeId: recipeId || null,
      notes: notes || null,
      servings: servings || null
    },
    create: {
      workspaceId,
      date: dateObj,
      slot,
      recipeId: recipeId || null,
      notes: notes || null,
      servings: servings || null
    }
  });

  return NextResponse.json({ plan });
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

  // Verify the meal plan entry belongs to this workspace before deleting
  const existing = await prisma.mealPlan.findUnique({ where: { id } });
  if (!existing || existing.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mealPlan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
