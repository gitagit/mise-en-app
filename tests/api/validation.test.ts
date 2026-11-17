import { describe, it, expect } from 'vitest';
import {
  CreateItemSchema, CreateBatchSchema, ItemCategorySchema, ItemLocationSchema,
  RecipeSchema, MealPlanSchema,
} from "@/app/api/_shared";

describe('Item Schema Validation', () => {
  describe('CreateItemSchema', () => {
    it('accepts valid item data', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Canned Chickpeas',
        category: 'PANTRY',
        location: 'PANTRY'
      });
      expect(result.success).toBe(true);
    });

    it('accepts item with all optional fields', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Rice',
        category: 'PANTRY',
        location: 'PANTRY',
        staple: true,
        parLevel: 2,
        defaultCostCents: 499
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = CreateItemSchema.safeParse({
        name: '',
        category: 'PANTRY',
        location: 'PANTRY'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid category', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Test',
        category: 'INVALID',
        location: 'PANTRY'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid location', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Test',
        category: 'PANTRY',
        location: 'BASEMENT'
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative cost', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Test',
        category: 'PANTRY',
        location: 'PANTRY',
        defaultCostCents: -100
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer parLevel', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Test',
        category: 'PANTRY',
        location: 'PANTRY',
        parLevel: 2.5
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero parLevel', () => {
      const result = CreateItemSchema.safeParse({
        name: 'Test',
        category: 'PANTRY',
        location: 'PANTRY',
        parLevel: 0
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateBatchSchema', () => {
    it('accepts valid batch data', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: 'abc123',
        quantityText: '2 cans'
      });
      expect(result.success).toBe(true);
    });

    it('accepts batch with expiration', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: 'abc123',
        quantityText: '1 lb',
        expiresOn: '2025-06-15T00:00:00.000Z'
      });
      expect(result.success).toBe(true);
    });

    it('accepts batch with cost', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: 'abc123',
        quantityText: '500g',
        costCents: 599
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty itemId', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: '',
        quantityText: '2 cans'
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty quantityText', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: 'abc123',
        quantityText: ''
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid datetime format', () => {
      const result = CreateBatchSchema.safeParse({
        itemId: 'abc123',
        quantityText: '1 lb',
        expiresOn: 'not-a-date'
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Recipe Schema Validation', () => {
  it('accepts minimal valid recipe', () => {
    const result = RecipeSchema.safeParse({
      title: 'Pasta',
      instructions: 'Boil pasta',
      ingredients: [{ name: 'pasta' }]
    });
    expect(result.success).toBe(true);
  });

  it('accepts full recipe', () => {
    const result = RecipeSchema.safeParse({
      title: 'Chicken Stir Fry',
      servings: 4,
      handsOnMin: 20,
      totalMin: 30,
      difficulty: 2,
      instructions: 'Step 1...',
      ingredients: [
        { name: 'chicken', required: true, quantityText: '1 lb' },
        { name: 'soy sauce', required: true, quantityText: '2 tbsp' },
        { name: 'ginger', required: false, preparation: 'minced', substitutions: ['galangal'] }
      ],
      source: 'PERSONAL',
      cuisine: 'Chinese',
      complexity: 'FAMILIAR'
    });
    expect(result.success).toBe(true);
  });

  it('rejects recipe without title', () => {
    const result = RecipeSchema.safeParse({
      title: '',
      instructions: 'Cook it',
      ingredients: [{ name: 'stuff' }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects recipe without ingredients', () => {
    const result = RecipeSchema.safeParse({
      title: 'Empty Recipe',
      instructions: 'Nothing to do',
      ingredients: []
    });
    expect(result.success).toBe(false);
  });

  it('rejects recipe with invalid difficulty', () => {
    const result = RecipeSchema.safeParse({
      title: 'Test',
      instructions: 'Test',
      ingredients: [{ name: 'test' }],
      difficulty: 10
    });
    expect(result.success).toBe(false);
  });

  it('rejects recipe with invalid source', () => {
    const result = RecipeSchema.safeParse({
      title: 'Test',
      instructions: 'Test',
      ingredients: [{ name: 'test' }],
      source: 'INTERNET'
    });
    expect(result.success).toBe(false);
  });
});

describe('MealPlan Schema Validation', () => {
  it('accepts valid meal plan', () => {
    const result = MealPlanSchema.safeParse({
      date: '2025-01-28',
      slot: 'dinner',
      recipeId: 'recipe123'
    });
    expect(result.success).toBe(true);
  });

  it('accepts meal plan with notes only', () => {
    const result = MealPlanSchema.safeParse({
      date: '2025-01-28',
      slot: 'lunch',
      notes: 'Eating out'
    });
    expect(result.success).toBe(true);
  });

  it('accepts meal plan with servings', () => {
    const result = MealPlanSchema.safeParse({
      date: '2025-01-28',
      slot: 'dinner',
      recipeId: 'recipe123',
      servings: 6
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid slot', () => {
    const result = MealPlanSchema.safeParse({
      date: '2025-01-28',
      slot: 'brunch'
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero servings', () => {
    const result = MealPlanSchema.safeParse({
      date: '2025-01-28',
      slot: 'dinner',
      servings: 0
    });
    expect(result.success).toBe(false);
  });
});
