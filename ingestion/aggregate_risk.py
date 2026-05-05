"""
Two-pass pipeline:
  1. Aggregate fema_disaster_declarations → state_disaster_summary
  2. Min-max normalize summary columns → state_risk_scores

Weights (spending_gap_score is null until USAspending data is loaded;
its 10% share is redistributed proportionally across the other three):
  disaster_count   30 %
  recent_activity  35 %
  hurricane_exposure 25 %
  spending_gap     10 %  (pending)

Usage:
    python -m ingestion.aggregate_risk
"""

import logging
import os

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()
log = logging.getLogger(__name__)

# Weights (must sum to 1.0); spending_gap is redistributed when null
WEIGHTS = {
    "disaster_count":    0.30,
    "recent_activity":   0.35,
    "hurricane_exposure": 0.25,
    "spending_gap":      0.10,
}

AGGREGATE_SQL = """
INSERT INTO state_disaster_summary (
    state_code,
    total_declarations,
    major_disaster_declarations,
    emergency_declarations,
    hurricane_count,
    flood_count,
    fire_count,
    severe_storm_count,
    tornado_count,
    declarations_last_5_years,
    declarations_last_10_years,
    first_disaster_year,
    most_recent_disaster_year,
    updated_at
)
SELECT
    state_code,
    COUNT(*)                                                                AS total_declarations,
    COUNT(*) FILTER (WHERE declaration_type = 'DR')                        AS major_disaster_declarations,
    COUNT(*) FILTER (WHERE declaration_type = 'EM')                        AS emergency_declarations,
    COUNT(*) FILTER (WHERE incident_type = 'Hurricane')                    AS hurricane_count,
    COUNT(*) FILTER (WHERE incident_type = 'Flood')                        AS flood_count,
    COUNT(*) FILTER (WHERE incident_type = 'Fire')                         AS fire_count,
    COUNT(*) FILTER (WHERE incident_type ILIKE 'Severe Storm%')            AS severe_storm_count,
    COUNT(*) FILTER (WHERE incident_type = 'Tornado')                      AS tornado_count,
    COUNT(*) FILTER (WHERE declaration_date >= NOW() - INTERVAL '5 years') AS declarations_last_5_years,
    COUNT(*) FILTER (WHERE declaration_date >= NOW() - INTERVAL '10 years') AS declarations_last_10_years,
    MIN(EXTRACT(YEAR FROM declaration_date)::INTEGER)                      AS first_disaster_year,
    MAX(EXTRACT(YEAR FROM declaration_date)::INTEGER)                      AS most_recent_disaster_year,
    NOW()
FROM fema_disaster_declarations
GROUP BY state_code
ON CONFLICT (state_code) DO UPDATE SET
    total_declarations          = EXCLUDED.total_declarations,
    major_disaster_declarations = EXCLUDED.major_disaster_declarations,
    emergency_declarations      = EXCLUDED.emergency_declarations,
    hurricane_count             = EXCLUDED.hurricane_count,
    flood_count                 = EXCLUDED.flood_count,
    fire_count                  = EXCLUDED.fire_count,
    severe_storm_count          = EXCLUDED.severe_storm_count,
    tornado_count               = EXCLUDED.tornado_count,
    declarations_last_5_years   = EXCLUDED.declarations_last_5_years,
    declarations_last_10_years  = EXCLUDED.declarations_last_10_years,
    first_disaster_year         = EXCLUDED.first_disaster_year,
    most_recent_disaster_year   = EXCLUDED.most_recent_disaster_year,
    updated_at                  = NOW()
"""

FETCH_SUMMARY_SQL = """
SELECT
    state_code,
    total_declarations,
    declarations_last_5_years,
    declarations_last_10_years,
    hurricane_count,
    most_recent_disaster_year
FROM state_disaster_summary
"""


def minmax(values: list[float]) -> list[float]:
    lo, hi = min(values), max(values)
    if hi == lo:
        return [50.0] * len(values)
    return [round((v - lo) / (hi - lo) * 100, 2) for v in values]


def build_explanation(row: dict) -> str:
    parts = [
        f"{row['total_declarations']} total FEMA declarations",
        f"{row['declarations_last_5_years']} in the last 5 years",
        f"{row['hurricane_count']} hurricane declaration(s)",
    ]
    if row["final_risk_score"] >= 75:
        tier = "High risk"
    elif row["final_risk_score"] >= 45:
        tier = "Moderate risk"
    else:
        tier = "Lower risk"
    return f"{tier}. {'; '.join(parts)}."


def compute_scores(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(FETCH_SUMMARY_SQL)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    if not rows:
        log.warning("state_disaster_summary is empty — run ingestion first")
        return

    state_codes = [r["state_code"] for r in rows]

    # Raw signal columns
    total       = [r["total_declarations"] for r in rows]
    # Blend 5-year (weight 2) and 10-year (weight 1) for recency sensitivity
    recency     = [r["declarations_last_5_years"] * 2 + r["declarations_last_10_years"] for r in rows]
    hurricanes  = [r["hurricane_count"] for r in rows]

    disaster_scores  = minmax(total)
    recency_scores   = minmax(recency)
    hurricane_scores = minmax(hurricanes)

    # spending_gap_score is null until USAspending layer is loaded;
    # redistribute its 10% weight proportionally across the other three
    active_weight = 1.0 - WEIGHTS["spending_gap"]
    w_d = WEIGHTS["disaster_count"]   / active_weight
    w_r = WEIGHTS["recent_activity"]  / active_weight
    w_h = WEIGHTS["hurricane_exposure"] / active_weight

    score_rows = []
    for i, state_code in enumerate(state_codes):
        d = disaster_scores[i]
        r = recency_scores[i]
        h = hurricane_scores[i]
        final = round(w_d * d + w_r * r + w_h * h, 2)

        row_data = {
            **rows[i],
            "disaster_count_score":    d,
            "recent_activity_score":   r,
            "hurricane_exposure_score": h,
            "final_risk_score":        final,
        }
        row_data["final_risk_score"] = final
        explanation = build_explanation(row_data)

        score_rows.append((
            state_code,
            d,       # disaster_count_score
            r,       # recent_activity_score
            h,       # hurricane_exposure_score
            None,    # spending_gap_score (pending USAspending)
            final,
            explanation,
        ))

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO state_risk_scores (
                state_code,
                disaster_count_score,
                recent_activity_score,
                hurricane_exposure_score,
                spending_gap_score,
                final_risk_score,
                explanation,
                calculated_at
            ) VALUES %s
            ON CONFLICT (state_code) DO UPDATE SET
                disaster_count_score    = EXCLUDED.disaster_count_score,
                recent_activity_score   = EXCLUDED.recent_activity_score,
                hurricane_exposure_score = EXCLUDED.hurricane_exposure_score,
                spending_gap_score      = EXCLUDED.spending_gap_score,
                final_risk_score        = EXCLUDED.final_risk_score,
                explanation             = EXCLUDED.explanation,
                calculated_at           = NOW()
            """,
            [(
                r[0], r[1], r[2], r[3], r[4], r[5], r[6]
            ) for r in score_rows],
            template="(%s, %s, %s, %s, %s, %s, %s, NOW())",
        )

    log.info("Scored %d states", len(score_rows))


def run() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        log.info("Aggregating fema_disaster_declarations → state_disaster_summary")
        with conn.cursor() as cur:
            cur.execute(AGGREGATE_SQL)
        conn.commit()
        log.info("Aggregation complete")

        log.info("Computing risk scores → state_risk_scores")
        compute_scores(conn)
        conn.commit()
        log.info("Scoring complete")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    run()
