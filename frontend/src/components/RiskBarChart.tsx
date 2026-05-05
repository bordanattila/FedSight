import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { StateRisk } from "../types";
import styles from "./RiskBarChart.module.css";

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

interface Props {
  states: StateRisk[];
}

export function RiskBarChart({ states }: Props) {
  // Sort descending so highest risk is at top
  const data = [...states].sort(
    (a, b) => (b.final_risk_score ?? 0) - (a.final_risk_score ?? 0)
  );

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Risk Score — All States</h2>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={Math.max(400, data.length * 22)}>
          <BarChart
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
            <Bar dataKey="final_risk_score" radius={[0, 3, 3, 0]} maxBarSize={16}>
              {data.map((entry) => (
                <Cell key={entry.state_code} fill={barColor(entry.final_risk_score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
