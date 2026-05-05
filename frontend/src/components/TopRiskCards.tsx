import type { StateRisk } from "../types";
import styles from "./TopRiskCards.module.css";

function riskTier(score: number | null): { label: string; cls: string } {
  if (score === null) return { label: "Unknown", cls: styles.unknown };
  if (score >= 75) return { label: "High Risk", cls: styles.high };
  if (score >= 45) return { label: "Moderate Risk", cls: styles.moderate };
  return { label: "Lower Risk", cls: styles.low };
}

function ScoreBar({ value }: { value: number | null }) {
  const pct = value ?? 0;
  return (
    <div className={styles.barTrack}>
      <div className={styles.barFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Props {
  states: StateRisk[];
}

export function TopRiskCards({ states }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Top {states.length} Highest-Risk States</h2>
      <div className={styles.grid}>
        {states.map((s, i) => {
          const tier = riskTier(s.final_risk_score);
          return (
            <div key={s.state_code} className={`${styles.card} ${tier.cls}`}>
              <div className={styles.rank}>#{i + 1}</div>
              <div className={styles.stateName}>{s.state_name}</div>
              <div className={styles.stateCode}>{s.state_code}</div>
              <div className={styles.score}>
                {s.final_risk_score?.toFixed(1) ?? "—"}
                <span className={styles.scoreLabel}> / 100</span>
              </div>
              <span className={styles.tier}>{tier.label}</span>
              <ScoreBar value={s.final_risk_score} />
              <dl className={styles.stats}>
                <dt>Total declarations</dt>
                <dd>{s.total_declarations ?? "—"}</dd>
                <dt>Last 5 years</dt>
                <dd>{s.declarations_last_5_years ?? "—"}</dd>
                <dt>Hurricane declarations</dt>
                <dd>{s.hurricane_count ?? "—"}</dd>
                <dt>FEMA region</dt>
                <dd>{s.fema_region ?? "—"}</dd>
              </dl>
              {s.explanation && (
                <p className={styles.explanation}>{s.explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
