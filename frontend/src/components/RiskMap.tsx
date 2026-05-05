import { useEffect, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import type { StateRisk } from "../types";
import styles from "./RiskMap.module.css";

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

  const scoreMap = Object.fromEntries(states.map((s) => [s.state_code, s]));

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

            return (
              <path
                key={String(geo.id)}
                d={d}
                fill={fillColor(stateData?.final_risk_score ?? null)}
                stroke="#111827"
                strokeWidth={0.5}
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
              />
            );
          })}
        </svg>

        {tooltip && (
          <div
            className={styles.tooltip}
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          >
            <strong>{tooltip.state.state_name}</strong>
            <div>
              Risk score:{" "}
              <span className={styles.scoreVal}>
                {tooltip.state.final_risk_score?.toFixed(1) ?? "—"}
              </span>
            </div>
            <div>Declarations: {tooltip.state.total_declarations ?? "—"}</div>
            <div>Hurricanes: {tooltip.state.hurricane_count ?? "—"}</div>
          </div>
        )}

        <div className={styles.legend}>
          <span className={styles.legendTitle}>Risk level</span>
          {[
            { color: "#fc5c5c", label: "High (≥75)" },
            { color: "#f6ad55", label: "Moderate (45–74)" },
            { color: "#68d391", label: "Lower (<45)" },
            { color: "#2d3748", label: "No data" },
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
