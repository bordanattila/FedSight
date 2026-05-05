import type { StateRisk } from "../types";
import styles from "./RankedTable.module.css";

function RiskBadge({ score }: { score: number | null }) {
  if (score === null) return <span className={`${styles.badge} ${styles.unknown}`}>—</span>;
  if (score >= 75) return <span className={`${styles.badge} ${styles.high}`}>High</span>;
  if (score >= 45) return <span className={`${styles.badge} ${styles.moderate}`}>Moderate</span>;
  return <span className={`${styles.badge} ${styles.low}`}>Lower</span>;
}

interface Props {
  states: StateRisk[];
}

export function RankedTable({ states }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>All States — Risk Ranking</h2>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.rankCol}>#</th>
              <th>State</th>
              <th className={styles.numCol}>Risk Score</th>
              <th className={styles.numCol}>Tier</th>
              <th className={styles.numCol}>Total Decl.</th>
              <th className={styles.numCol}>Last 5 Yrs</th>
              <th className={styles.numCol}>Hurricanes</th>
              <th className={styles.numCol}>FEMA Region</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s, i) => (
              <tr key={s.state_code} className={i % 2 === 0 ? styles.even : styles.odd}>
                <td className={`${styles.rankCol} ${styles.muted}`}>{i + 1}</td>
                <td>
                  <span className={styles.stateName}>{s.state_name}</span>
                  <span className={styles.stateCodeBadge}>{s.state_code}</span>
                </td>
                <td className={styles.numCol}>
                  <span className={styles.score}>
                    {s.final_risk_score?.toFixed(1) ?? "—"}
                  </span>
                </td>
                <td className={styles.numCol}>
                  <RiskBadge score={s.final_risk_score} />
                </td>
                <td className={styles.numCol}>{s.total_declarations ?? "—"}</td>
                <td className={styles.numCol}>{s.declarations_last_5_years ?? "—"}</td>
                <td className={styles.numCol}>{s.hurricane_count ?? "—"}</td>
                <td className={styles.numCol}>{s.fema_region ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
