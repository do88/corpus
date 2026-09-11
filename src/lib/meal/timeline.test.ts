import { describe, expect, it } from "vitest";
import { timelineOrder } from "./timeline";

const meal = (id: string, logged_at: string) => ({ id, logged_at });

describe("timelineOrder", () => {
  it("puts a meal whose time was edited earlier where its new time says", () => {
    // The bug: the shake was logged last, then corrected to 07:30. It sat at
    // the top because the list trusted arrival order.
    const day = [
      meal("toast", "2026-09-11T08:15:00+00:00"),
      meal("eggs", "2026-09-11T09:40:00+00:00"),
      meal("shake", "2026-09-11T06:30:00+00:00"), // edited, still last in the array
    ];
    expect(timelineOrder(day).map((m) => m.id)).toEqual(["eggs", "toast", "shake"]);
  });

  it("compares instants, so a phone's Z and the database's +00:00 agree", () => {
    const day = [
      meal("from-db", "2026-09-11T08:00:00+00:00"),
      meal("from-phone", "2026-09-11T08:30:00.000Z"),
    ];
    expect(timelineOrder(day).map((m) => m.id)).toEqual(["from-phone", "from-db"]);
  });

  it("keeps two meals from the same second in a stable order", () => {
    const at = "2026-09-11T12:00:00+00:00";
    const once = timelineOrder([meal("b", at), meal("a", at)]).map((m) => m.id);
    const again = timelineOrder([meal("a", at), meal("b", at)]).map((m) => m.id);
    expect(once).toEqual(again);
  });

  it("leaves the input alone, because it is React state", () => {
    const day = [meal("a", "2026-09-11T06:00:00Z"), meal("b", "2026-09-11T07:00:00Z")];
    timelineOrder(day);
    expect(day.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
