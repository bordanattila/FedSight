"""
Tests for ingestion.aggregate_risk — pure-Python functions and
DB interactions mocked via unittest.mock.
"""

import pytest
from unittest.mock import MagicMock, patch

from ingestion.aggregate_risk import (
    minmax,
    build_explanation,
    compute_scores,
    AGGREGATE_SQL,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COLS = [
    "state_code",
    "state_name",
    "total_declarations",
    "declarations_last_5_years",
    "declarations_last_10_years",
    "hurricane_count",
    "most_recent_disaster_year",
]

_THREE_STATES = [
    ("TX", "Texas",      200, 30, 60, 15, 2024),
    ("FL", "Florida",    180, 25, 50, 30, 2023),
    ("CA", "California", 100, 10, 20,  0, 2022),
]


def _mock_conn(rows=_THREE_STATES):
    """Return a (conn, cursor) pair whose SELECT yields *rows*."""
    cur = MagicMock()
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    cur.description = [(col,) for col in _COLS]
    cur.fetchall.return_value = list(rows)
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


def _row(final_score, *, total=100, last5=10, hurricanes=5,
         state_name="Test State", d_score=50.0, r_score=50.0, h_score=50.0):
    return {
        "state_name": state_name,
        "total_declarations": total,
        "declarations_last_5_years": last5,
        "hurricane_count": hurricanes,
        "final_risk_score": final_score,
        "disaster_count_score": d_score,
        "recent_activity_score": r_score,
        "hurricane_exposure_score": h_score,
    }


# ---------------------------------------------------------------------------
# minmax()
# ---------------------------------------------------------------------------

class TestMinmax:
    def test_normal_values_full_range(self):
        assert minmax([0.0, 50.0, 100.0]) == [0.0, 50.0, 100.0]

    def test_normal_values_arbitrary(self):
        assert minmax([10.0, 20.0, 30.0]) == [0.0, 50.0, 100.0]

    def test_all_equal_returns_fifty(self):
        assert minmax([7.0, 7.0, 7.0]) == [50.0, 50.0, 50.0]

    def test_two_values_endpoints(self):
        assert minmax([0.0, 100.0]) == [0.0, 100.0]

    def test_single_value_returns_fifty(self):
        # lo == hi triggers the equal-value branch
        assert minmax([42.0]) == [50.0]

    def test_output_length_matches_input(self):
        vals = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert len(minmax(vals)) == len(vals)

    def test_output_bounded_zero_to_hundred(self):
        for v in minmax([3.0, 9.0, 14.0, 27.0]):
            assert 0.0 <= v <= 100.0

    def test_rounding_to_two_decimals(self):
        # (5 - 0) / (7 - 0) * 100 = 71.428... → 71.43
        result = minmax([0.0, 5.0, 7.0])
        assert result[1] == 71.43


# ---------------------------------------------------------------------------
# build_explanation()
# ---------------------------------------------------------------------------

class TestBuildExplanation:
    def test_high_risk_at_threshold(self):
        assert "high risk" in build_explanation(_row(75.0))

    def test_high_risk_above_threshold(self):
        assert "high risk" in build_explanation(_row(90.0))

    def test_moderate_risk_at_threshold(self):
        assert "moderate risk" in build_explanation(_row(45.0))

    def test_moderate_risk_midrange(self):
        assert "moderate risk" in build_explanation(_row(60.0))

    def test_moderate_risk_just_below_high(self):
        assert "moderate risk" in build_explanation(_row(74.99))

    def test_lower_risk_just_below_moderate(self):
        assert "lower risk" in build_explanation(_row(44.99))

    def test_lower_risk_at_zero(self):
        assert "lower risk" in build_explanation(_row(0.0))

    def test_state_name_appears_in_explanation(self):
        assert "Florida" in build_explanation(_row(80.0, state_name="Florida"))

    def test_contains_total_declarations(self):
        assert "123 total declarations" in build_explanation(_row(80.0, total=123))

    def test_contains_last_5_years(self):
        assert "17 in the last five years" in build_explanation(_row(80.0, last5=17))

    def test_contains_hurricane_count(self):
        assert "8 hurricane declarations" in build_explanation(_row(80.0, hurricanes=8))

    def test_zero_hurricanes_omits_hurricane_clause(self):
        result = build_explanation(_row(80.0, hurricanes=0))
        assert "hurricane declarations" not in result

    def test_high_scores_use_strong_language(self):
        result = build_explanation(_row(90.0, d_score=90.0, r_score=90.0, h_score=90.0))
        assert "a high FEMA disaster declaration history" in result
        assert "substantial recent activity" in result
        assert "repeated hurricane-related declarations" in result

    def test_combines_phrasing_for_multiple_factors(self):
        result = build_explanation(_row(80.0, d_score=80.0, r_score=80.0, h_score=30.0))
        assert "combines" in result

    def test_low_scores_use_limited_language(self):
        result = build_explanation(_row(20.0, d_score=10.0, r_score=10.0, h_score=10.0))
        assert "limited" in result

    def test_ends_with_period(self):
        assert build_explanation(_row(60.0)).endswith(".")


# ---------------------------------------------------------------------------
# compute_scores() — one risk row per state
# ---------------------------------------------------------------------------

class TestComputeScores:
    @patch("ingestion.aggregate_risk.execute_values")
    def test_one_risk_row_per_state(self, mock_ev):
        conn, _ = _mock_conn(_THREE_STATES)
        compute_scores(conn)
        mock_ev.assert_called_once()
        inserted = mock_ev.call_args[0][2]
        assert len(inserted) == len(_THREE_STATES)

    @patch("ingestion.aggregate_risk.execute_values")
    def test_state_codes_preserved_in_order(self, mock_ev):
        conn, _ = _mock_conn(_THREE_STATES)
        compute_scores(conn)
        inserted = mock_ev.call_args[0][2]
        assert [r[0] for r in inserted] == ["TX", "FL", "CA"]

    @patch("ingestion.aggregate_risk.execute_values")
    def test_empty_summary_skips_insert(self, mock_ev):
        conn, _ = _mock_conn([])
        compute_scores(conn)
        mock_ev.assert_not_called()

    @patch("ingestion.aggregate_risk.execute_values")
    def test_single_state_produces_one_row(self, mock_ev):
        conn, _ = _mock_conn([("AK", "Alaska", 50, 5, 10, 2, 2020)])
        compute_scores(conn)
        assert len(mock_ev.call_args[0][2]) == 1

    @patch("ingestion.aggregate_risk.execute_values")
    def test_scores_are_numeric(self, mock_ev):
        conn, _ = _mock_conn(_THREE_STATES)
        compute_scores(conn)
        for row in mock_ev.call_args[0][2]:
            # row: (state_code, d_score, r_score, h_score, gap_score, final, explanation)
            state, d, r, h, gap, final, explanation = row
            assert isinstance(d, float)
            assert isinstance(r, float)
            assert isinstance(h, float)
            assert isinstance(final, float)
            assert gap is None  # spending_gap pending USAspending
            assert isinstance(explanation, str)

    @patch("ingestion.aggregate_risk.execute_values")
    def test_final_scores_in_valid_range(self, mock_ev):
        conn, _ = _mock_conn(_THREE_STATES)
        compute_scores(conn)
        for row in mock_ev.call_args[0][2]:
            final = row[5]
            assert 0.0 <= final <= 100.0


# ---------------------------------------------------------------------------
# Aggregation SQL — structural guarantees
# ---------------------------------------------------------------------------

class TestAggregateSql:
    def test_groups_by_state_code(self):
        assert "GROUP BY state_code" in AGGREGATE_SQL

    def test_upserts_on_conflict(self):
        assert "ON CONFLICT (state_code)" in AGGREGATE_SQL

    def test_targets_state_disaster_summary(self):
        assert "state_disaster_summary" in AGGREGATE_SQL

    def test_sources_fema_disaster_declarations(self):
        assert "fema_disaster_declarations" in AGGREGATE_SQL
