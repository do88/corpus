import { describe, expect, it } from "vitest";
import { dayOf, instantOf, intOf, minutesOf, toDaily, toSleep } from "./convert";
import { measuredMaintenance } from "./repository";

describe("dayOf", () => {
  it("takes the date off a SQLAlchemy midnight", () => {
    expect(dayOf("2026-09-01 00:00:00.000000")).toBe("2026-09-01");
  });
  it("accepts a bare date", () => {
    expect(dayOf("2026-09-01")).toBe("2026-09-01");
  });
  it("is null for nothing and for junk", () => {
    expect(dayOf(null)).toBeNull();
    expect(dayOf("yesterday")).toBeNull();
  });
});

describe("minutesOf", () => {
  it("turns a duration into whole minutes, rounding the seconds", () => {
    expect(minutesOf("01:05:30")).toBe(66);
    expect(minutesOf("00:20:00.000000")).toBe(20);
  });
  it("keeps GarminDB's time.min default as zero rather than null", () => {
    // The library writes 00:00:00 for "no value"; a zero says as much as a
    // null here and keeps the column non-null like the source.
    expect(minutesOf("00:00:00")).toBe(0);
  });
  it("is null for a missing or unparseable value", () => {
    expect(minutesOf(null)).toBeNull();
    expect(minutesOf("7h")).toBeNull();
  });
});

describe("instantOf", () => {
  it("reads a SQLAlchemy datetime", () => {
    expect(instantOf("2026-09-01 23:12:00.000000")).toMatch(/^2026-09-0[12]T/);
  });
  it("is null for rubbish", () => {
    expect(instantOf("last night")).toBeNull();
  });
});

describe("intOf", () => {
  it("rounds, and refuses non-numbers", () => {
    expect(intOf("64.6")).toBe(65);
    expect(intOf("")).toBeNull();
    expect(intOf("n/a")).toBeNull();
  });
});

describe("toDaily", () => {
  it("maps a daily_summary row onto garmin_daily", () => {
    const row = toDaily({
      day: "2026-09-01 00:00:00.000000",
      rhr: 52,
      steps: 9421,
      calories_total: 2710,
      calories_bmr: 1790,
      calories_active: 920,
      moderate_activity_time: "00:35:00.000000",
      vigorous_activity_time: "00:12:30.000000",
      bb_max: 88,
      bb_min: 21,
    });
    expect(row).toMatchObject({
      day: "2026-09-01",
      resting_hr: 52,
      calories_total: 2710,
      moderate_min: 35,
      vigorous_min: 13,
      body_battery_max: 88,
    });
  });
  it("drops a row with no day rather than inventing one", () => {
    expect(toDaily({ rhr: 50 })).toBeNull();
  });
});

describe("toSleep", () => {
  it("maps a sleep row with durations in minutes", () => {
    const row = toSleep({
      day: "2026-09-02 00:00:00.000000",
      start: "2026-09-01 23:10:00.000000",
      end: "2026-09-02 06:40:00.000000",
      total_sleep: "07:30:00.000000",
      deep_sleep: "01:20:00.000000",
      score: 81,
      qualifier: "Good",
    });
    expect(row).toMatchObject({ day: "2026-09-02", total_min: 450, deep_min: 80, score: 81 });
    expect(row?.start_at).toMatch(/^2026-09-01T/);
  });
});

describe("measuredMaintenance", () => {
  const days = (...kcal: (number | null)[]) => kcal.map((calories_total) => ({ calories_total }));

  it("averages the days that have a figure", () => {
    expect(measuredMaintenance(days(2600, 2700, 2800, 2500, 2900))).toEqual({ kcal: 2700, days: 5 });
  });
  it("ignores a hard zero, which is a watch on the bedside table", () => {
    expect(measuredMaintenance(days(2600, 0, 2700, 2800, 2500, 2900))).toEqual({ kcal: 2700, days: 5 });
  });
  it("refuses to call two days a maintenance figure", () => {
    expect(measuredMaintenance(days(2600, 2700))).toBeNull();
  });
  it("is null with nothing recorded", () => {
    expect(measuredMaintenance([])).toBeNull();
    expect(measuredMaintenance(days(null, null))).toBeNull();
  });
});
