"""
End-to-end integration test against a real PostgreSQL database.

Runs only when DATABASE_URL points to fedsight_test (the GitHub Actions
test database).  Skipped automatically in any environment where DATABASE_URL
points to a production database.

Prerequisite: db/schema.sql must have been applied before pytest runs
(done by the CI "Apply schema" step).
"""

import os
from decimal import Decimal

import psycopg2
import pytest

_DB_URL = os.getenv("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    "fedsight_test" not in _DB_URL,
    reason="integration tests require DATABASE_URL pointing to fedsight_test",
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db():
    conn = psycopg2.connect(_DB_URL)
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_tables(db):
    _truncate(db)
    yield
    _truncate(db)


def _truncate(conn):
    with conn.cursor() as cur:
        cur.execute("""
            TRUNCATE
                state_risk_scores,
                state_disaster_summary,
                usaspending_disaster_spending,
                fema_disaster_declarations,
                states
            RESTART IDENTITY CASCADE
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

def test_full_pipeline_with_spending(db):
    """
    Full end-to-end run:
      1. Insert fake states
      2. Insert fake FEMA declaration rows
      3. Insert fake USAspending obligation rows
      4. Run aggregate_risk.run() (backfills fema_region, aggregates, scores)
      5. Assert state_disaster_summary has correct counts
      6. Assert state_risk_scores has valid scores and a float spending_gap_score
      7. Assert fema_region was backfilled on the states table
    """

    # -- 1. States --
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO states (state_code, state_name)
            VALUES ('TX', 'Texas'), ('FL', 'Florida')
        """)

    # -- 2. FEMA declarations --
    # TX: 3 total — 2 Hurricane (DR), 1 Flood (DR)
    # TX: 3 total, 2 Hurricane, 1 Flood — 2 within the last 5 years.
    # FL: 2 total, 2 Hurricane         — 2 within the last 5 years.
    # Equal recency, but TX has more total declarations, so TX ends up with
    # a higher risk percentile and (combined with lower spending/declaration)
    # a clearly positive spending_gap_score vs FL's negative one.
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO fema_disaster_declarations
                (disaster_number, state_code, declaration_type,
                 declaration_date, incident_type, source_id)
            VALUES
                (1001, 'TX', 'DR', '2023-06-01', 'Hurricane', 'tx-1'),
                (1002, 'TX', 'DR', '2022-01-01', 'Flood',     'tx-2'),
                (1003, 'TX', 'EM', '2010-01-01', 'Hurricane', 'tx-3'),
                (2001, 'FL', 'DR', '2022-09-01', 'Hurricane', 'fl-1'),
                (2002, 'FL', 'DR', '2021-08-01', 'Hurricane', 'fl-2')
        """)

    # -- 3. USAspending obligations --
    # TX: $5B across 3 declarations → $1.67B per declaration
    # FL: $8B across 2 declarations → $4B per declaration  (higher spending/decl)
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO usaspending_disaster_spending
                (state_code, obligation_amount, def_codes)
            VALUES
                ('TX', 5000000000.00, 'L,M,N,O,P,U'),
                ('FL', 8000000000.00, 'L,M,N,O,P,U')
        """)

    db.commit()

    # -- 4. Run the full aggregation pipeline --
    from ingestion.aggregate_risk import run
    run()

    # -- 5. Assert state_disaster_summary --
    with db.cursor() as cur:
        cur.execute("""
            SELECT state_code, total_declarations, hurricane_count, flood_count
            FROM state_disaster_summary
            ORDER BY state_code
        """)
        summary = {row[0]: row[1:] for row in cur.fetchall()}

    assert set(summary) == {"FL", "TX"}, "expected rows for both states"

    tx_total, tx_hurr, tx_flood = summary["TX"]
    assert tx_total == 3
    assert tx_hurr  == 2
    assert tx_flood == 1

    fl_total, fl_hurr, fl_flood = summary["FL"]
    assert fl_total == 2
    assert fl_hurr  == 2
    assert fl_flood == 0

    # -- 6. Assert state_risk_scores --
    with db.cursor() as cur:
        cur.execute("""
            SELECT state_code, final_risk_score, spending_gap_score, explanation
            FROM state_risk_scores
            ORDER BY state_code
        """)
        scores = {row[0]: row[1:] for row in cur.fetchall()}

    assert set(scores) == {"FL", "TX"}, "expected risk score rows for both states"

    for code, (final, gap, explanation) in scores.items():
        assert final is not None, f"{code}: final_risk_score is NULL"
        assert 0.0 <= float(final) <= 100.0, f"{code}: score {final} out of range"
        assert gap is not None, f"{code}: spending_gap_score is NULL — spending data was present"
        assert isinstance(explanation, str) and len(explanation) > 0

    # TX has more declarations per dollar than FL → higher gap score
    tx_gap = float(scores["TX"][1])
    fl_gap = float(scores["FL"][1])
    assert tx_gap > fl_gap, (
        f"TX gap ({tx_gap}) should exceed FL gap ({fl_gap}): "
        "TX has lower spending per declaration"
    )

    # -- 7. Assert fema_region backfilled --
    with db.cursor() as cur:
        cur.execute("SELECT state_code, fema_region FROM states ORDER BY state_code")
        regions = dict(cur.fetchall())

    assert regions["TX"] == 6, f"TX fema_region: expected 6, got {regions['TX']}"
    assert regions["FL"] == 4, f"FL fema_region: expected 4, got {regions['FL']}"
