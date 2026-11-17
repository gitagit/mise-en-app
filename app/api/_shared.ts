import { z } from "zod";
import { normName } from "@/lib/normalize";

// Valid values (SQLite doesn't support enums, so we validate in code)
export const ItemCategories = ["PANTRY", "SPICE", "SEAFOOD", "PRODUCE", "MEAT", "DAIRY", "CONDIMENT", "BAKING", "BEVERAGE", "PREPARED", "OTHER"] as const;
export const ItemLocations = ["PANTRY", "FRIDGE", "FREEZER", "COUNTER", "OTHER"] as const;
export const GroceryChannels = ["SHIP", "IN_PERSON", "EITHER"] as const;
export const RecipeSources = ["PERSONAL", "FAMILY", "WEB", "COOKBOOK", "FRIEND"] as const;
export const Complexities = ["FAMILIAR", "STRETCH", "CHALLENGE"] as const;
export const EquipmentOptions = [
  "OVEN", "STOVETOP", "INSTANT_POT", "AIR_FRYER", "GRILL",
  "MICROWAVE", "SLOW_COOKER", "FOOD_PROCESSOR", "STAND_MIXER",
  "BLENDER", "TOASTER_OVEN"
] as const;

export const ItemCategorySchema = z.enum(ItemCategories);
export const ItemLocationSchema = z.enum(ItemLocations);
export const GroceryChannelSchema = z.enum(GroceryChannels);

export const CreateItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: ItemCategorySchema,
  location: ItemLocationSchema,
  staple: z.boolean().optional(),
  parLevel: z.number().int().positive().optional(),
  defaultCostCents: z.number().int().nonnegative().optional()
});

export const CreateBatchSchema = z.object({
  itemId: z.string().min(1),
  quantityText: z.string().min(1).max(100),
  expiresOn: z.string().datetime().optional(),
  purchasedOn: z.string().datetime().optional(),
  costCents: z.number().int().nonnegative().optional()
});

export const UserPreferencesSchema = z.object({
  equipment: z.array(z.string()).optional(),
  defaultServings: z.number().int().positive().optional(),
  defaultMaxTimeMin: z.number().int().positive().optional(),
  dietaryTagsExclude: z.array(z.string()).optional(),
  cuisinesExclude: z.array(z.string()).optional(),
  defaultComplexity: z.enum(["FAMILIAR", "STRETCH", "CHALLENGE", "ANY"]).optional(),
  wantVariety: z.boolean().optional(),
  wantGrowth: z.boolean().optional(),
  showGamification: z.boolean().optional(),
  calorieGoal:  z.number().int().positive().nullable().optional(),
  proteinGoalG: z.number().int().positive().nullable().optional(),
  carbsGoalG:   z.number().int().positive().nullable().optional(),
  fatGoalG:     z.number().int().positive().nullable().optional(),
});

export const RecipeSchema = z.object({
  title: z.string().min(1).max(200),
  servings: z.number().int().positive().optional(),
  servingsMax: z.number().int().positive().optional(),
  handsOnMin: z.number().int().positive().optional(),
  totalMin: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  equipment: z.array(z.string().max(50)).max(20).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  seasons: z.array(z.string().max(20)).max(4).optional(),
  instructions: z.string().min(1).max(50000),
  ingredients: z.array(
    z.object({
      name: z.string().min(1).max(200),
      required: z.boolean().optional(),
      quantityText: z.string().max(100).optional(),
      preparation: z.string().max(200).optional(),
      substitutions: z.array(z.string().max(200)).max(10).optional()
    })
  ).min(1).max(100),

  // New fields
  source: z.enum(["PERSONAL", "FAMILY", "WEB", "COOKBOOK", "FRIEND"]).optional(),
  sourceRef: z.string().max(500).optional(),
  cuisine: z.string().max(100).optional(),
  complexity: z.enum(["FAMILIAR", "STRETCH", "CHALLENGE"]).optional(),
  techniques: z.array(z.string().max(100)).max(20).optional(),
  caloriesPerServing: z.number().int().positive().optional(),
  proteinG: z.number().int().nonnegative().optional(),
  carbsG: z.number().int().nonnegative().optional(),
  fatG: z.number().int().nonnegative().optional()
});

export const MealPlanSchema = z.object({
  date: z.string(), // ISO date string
  slot: z.enum(["breakfast", "lunch", "dinner"]),
  recipeId: z.string().optional(),
  notes: z.string().optional(),
  servings: z.number().int().positive().optional()
});

export function cleanName(name: string): string {
  return normName(name);
}
