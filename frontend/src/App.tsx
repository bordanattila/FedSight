import { useEffect, useState } from "react";
import { fetchAllStateRisks } from "./api";
import type { StateRisk } from "./types";
import { TopRiskCards } from "./components/TopRiskCards";
import { RiskBarChart } from "./components/RiskBarChart";
import { RiskMap } from "./components/RiskMap";
import { RankedTable } from "./components/RankedTable";
import styles from "./App.module.css";

type Status = "loading" | "error" | "ok";

export default function App() {
  const [states, setStates] = useState<StateRisk[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllStateRisks()
      .then((data) => {
        setStates(data.states);
        setStatus("ok");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.title}>FedSight</h1>
            <p className={styles.subtitle}>FEMA Regional Risk Analysis</p>
          </div>
          {status === "ok" && (
            <span className={styles.count}>{states.length} states scored</span>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {status === "loading" && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Loading risk data…</p>
          </div>
        )}

        {status === "error" && (
          <div className={styles.errorBox}>
            <strong>Could not reach the API.</strong>
            <p>{error}</p>
            <p className={styles.errorHint}>
              Start the backend:{" "}
              <code>uvicorn backend.main:app --reload</code>
            </p>
          </div>
        )}

        {status === "ok" && states.length === 0 && (
          <div className={styles.emptyBox}>
            <p>No risk scores found. Run ingestion first.</p>
          </div>
        )}

        {status === "ok" && states.length > 0 && (
          <>
            <TopRiskCards states={states.slice(0, 3)} />
            <RiskMap states={states} />
            <RiskBarChart states={states} />
            <RankedTable states={states} />
          </>
        )}
      </main>
    </div>
  );
}
