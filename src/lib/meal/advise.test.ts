import { describe, expect, it } from "vitest";
import { looksLikeAnOption } from "./advise";

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
