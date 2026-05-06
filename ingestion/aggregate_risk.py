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

# Static FEMA region assignments (https://www.fema.gov/about/organization/regions)
FEMA_REGION_MAP: dict[str, int] = {
    "CT": 1, "ME": 1, "MA": 1, "NH": 1, "RI": 1, "VT": 1,
    "NJ": 2, "NY": 2, "PR": 2, "VI": 2,
    "DC": 3, "DE": 3, "MD": 3, "PA": 3, "VA": 3, "WV": 3,
    "AL": 4, "FL": 4, "GA": 4, "KY": 4, "MS": 4, "NC": 4, "SC": 4, "TN": 4,
    "IL": 5, "IN": 5, "MI": 5, "MN": 5, "OH": 5, "WI": 5,
    "AR": 6, "LA": 6, "NM": 6, "OK": 6, "TX": 6,
    "IA": 7, "KS": 7, "MO": 7, "NE": 7,
    "CO": 8, "MT": 8, "ND": 8, "SD": 8, "UT": 8, "WY": 8,
    "AZ": 9, "CA": 9, "HI": 9, "NV": 9, "GU": 9, "AS": 9,
    "AK": 10, "ID": 10, "OR": 10, "WA": 10,
}

# Weights (must sum to 1.0); spending_gap is redistributed when null
WEIGHTS = {
    "disaster_count":     float(os.getenv("RISK_WEIGHT_DISASTER_COUNT",    "0.30")),
    "recent_activity":    float(os.getenv("RISK_WEIGHT_RECENT_ACTIVITY",   "0.35")),
    "hurricane_exposure": float(os.getenv("RISK_WEIGHT_HURRICANE_EXPOSURE","0.25")),
    "spending_gap":       float(os.getenv("RISK_WEIGHT_SPENDING_GAP",      "0.10")),
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
    sds.state_code,
    s.state_name,
    sds.total_declarations,
    sds.declarations_last_5_years,
    sds.declarations_last_10_years,
    sds.hurricane_count,
    sds.most_recent_disaster_year,
    usd.obligation_amount
FROM state_disaster_summary sds
JOIN states s ON s.state_code = sds.state_code
LEFT JOIN usaspending_disaster_spending usd ON usd.state_code = sds.state_code
"""


def minmax(values: list[float]) -> list[float]:
    lo, hi = min(values), max(values)
    if hi == lo:
        return [50.0] * len(values)
    return [round((v - lo) / (hi - lo) * 100, 2) for v in values]


def _fmt_obligation(amount: float | None) -> str:
    if amount is None:
        return "unknown"
    if amount >= 1_000_000_000:
        return f"${amount / 1_000_000_000:.1f}B"
    return f"${amount / 1_000_000:.0f}M"


def build_explanation(row: dict) -> str:
    state_name = row["state_name"]
    final = row["final_risk_score"]
    d_score = row["disaster_count_score"]
    r_score = row["recent_activity_score"]
    h_score = row["hurricane_exposure_score"]
    total = row["total_declarations"]
    last5 = row["declarations_last_5_years"]
    hurr = row["hurricane_count"]
    gap = row.get("spending_gap_score")
    obligation = row.get("obligation_amount")

    if final >= 75:
        tier = "high"
    elif final >= 45:
        tier = "moderate"
    else:
        tier = "lower"

    factors: list[str] = []
    if d_score >= 70:
        factors.append("a high FEMA disaster declaration history")
    elif d_score >= 40:
        factors.append("a moderate FEMA disaster declaration history")

    if r_score >= 70:
        factors.append("substantial recent activity")
    elif r_score >= 40:
        factors.append("moderate recent activity")

    if h_score >= 70:
        factors.append("repeated hurricane-related declarations")
    elif h_score >= 40:
        factors.append("notable hurricane exposure")

    if len(factors) >= 3:
        reason = f"it combines {factors[0]} with {factors[1]} and {factors[2]}"
    elif len(factors) == 2:
        reason = f"it combines {factors[0]} with {factors[1]}"
    elif len(factors) == 1:
        reason = f"of {factors[0]}"
    else:
        reason = "of consistently limited disaster activity across all tracked categories"

    sentence1 = f"{state_name} ranks as {tier} risk because {reason}."

    hurr_clause = f" and {hurr:,} hurricane declarations" if hurr > 0 else ""
    sentence2 = f"It has {total:,} total declarations, including {last5:,} in the last five years{hurr_clause}."

    sentences = [sentence1, sentence2]

    if gap is not None:
        oblg_str = _fmt_obligation(obligation)
        if gap >= 25:
            sentences.append(
                f"{state_name} has a high funding gap ({gap:+.0f} points): disaster risk is high "
                f"but federal obligation spending is low relative to peer states ({oblg_str} total)."
            )
        elif gap >= 10:
            sentences.append(
                f"{state_name} has a moderate funding gap ({gap:+.0f} points): federal obligations "
                f"({oblg_str}) are somewhat below what its disaster risk profile would suggest."
            )
        elif gap >= 0:
            sentences.append(
                f"{state_name}'s federal obligation spending ({oblg_str}) is roughly proportional "
                f"to its disaster risk profile ({gap:+.0f} points)."
            )
        else:
            sentences.append(
                f"{state_name} receives relatively high federal obligations ({oblg_str}) compared "
                f"to its disaster risk score ({gap:+.0f} points), suggesting it is well-funded."
            )

    return " ".join(sentences)


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
    total      = [r["total_declarations"] for r in rows]
    # Blend 5-year (weight 2) and 10-year (weight 1) for recency sensitivity
    recency    = [r["declarations_last_5_years"] * 2 + r["declarations_last_10_years"] for r in rows]
    hurricanes = [r["hurricane_count"] for r in rows]

    disaster_scores  = minmax(total)
    recency_scores   = minmax(recency)
    hurricane_scores = minmax(hurricanes)

    # spending_gap_score: activate only when every state has obligation data so
    # that final scores remain comparable across the full dataset.
    obligations = [r.get("obligation_amount") for r in rows]
    has_all_spending = all(o is not None for o in obligations)

    if has_all_spending:
        # Preliminary risk using 3-factor weights (spending_gap's 10% redistributed)
        active = 1.0 - WEIGHTS["spending_gap"]
        wd0 = WEIGHTS["disaster_count"] / active
        wr0 = WEIGHTS["recent_activity"] / active
        wh0 = WEIGHTS["hurricane_exposure"] / active
        prelim_risk = [
            wd0 * disaster_scores[i] + wr0 * recency_scores[i] + wh0 * hurricane_scores[i]
            for i in range(len(rows))
        ]
        risk_percentiles = minmax(prelim_risk)

        spending_per_decl = [
            float(r["obligation_amount"]) / max(r["total_declarations"], 1)
            for r in rows
        ]
        spending_percentiles = minmax(spending_per_decl)

        # Signed difference: positive = high risk / low spending; negative = well-funded
        gap_scores: list[float | None] = [
            round(risk_percentiles[i] - spending_percentiles[i], 2)
            for i in range(len(rows))
        ]  # type: ignore[assignment]
        w_d = WEIGHTS["disaster_count"]
        w_r = WEIGHTS["recent_activity"]
        w_h = WEIGHTS["hurricane_exposure"]
        w_g = WEIGHTS["spending_gap"]
        log.info("Spending gap data present — using 4-factor weights")
    else:
        gap_scores = [None] * len(rows)
        active = 1.0 - WEIGHTS["spending_gap"]
        w_d = WEIGHTS["disaster_count"] / active
        w_r = WEIGHTS["recent_activity"] / active
        w_h = WEIGHTS["hurricane_exposure"] / active
        w_g = 0.0

    score_rows = []
    for i, state_code in enumerate(state_codes):
        d = disaster_scores[i]
        r = recency_scores[i]
        h = hurricane_scores[i]
        g = gap_scores[i]

        if g is not None:
            # Negative gap (well-funded) does not reduce a state's final risk score
            g_contrib = max(0.0, min(100.0, g))
            final = round(w_d * d + w_r * r + w_h * h + w_g * g_contrib, 2)
        else:
            final = round(w_d * d + w_r * r + w_h * h, 2)

        row_data = {
            **rows[i],
            "disaster_count_score":    d,
            "recent_activity_score":   r,
            "hurricane_exposure_score": h,
            "spending_gap_score":      g,
            "final_risk_score":        final,
        }
        explanation = build_explanation(row_data)

        score_rows.append((
            state_code,
            d,     # disaster_count_score
            r,     # recent_activity_score
            h,     # hurricane_exposure_score
            g,     # spending_gap_score (None until USAspending ingested)
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
        log.info("Backfilling fema_region on states table")
        with conn.cursor() as cur:
            execute_values(
                cur,
                "UPDATE states SET fema_region = data.region FROM (VALUES %s) AS data(code, region) WHERE states.state_code = data.code",
                list(FEMA_REGION_MAP.items()),
            )
        conn.commit()
        log.info("fema_region backfill complete")

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
