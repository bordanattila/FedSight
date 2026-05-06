import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { StateRisk } from "../types";
import type { Filters } from "../lib/filterStates";
import styles from "./RiskBarChart.module.css";

function buildFilterLabel(filters: Filters): string {
  const parts: string[] = [];
  if (filters.incidentType) parts.push(filters.incidentType);
  if (filters.femaRegion) parts.push(`Region ${filters.femaRegion}`);
  if (filters.declarationType) parts.push(filters.declarationType);
  if (filters.timeRange === "last5") parts.push("Last 5 Years");
  else if (filters.timeRange === "last10") parts.push("Last 10 Years");
  return parts.length > 0 ? parts.join(" / ") : "All States";
}

function barColor(score: number | null): string {
  if (score === null) return "#4a5568";
  if (score >= 75) return "#fc5c5c";
  if (score >= 45) return "#f6ad55";
  return "#68d391";
}

interface TooltipPayload {
  payload?: {
    state_name: string;
    final_risk_score: number | null;
    hurricane_count: number | null;
    total_declarations: number | null;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{d.state_name}</strong>
      <div>Risk score: {d.final_risk_score?.toFixed(1) ?? "—"}</div>
      <div>Total declarations: {d.total_declarations ?? "—"}</div>
      <div>Hurricane declarations: {d.hurricane_count ?? "—"}</div>
    </div>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { final_risk_score: number | null };
}

function ColoredBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  const score = payload?.final_risk_score ?? null;
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(0, width)}
      height={Math.max(0, height)}
      fill={barColor(score)}
      rx={2}
      ry={2}
    />
  );
}

interface Props {
  states: StateRisk[];
  filters: Filters;
}

export function RiskBarChart({ states, filters }: Props) {
  const data = [...states].sort(
    (a, b) => (b.final_risk_score ?? 0) - (a.final_risk_score ?? 0)
  );

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Risk Score — {buildFilterLabel(filters)}</h2>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={Math.max(400, data.length * 22)}>
          <BarChart
            key={data.map((d) => d.state_code).join(",")}
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="#2d3748" strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: "#718096", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#2d3748" }}
            />
            <YAxis
              type="category"
              dataKey="state_code"
              width={28}
              tick={{ fill: "#a0aec0", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="final_risk_score" maxBarSize={16} shape={<ColoredBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
