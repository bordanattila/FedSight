import { useEffect, useMemo, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import type { StateRisk } from "../types";
import styles from "./RiskMap.module.css";

const fmt = new Intl.NumberFormat();

function topIncidentType(s: StateRisk): string {
  const candidates = [
    { label: "Hurricane",    count: s.hurricane_count    ?? 0 },
    { label: "Flood",        count: s.flood_count        ?? 0 },
    { label: "Fire",         count: s.fire_count         ?? 0 },
    { label: "Severe Storm", count: s.severe_storm_count ?? 0 },
    { label: "Tornado",      count: s.tornado_count      ?? 0 },
  ];
  const top = candidates.reduce((best, c) => (c.count > best.count ? c : best));
  return top.count > 0 ? top.label : "—";
}

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const W = 960;
const H = 600;

const projection = geoAlbersUsa().scale(1300).translate([W / 2, H / 2]);
const pathGen = geoPath(projection);

type UsAtlas = Topology<{ states: GeometryCollection }>;

// FIPS code (string) → two-letter state abbreviation
const FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

function fillColor(score: number | null): string {
  if (score === null) return "#2d3748";
  if (score >= 75) return "#fc5c5c";
  if (score >= 60) return "#f07070";
  if (score >= 45) return "#f6ad55";
  if (score >= 30) return "#82c985";
  return "#68d391";
}

interface Tooltip {
  x: number;
  y: number;
  state: StateRisk;
}

interface Props {
  states: StateRisk[];
}

export function RiskMap({ states }: Props) {
  const [features, setFeatures] = useState<Feature<Geometry>[]>([]);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [pinned, setPinned] = useState<StateRisk | null>(null);

  const scoreMap = useMemo(
    () => Object.fromEntries(states.map((s) => [s.state_code, s])),
    [states]
  );

  // Clear tooltip and pinned card when the filtered set changes.
  useEffect(() => {
    setTooltip(null);
    setPinned(null);
  }, [states]);

  useEffect(() => {
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((topo: UsAtlas) => {
        const col = feature(topo, topo.objects.states);
        setFeatures(col.features as Feature<Geometry>[]);
      });
  }, []);

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Risk by State — US Map</h2>
      <div className={styles.mapWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {features.map((geo) => {
            const fips = String(geo.id).padStart(2, "0");
            const code = FIPS[fips];
            const stateData = code ? scoreMap[code] : undefined;
            const d = pathGen(geo);
            if (!d) return null;

            const isSelected = pinned?.state_code === code;

            return (
              <path
                key={String(geo.id)}
                data-testid={code ? `state-${code}` : undefined}
                d={d}
                fill={fillColor(stateData?.final_risk_score ?? null)}
                stroke={isSelected ? "#ffffff" : "#111827"}
                strokeWidth={isSelected ? 1.5 : 0.5}
                style={{ cursor: stateData ? "pointer" : "default", outline: "none" }}
                onMouseEnter={(e) => {
                  if (!stateData) return;
                  setTooltip({ x: e.clientX, y: e.clientY, state: stateData });
                }}
                onMouseMove={(e) => {
                  if (!stateData) return;
                  setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => {
                  if (!stateData) return;
                  setPinned((p) =>
                    p?.state_code === stateData.state_code ? null : stateData
                  );
                }}
              />
            );
          })}
        </svg>

        {tooltip && (
          <div
            data-testid="map-tooltip"
            className={styles.tooltip}
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          >
            <div className={styles.tooltipName}>{tooltip.state.state_name}</div>
            <dl className={styles.tooltipGrid}>
              <dt>Risk Score</dt>
              <dd className={styles.scoreVal}>
                {tooltip.state.final_risk_score?.toFixed(1) ?? "—"}
              </dd>

              <dt>Total FEMA Declarations</dt>
              <dd>{tooltip.state.total_declarations != null ? fmt.format(tooltip.state.total_declarations) : "—"}</dd>

              <dt>Declarations Last 5 Years</dt>
              <dd>{tooltip.state.declarations_last_5_years ?? "—"}</dd>

              <dt>Hurricane Declarations</dt>
              <dd>{tooltip.state.hurricane_count ?? "—"}</dd>

              <dt>Top Incident Type</dt>
              <dd>{topIncidentType(tooltip.state)}</dd>
            </dl>
            {tooltip.state.explanation && (
              <p className={styles.tooltipExplanation}>{tooltip.state.explanation}</p>
            )}
          </div>
        )}

        {pinned && (
          <div data-testid="state-detail-panel" className={styles.detailPanel}>
            <button
              className={styles.detailClose}
              onClick={() => setPinned(null)}
              aria-label="Close detail panel"
            >
              ×
            </button>
            <div className={styles.detailName}>
              {pinned.state_name}
              <span className={styles.detailCode}>{pinned.state_code}</span>
            </div>

            <div className={styles.detailScoreRow}>
              <span className={styles.detailScoreLabel}>Risk Score</span>
              <span className={styles.detailScoreVal}>
                {pinned.final_risk_score?.toFixed(1) ?? "—"}
              </span>
            </div>

            <dl className={styles.detailGrid}>
              <dt>Disaster Count</dt>
              <dd>{pinned.disaster_count_score?.toFixed(1) ?? "—"}</dd>
              <dt>Recent Activity</dt>
              <dd>{pinned.recent_activity_score?.toFixed(1) ?? "—"}</dd>
              <dt>Hurricane Exposure</dt>
              <dd>{pinned.hurricane_exposure_score?.toFixed(1) ?? "—"}</dd>
              <dt>Spending Gap</dt>
              <dd>{pinned.spending_gap_score?.toFixed(1) ?? "—"}</dd>

              <dt className={styles.detailDivider}>Total Declarations</dt>
              <dd className={styles.detailDivider}>{pinned.total_declarations != null ? fmt.format(pinned.total_declarations) : "—"}</dd>
              <dt>Major Disaster</dt>
              <dd>{pinned.major_disaster_declarations ?? "—"}</dd>
              <dt>Emergency</dt>
              <dd>{pinned.emergency_declarations ?? "—"}</dd>
              <dt>Last 5 Years</dt>
              <dd>{pinned.declarations_last_5_years ?? "—"}</dd>
              <dt>Last 10 Years</dt>
              <dd>{pinned.declarations_last_10_years ?? "—"}</dd>

              <dt className={styles.detailDivider}>Hurricane</dt>
              <dd className={styles.detailDivider}>{pinned.hurricane_count ?? "—"}</dd>
              <dt>Flood</dt>
              <dd>{pinned.flood_count ?? "—"}</dd>
              <dt>Fire</dt>
              <dd>{pinned.fire_count ?? "—"}</dd>
              <dt>Severe Storm</dt>
              <dd>{pinned.severe_storm_count ?? "—"}</dd>
              <dt>Tornado</dt>
              <dd>{pinned.tornado_count ?? "—"}</dd>

              {pinned.most_recent_disaster_year != null && (
                <>
                  <dt className={styles.detailDivider}>Most Recent Year</dt>
                  <dd className={styles.detailDivider}>{pinned.most_recent_disaster_year}</dd>
                </>
              )}
            </dl>

            {pinned.explanation && (
              <p className={styles.detailExplanation}>{pinned.explanation}</p>
            )}
          </div>
        )}

        <div className={styles.legend}>
          <span className={styles.legendTitle}>Risk level</span>
          {[
            { color: "#fc5c5c", label: "High (≥75)" },
            { color: "#f6ad55", label: "Moderate (45–74)" },
            { color: "#68d391", label: "Lower (<45)" },
            { color: "#2d3748", label: "Not in current filter" },
          ].map(({ color, label }) => (
            <span key={label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
