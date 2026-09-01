import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateFromSaved, saveFoodFromMeal, type SavedFoodRow } from "./saved";
import type { MealItem } from "../meal/schema";

const shake: MealItem = {
  name: "Whey protein shake",
  qty: "1 scoop (30g) with 250ml semi-skimmed milk",
  kcal: 240,
  protein_g: 33,
  carbs_g: 14,
  fat_g: 6,
};

const banana: MealItem = {
  name: "Banana",
  qty: "1 medium (118g)",
  kcal: 105,
  protein_g: 1,
  carbs_g: 27,
  fat_g: 0,
};

const saved = (over: Partial<SavedFoodRow> = {}): SavedFoodRow => ({
  id: "saved-1",
  name: "Morning shake",
  items: [shake],
  kcal: 240,
  protein_g: 33,
  carbs_g: 14,
  fat_g: 6,
  assumptions: "One 30g scoop in 250ml semi-skimmed milk.",
  source_meal_id: "meal-1",
  times_used: 12,
  last_used_at: null,
  archived_at: null,
  created_at: "2026-09-01T08:00:00.000Z",
  ...over,
});

describe("estimateFromSaved", () => {
  it("replays the exact numbers rather than producing new ones", () => {
    // The whole reason the table exists. If this ever returns something other
    // than what was stored, a repeated meal has become an estimate again and
    // the day's totals drift for no reason the user can see.
    const estimate = estimateFromSaved(saved());
    expect(estimate.kcal).toBe(240);
    expect(estimate.protein_g).toBe(33);
    expect(estimate.items[0]).toMatchObject({ name: "Whey protein shake", kcal: 240 });
  });

  it("is high confidence, because a person already checked it", () => {
    expect(estimateFromSaved(saved()).confidence).toBe("high");
  });

  it("keeps the assumption sentence from the estimate it came from", () => {
    // It is the line you read when the number looks wrong a month later.
    expect(estimateFromSaved(saved()).assumptions).toContain("30g scoop");
  });

  it("explains itself when the original estimate had no assumptions", () => {
    expect(estimateFromSaved(saved({ assumptions: null })).assumptions).toContain(
      "Morning shake",
    );
  });

  it("scales the line items, then re-derives the totals from them", () => {
    // Not the same as scaling the totals. Scaling the totals leaves the items
    // showing single portions beside a doubled figure, which is a card that
    // contradicts itself — the exact thing `totalsFor` exists to prevent.
    const estimate = estimateFromSaved(saved({ items: [shake, banana] }), 2);
    expect(estimate.items.map((item) => item.kcal)).toEqual([480, 210]);
    expect(estimate.kcal).toBe(690);
    expect(estimate.protein_g).toBe(68);
  });

  it("says how many, in the portion line", () => {
    const [item] = estimateFromSaved(saved(), 2).items;
    expect(item.qty).toContain("2 ×");
  });

  it("leaves the portion line alone for a single one", () => {
    expect(estimateFromSaved(saved()).items[0].qty).toBe(shake.qty);
  });
});

describe("saveFoodFromMeal", () => {
  function clientReturning(result: { data?: unknown; error?: unknown }) {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    return {
      client: { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient,
      insert,
    };
  }

  const meal = {
    id: "meal-1",
    items: [shake, banana],
    assumptions: "A scoop in milk, and a medium banana.",
  };

  it("recomputes the totals for a subset instead of inheriting the meal's", () => {
    // Saving one line out of three must not carry the whole meal's calories.
    const { client, insert } = clientReturning({ data: saved(), error: null });
    void saveFoodFromMeal(client, meal, { name: "Morning shake", items: [shake] });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: 240, protein_g: 33, items: [shake] }),
    );
  });

  it("saves the whole meal when no subset is named", () => {
    const { client, insert } = clientReturning({ data: saved(), error: null });
    void saveFoodFromMeal(client, meal, { name: "Shake and a banana" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kcal: 345 }));
  });

  it("trims the name, so two spellings of one thing are one entry", () => {
    const { client, insert } = clientReturning({ data: saved(), error: null });
    void saveFoodFromMeal(client, meal, { name: "  Morning shake  " });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Morning shake" }));
  });

  it("records which meal it came from", () => {
    const { client, insert } = clientReturning({ data: saved(), error: null });
    void saveFoodFromMeal(client, meal, { name: "Morning shake" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_meal_id: "meal-1" }),
    );
  });

  it("turns a duplicate name into something a person can act on", () => {
    const { client } = clientReturning({ data: null, error: { code: "23505" } });
    return expect(
      saveFoodFromMeal(client, meal, { name: "Morning shake" }),
    ).rejects.toThrow(/already have one saved by that name/i);
  });

  it("refuses to save a meal with nothing in it", async () => {
    const { client, insert } = clientReturning({ data: null, error: null });
    await expect(
      saveFoodFromMeal(client, { id: "m", items: null, assumptions: null }, { name: "Empty" }),
    ).rejects.toThrow(/nothing to save/i);
    expect(insert).not.toHaveBeenCalled();
  });
});
