import type { StateRisk } from "../types";

export interface Filters {
  incidentType: string;    // "" = any | "Hurricane" | "Flood" | "Fire" | "Severe Storm" | "Tornado"
  femaRegion: string;      // "" = any | "1" … "10"
  declarationType: string; // "" = any | "DR" | "EM"
  timeRange: string;       // "all" | "last5" | "last10"
}

export const DEFAULT_FILTERS: Filters = {
  incidentType: "",
  femaRegion: "",
  declarationType: "",
  timeRange: "all",
};

const INCIDENT_COUNT: Record<string, (s: StateRisk) => number> = {
  Hurricane:      (s) => s.hurricane_count    ?? 0,
  Flood:          (s) => s.flood_count        ?? 0,
  Fire:           (s) => s.fire_count         ?? 0,
  "Severe Storm": (s) => s.severe_storm_count ?? 0,
  Tornado:        (s) => s.tornado_count      ?? 0,
};

export function applyFilters(states: StateRisk[], filters: Filters): StateRisk[] {
  return states.filter((s) => {
    if (filters.incidentType) {
      const getCount = INCIDENT_COUNT[filters.incidentType];
      if (!getCount || getCount(s) === 0) return false;
    }

    if (filters.femaRegion !== "" && s.fema_region !== Number(filters.femaRegion)) {
      return false;
    }

    if (filters.declarationType === "DR" && (s.major_disaster_declarations ?? 0) === 0) {
      return false;
    }
    if (filters.declarationType === "EM" && (s.emergency_declarations ?? 0) === 0) {
      return false;
    }

    if (filters.timeRange === "last5"  && (s.declarations_last_5_years  ?? 0) === 0) return false;
    if (filters.timeRange === "last10" && (s.declarations_last_10_years ?? 0) === 0) return false;

    return true;
  });
}

export function isDefaultFilters(filters: Filters): boolean {
  return (
    filters.incidentType    === DEFAULT_FILTERS.incidentType    &&
    filters.femaRegion      === DEFAULT_FILTERS.femaRegion      &&
    filters.declarationType === DEFAULT_FILTERS.declarationType &&
    filters.timeRange       === DEFAULT_FILTERS.timeRange
  );
}
