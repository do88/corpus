import { describe, expect, it } from "vitest";
import { claimedFood, looksLikeAnOption } from "./advise";

const OPTIONS = "a tin of mackerel, two bits of toast with peanut butter, or a protein yoghurt";

describe("looksLikeAnOption", () => {
  it("accepts a pick taken from the list", () => {
    expect(looksLikeAnOption("A tin of mackerel", OPTIONS)).toBe(true);
    expect(looksLikeAnOption("the protein yoghurt", OPTIONS)).toBe(true);
    expect(looksLikeAnOption("two bits of toast with peanut butter", OPTIONS)).toBe(true);
  });

  it("rejects a food that was never offered", () => {
    // The failure mode this whole guard exists for: the advice everybody
    // already has, about food that is not in the house.
    expect(looksLikeAnOption("Greek yoghurt with berries and a handful of almonds", OPTIONS)).toBe(
      false,
    );
    expect(looksLikeAnOption("grilled chicken breast and broccoli", OPTIONS)).toBe(false);
  });

  it("survives a single distinctive word", () => {
    // "the mackerel" is a legitimate pick even though only one word carries.
    expect(looksLikeAnOption("the mackerel", OPTIONS)).toBe(true);
  });

  it("does not accept an empty pick", () => {
    expect(looksLikeAnOption("", OPTIONS)).toBe(false);
  });
});

describe("claimedFood", () => {
  const base = { pick: "Thai-style traybake" };

  it("checks the ingredients when the dish has a name of its own", () => {
    // The pick alone would fail: not one of its words was ever offered.
    const advice = { ...base, ingredients: ["chicken thighs", "red pepper", "broccoli"] };
    expect(looksLikeAnOption(claimedFood(advice), OPTIONS)).toBe(false);
    expect(
      looksLikeAnOption(claimedFood(advice), "chicken thighs, a red pepper, broccoli, soy sauce"),
    ).toBe(true);
  });

  it("tolerates one thing that was never mentioned", () => {
    // A splash of oil should not fail an otherwise honest dish.
    const advice = { ...base, ingredients: ["chicken thighs", "broccoli", "olive oil"] };
    expect(looksLikeAnOption(claimedFood(advice), "chicken thighs and broccoli")).toBe(true);
  });

  it("still catches a dish made of food they do not have", () => {
    const advice = { ...base, ingredients: ["salmon fillet", "asparagus", "new potatoes"] };
    expect(looksLikeAnOption(claimedFood(advice), "chicken thighs and broccoli")).toBe(false);
  });

  it("falls back to the pick for a single food", () => {
    expect(claimedFood({ pick: "A tin of mackerel" })).toBe("A tin of mackerel");
  });
});
