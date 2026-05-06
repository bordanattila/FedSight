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
import styles from "./SpendingChart.module.css";

const fmt$ = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function buildFilterLabel(filters: Filters): string {
  const parts: string[] = [];
  if (filters.incidentType) parts.push(filters.incidentType);
  if (filters.femaRegion) parts.push(`Region ${filters.femaRegion}`);
  if (filters.declarationType) parts.push(filters.declarationType);
  if (filters.timeRange === "last5") parts.push("Last 5 Years");
  else if (filters.timeRange === "last10") parts.push("Last 10 Years");
  return parts.length > 0 ? parts.join(" / ") : "All States";
}

function gapColor(score: number | null): string {
  if (score === null) return "#4a90d9";
  if (score >= 75) return "#fc5c5c";
  if (score >= 45) return "#f6ad55";
  return "#68d391";
}

interface ChartRow {
  state_code: string;
  state_name: string;
  obligation_amount: number;
  obligation_millions: number;
  total_declarations: number | null;
  spending_gap_score: number | null;
  per_declaration: number | null;
}

interface TooltipPayload {
  payload?: ChartRow;
}

export function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{d.state_name}</strong>
      <div>Obligation: {fmt$.format(d.obligation_amount)}</div>
      {d.total_declarations != null && (
        <div>Declarations: {d.total_declarations.toLocaleString()}</div>
      )}
      {d.per_declaration != null && (
        <div>Per declaration: {fmt$.format(d.per_declaration)}</div>
      )}
      {d.spending_gap_score != null && (
        <div>Spending gap score: {d.spending_gap_score.toFixed(1)}</div>
      )}
    </div>
  );
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartRow;
}

function ColoredBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(0, width)}
      height={Math.max(0, height)}
      fill={gapColor(payload?.spending_gap_score ?? null)}
      rx={2}
      ry={2}
    />
  );
}

interface Props {
  states: StateRisk[];
  filters: Filters;
}

export function SpendingChart({ states, filters }: Props) {
  const data: ChartRow[] = states
    .filter(
      (s): s is StateRisk & { obligation_amount: number } =>
        s.obligation_amount !== null
    )
    .map((s) => ({
      state_code: s.state_code,
      state_name: s.state_name,
      obligation_amount: s.obligation_amount,
      obligation_millions: s.obligation_amount / 1_000_000,
      total_declarations: s.total_declarations,
      spending_gap_score: s.spending_gap_score,
      per_declaration:
        s.total_declarations ? s.obligation_amount / s.total_declarations : null,
    }))
    .sort((a, b) => b.obligation_millions - a.obligation_millions);

  const heading = `Federal Disaster Spending — ${buildFilterLabel(filters)}`;

  if (data.length === 0) {
    return (
      <section className={styles.section} data-testid="spending-chart">
        <h2 className={styles.heading}>{heading}</h2>
        <div className={styles.empty}>
          No spending data available. Run{" "}
          <code>python -m ingestion.usaspending</code> to populate.
        </div>
      </section>
    );
  }

  const xMax = Math.max(...data.map((d) => d.obligation_millions));
  const domain: [number, number] = [0, Math.ceil(xMax * 1.05)];

  return (
    <section className={styles.section} data-testid="spending-chart">
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.subheading}>
        Total USAspending obligations (DEF codes L–U). Bar colour indicates
        spending-gap risk:{" "}
        <span className={styles.high}>red&nbsp;= high gap</span>,{" "}
        <span className={styles.low}>green&nbsp;= low gap</span>,{" "}
        <span className={styles.neutral}>blue&nbsp;= no gap score yet</span>.
      </p>
      <div className={styles.chartWrap}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(400, data.length * 22)}
        >
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 60, bottom: 0, left: 8 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="#2d3748"
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              domain={domain}
              tickFormatter={(v: number) => {
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}B`;
                if (v >= 1) return `$${v.toFixed(0)}M`;
                return `$${(v * 1000).toFixed(0)}K`;
              }}
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
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar
              dataKey="obligation_millions"
              maxBarSize={16}
              shape={<ColoredBar />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
