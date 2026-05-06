import { describe, it, expect } from "vitest";
import { applyFilters, isDefaultFilters, DEFAULT_FILTERS } from "./filterStates";
import type { StateRisk } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function make(overrides: Partial<StateRisk> = {}): StateRisk {
  return {
    state_code: "XX",
    state_name: "Test State",
    fema_region: 1,
    final_risk_score: 50,
    disaster_count_score: 50,
    recent_activity_score: 50,
    hurricane_exposure_score: 50,
    spending_gap_score: null,
    explanation: null,
    total_declarations: 100,
    major_disaster_declarations: 80,
    emergency_declarations: 10,
    hurricane_count: 5,
    flood_count: 10,
    fire_count: 3,
    severe_storm_count: 20,
    tornado_count: 8,
    declarations_last_5_years: 15,
    declarations_last_10_years: 30,
    most_recent_disaster_year: 2023,
    ...overrides,
  };
}

// Three well-differentiated states
const FL = make({
  state_code: "FL", fema_region: 4,
  hurricane_count: 30, flood_count: 15, fire_count: 2,
  severe_storm_count: 10, tornado_count: 5,
  major_disaster_declarations: 200, emergency_declarations: 20,
  declarations_last_5_years: 40, declarations_last_10_years: 80,
});

const AK = make({
  state_code: "AK", fema_region: 10,
  hurricane_count: 0, flood_count: 0, fire_count: 5,
  severe_storm_count: 0, tornado_count: 0,
  major_disaster_declarations: 30, emergency_declarations: 0,
  declarations_last_5_years: 0, declarations_last_10_years: 5,
});

const TX = make({
  state_code: "TX", fema_region: 6,
  hurricane_count: 15, flood_count: 20, fire_count: 8,
  severe_storm_count: 25, tornado_count: 30,
  major_disaster_declarations: 180, emergency_declarations: 15,
  declarations_last_5_years: 25, declarations_last_10_years: 50,
});

const ALL = [FL, AK, TX];

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe("applyFilters — no filter", () => {
  it("returns all states with DEFAULT_FILTERS", () => {
    expect(applyFilters(ALL, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it("handles empty array", () => {
    expect(applyFilters([], DEFAULT_FILTERS)).toHaveLength(0);
  });
});

describe("applyFilters — incident type", () => {
  it("Hurricane keeps only states with hurricane_count > 0", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Hurricane" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("Flood keeps only states with flood_count > 0", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Flood" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("Fire keeps all three states (all have fire_count > 0)", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Fire" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "AK", "TX"]);
  });

  it("Severe Storm keeps only states with severe_storm_count > 0", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Severe Storm" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("Tornado keeps only states with tornado_count > 0", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Tornado" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("returns empty list when no state matches", () => {
    const only = [make({ state_code: "ME", hurricane_count: 0 })];
    expect(applyFilters(only, { ...DEFAULT_FILTERS, incidentType: "Hurricane" })).toHaveLength(0);
  });

  it("empty string keeps all states", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "" })).toHaveLength(3);
  });

  it("null counts are treated as zero", () => {
    const s = make({ state_code: "ZZ", hurricane_count: null });
    expect(applyFilters([s], { ...DEFAULT_FILTERS, incidentType: "Hurricane" })).toHaveLength(0);
  });
});

describe("applyFilters — FEMA region", () => {
  it("region 4 returns only FL", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, femaRegion: "4" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL"]);
  });

  it("region 6 returns only TX", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, femaRegion: "6" }).map((s) => s.state_code);
    expect(codes).toEqual(["TX"]);
  });

  it("region 10 returns only AK", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, femaRegion: "10" }).map((s) => s.state_code);
    expect(codes).toEqual(["AK"]);
  });

  it("empty string keeps all states", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, femaRegion: "" })).toHaveLength(3);
  });

  it("region with no matching state returns empty", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, femaRegion: "2" })).toHaveLength(0);
  });
});

describe("applyFilters — declaration type", () => {
  it("DR keeps states with major_disaster_declarations > 0", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, declarationType: "DR" })).toHaveLength(3);
  });

  it("EM excludes states with zero emergency_declarations", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, declarationType: "EM" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("empty string keeps all states", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, declarationType: "" })).toHaveLength(3);
  });

  it("DR excludes state with null major_disaster_declarations", () => {
    const s = make({ state_code: "ZZ", major_disaster_declarations: null });
    expect(applyFilters([s], { ...DEFAULT_FILTERS, declarationType: "DR" })).toHaveLength(0);
  });
});

describe("applyFilters — time range", () => {
  it("last5 excludes AK (zero declarations in last 5 years)", () => {
    const codes = applyFilters(ALL, { ...DEFAULT_FILTERS, timeRange: "last5" }).map((s) => s.state_code);
    expect(codes).toEqual(["FL", "TX"]);
  });

  it("last10 keeps all three (all have declarations in last 10 years)", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, timeRange: "last10" })).toHaveLength(3);
  });

  it("all keeps every state", () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, timeRange: "all" })).toHaveLength(3);
  });

  it("null counts treated as zero for time range", () => {
    const s = make({ declarations_last_5_years: null });
    expect(applyFilters([s], { ...DEFAULT_FILTERS, timeRange: "last5" })).toHaveLength(0);
  });
});

describe("applyFilters — combined filters", () => {
  it("Hurricane + region 4 returns only FL", () => {
    const result = applyFilters(ALL, { ...DEFAULT_FILTERS, incidentType: "Hurricane", femaRegion: "4" });
    expect(result.map((s) => s.state_code)).toEqual(["FL"]);
  });

  it("Hurricane + last5 excludes states without recent hurricane activity", () => {
    const noRecent = make({ state_code: "ZZ", hurricane_count: 5, declarations_last_5_years: 0 });
    const result = applyFilters([...ALL, noRecent], { ...DEFAULT_FILTERS, incidentType: "Hurricane", timeRange: "last5" });
    expect(result.map((s) => s.state_code)).toEqual(["FL", "TX"]);
  });

  it("EM + last5 applies both filters independently", () => {
    const result = applyFilters(ALL, { ...DEFAULT_FILTERS, declarationType: "EM", timeRange: "last5" });
    expect(result.map((s) => s.state_code)).toEqual(["FL", "TX"]);
  });

  it("all four filters active narrows to a single state", () => {
    const result = applyFilters(ALL, {
      incidentType: "Hurricane",
      femaRegion: "4",
      declarationType: "EM",
      timeRange: "last5",
    });
    expect(result.map((s) => s.state_code)).toEqual(["FL"]);
  });
});

// ---------------------------------------------------------------------------
// isDefaultFilters
// ---------------------------------------------------------------------------

describe("isDefaultFilters", () => {
  it("returns true for DEFAULT_FILTERS", () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
  });

  it("returns false when incidentType is set", () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, incidentType: "Hurricane" })).toBe(false);
  });

  it("returns false when femaRegion is set", () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, femaRegion: "4" })).toBe(false);
  });

  it("returns false when declarationType is set", () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, declarationType: "DR" })).toBe(false);
  });

  it("returns false when timeRange is non-default", () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, timeRange: "last5" })).toBe(false);
  });
});
