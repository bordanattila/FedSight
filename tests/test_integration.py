"""
End-to-end integration tests against a real PostgreSQL database.

These tests only run when DATABASE_URL points to a database whose name
contains 'fedsight_test' (the GitHub Actions test database).  They are
skipped automatically in any environment where DATABASE_URL points to a
production database.

Prerequisite: db/schema.sql must have been applied (done by the CI
"Apply schema" step before pytest runs).
"""

import os

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
    """Wipe all test tables before and after each test for isolation."""
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


def _seed(db):
    """Insert TX and FL with a small set of known declarations."""
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO states (state_code, state_name)
            VALUES ('TX', 'Texas'), ('FL', 'Florida')
        """)
        cur.execute("""
            INSERT INTO fema_disaster_declarations
                (disaster_number, state_code, declaration_type,
                 declaration_date, incident_type, source_id)
            VALUES
                -- TX: 3 total, 2 Hurricane, 1 Flood
                (1001, 'TX', 'DR', '2020-06-01', 'Hurricane', 'tx-1'),
                (1002, 'TX', 'DR', '2015-03-01', 'Flood',     'tx-2'),
                (1003, 'TX', 'EM', '2010-01-01', 'Hurricane', 'tx-3'),
                -- FL: 2 total, 2 Hurricane
                (2001, 'FL', 'DR', '2022-09-01', 'Hurricane', 'fl-1'),
                (2002, 'FL', 'DR', '2021-08-01', 'Hurricane', 'fl-2')
        """)
    db.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAggregationPipeline:
    def test_state_disaster_summary_populated(self, db):
        _seed(db)
        from ingestion.aggregate_risk import run
        run()

        with db.cursor() as cur:
            cur.execute("""
                SELECT total_declarations, hurricane_count, flood_count
                FROM state_disaster_summary
                WHERE state_code = 'TX'
            """)
            row = cur.fetchone()

        assert row is not None, "TX row missing from state_disaster_summary"
        total, hurricanes, floods = row
        assert total == 3
        assert hurricanes == 2
        assert floods == 1

    def test_all_seeded_states_get_summary_rows(self, db):
        _seed(db)
        from ingestion.aggregate_risk import run
        run()

        with db.cursor() as cur:
            cur.execute("SELECT state_code FROM state_disaster_summary ORDER BY state_code")
            codes = [r[0] for r in cur.fetchall()]

        assert codes == ["FL", "TX"]

    def test_state_risk_scores_populated(self, db):
        _seed(db)
        from ingestion.aggregate_risk import run
        run()

        with db.cursor() as cur:
            cur.execute("""
                SELECT state_code, final_risk_score, explanation
                FROM state_risk_scores
                ORDER BY state_code
            """)
            rows = cur.fetchall()

        assert len(rows) == 2
        for code, score, explanation in rows:
            assert score is not None, f"{code}: final_risk_score is NULL"
            assert 0.0 <= float(score) <= 100.0, f"{code}: score {score} out of range"
            assert isinstance(explanation, str) and len(explanation) > 0

    def test_fema_region_backfilled_on_states(self, db):
        _seed(db)
        from ingestion.aggregate_risk import run
        run()

        with db.cursor() as cur:
            cur.execute("""
                SELECT state_code, fema_region
                FROM states
                ORDER BY state_code
            """)
            rows = dict(cur.fetchall())

        assert rows["FL"] == 4, f"FL fema_region expected 4, got {rows['FL']}"
        assert rows["TX"] == 6, f"TX fema_region expected 6, got {rows['TX']}"
