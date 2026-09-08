import { describe, expect, it } from "vitest";
import { planCompaction, type AdvisorTurn } from "./thread";

const turn = (id: string, role: AdvisorTurn["role"], minute: number): AdvisorTurn => ({
  id,
  role,
  text: id,
  advice: null,
  created_at: `2026-09-08T10:${String(minute).padStart(2, "0")}:00Z`,
});

/** `n` spoken turns, alternating, oldest first. */
const thread = (n: number, from = 0): AdvisorTurn[] =>
  Array.from({ length: n }, (_, i) =>
    turn(`t${from + i}`, i % 2 === 0 ? "user" : "model", from + i),
  );

describe("planCompaction", () => {
  it("does nothing to a thread short enough to keep whole", () => {
    expect(planCompaction(thread(4), 20)).toBeNull();
    expect(planCompaction(thread(20), 20)).toBeNull();
  });

  it("folds everything past the last few turns", () => {
    const plan = planCompaction(thread(24), 20);
    expect(plan?.fold.map((t) => t.id)).toEqual(["t0", "t1", "t2", "t3"]);
    expect(plan?.keep).toHaveLength(20);
  });

  it("folds an existing summary back in, so the head stays one paragraph", () => {
    // A summary is not a spoken turn, so it never counts toward what is kept
    // and is always part of the next fold.
    const turns = [turn("s0", "summary", 0), ...thread(24, 1)];
    const plan = planCompaction(turns, 20);
    expect(plan?.fold[0].role).toBe("summary");
    expect(plan?.keep.every((t) => t.role !== "summary")).toBe(true);
  });

  it("leaves a thread of only a summary alone", () => {
    expect(planCompaction([turn("s0", "summary", 0)], 20)).toBeNull();
  });
});
