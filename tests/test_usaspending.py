"""
Tests for ingestion.usaspending — API response parser and upsert logic.

All network calls and DB interactions are mocked; no real DB is needed.
"""

import pytest
from unittest.mock import MagicMock, patch
from requests.exceptions import HTTPError

from ingestion.usaspending import (
    fetch_state_obligations,
    upsert_obligations,
    DEF_CODES_STR,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_conn(rowcount: int = 2):
    cur = MagicMock()
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    cur.rowcount = rowcount
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn, cur


def _mock_response(body: dict, status_ok: bool = True):
    resp = MagicMock()
    resp.json.return_value = body
    if not status_ok:
        resp.raise_for_status.side_effect = HTTPError("HTTP Error")
    else:
        resp.raise_for_status.return_value = None
    return resp


# ---------------------------------------------------------------------------
# fetch_state_obligations() — API response parser
# ---------------------------------------------------------------------------

class TestFetchStateObligations:
    @patch("ingestion.usaspending.requests.post")
    def test_returns_results_list(self, mock_post):
        mock_post.return_value = _mock_response(
            {"results": [{"shape_code": "TX", "amount": 5_000_000_000}]}
        )
        result = fetch_state_obligations()
        assert result == [{"shape_code": "TX", "amount": 5_000_000_000}]

    @patch("ingestion.usaspending.requests.post")
    def test_returns_all_items_in_results(self, mock_post):
        items = [
            {"shape_code": "TX", "amount": 5e9},
            {"shape_code": "FL", "amount": 8e9},
            {"shape_code": "CA", "amount": 3e9},
        ]
        mock_post.return_value = _mock_response({"results": items})
        assert fetch_state_obligations() == items

    @patch("ingestion.usaspending.requests.post")
    def test_empty_list_when_results_key_missing(self, mock_post):
        mock_post.return_value = _mock_response({"meta": {}})
        assert fetch_state_obligations() == []

    @patch("ingestion.usaspending.requests.post")
    def test_empty_list_when_results_is_empty(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        assert fetch_state_obligations() == []

    @patch("ingestion.usaspending.requests.post")
    def test_raises_on_http_error(self, mock_post):
        mock_post.return_value = _mock_response({}, status_ok=False)
        with pytest.raises(HTTPError):
            fetch_state_obligations()

    @patch("ingestion.usaspending.requests.post")
    def test_posts_to_correct_endpoint(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        url = mock_post.call_args[0][0]
        assert "spending_by_geography" in url

    @patch("ingestion.usaspending.requests.post")
    def test_payload_includes_def_codes(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        payload = mock_post.call_args[1]["json"]
        assert "def_codes" in payload["filter"]

    @patch("ingestion.usaspending.requests.post")
    def test_payload_requests_state_geo_layer(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        payload = mock_post.call_args[1]["json"]
        assert payload["geo_layer"] == "state"

    @patch("ingestion.usaspending.requests.post")
    def test_payload_uses_recipient_location_scope(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        payload = mock_post.call_args[1]["json"]
        assert payload["scope"] == "recipient_location"

    @patch("ingestion.usaspending.requests.post")
    def test_payload_uses_obligation_spending_type(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        payload = mock_post.call_args[1]["json"]
        assert payload["spending_type"] == "obligation"

    @patch("ingestion.usaspending.requests.post")
    def test_payload_includes_expected_def_codes(self, mock_post):
        mock_post.return_value = _mock_response({"results": []})
        fetch_state_obligations()
        payload = mock_post.call_args[1]["json"]
        sent = payload["filter"]["def_codes"]
        assert set(sent) == {"L", "M", "N", "O", "P", "U"}


# ---------------------------------------------------------------------------
# upsert_obligations() — row insertion / update
# ---------------------------------------------------------------------------

class TestUpsertObligations:
    @patch("ingestion.usaspending.execute_values")
    def test_returns_cursor_rowcount(self, mock_ev):
        conn, cur = _mock_conn(rowcount=3)
        results = [
            {"shape_code": "TX", "amount": 5e9},
            {"shape_code": "FL", "amount": 8e9},
            {"shape_code": "CA", "amount": 3e9},
        ]
        assert upsert_obligations(conn, results) == 3

    @patch("ingestion.usaspending.execute_values")
    def test_empty_results_returns_zero_without_db_call(self, mock_ev):
        conn, _ = _mock_conn()
        assert upsert_obligations(conn, []) == 0
        mock_ev.assert_not_called()

    @patch("ingestion.usaspending.execute_values")
    def test_skips_code_shorter_than_two_chars(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [
            {"shape_code": "T", "amount": 1e9},
            {"shape_code": "TX", "amount": 5e9},
        ])
        rows = mock_ev.call_args[0][2]
        assert all(r[0] == "TX" for r in rows)
        assert len(rows) == 1

    @patch("ingestion.usaspending.execute_values")
    def test_skips_code_longer_than_two_chars(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [
            {"shape_code": "TEX", "amount": 1e9},
            {"shape_code": "TX", "amount": 5e9},
        ])
        rows = mock_ev.call_args[0][2]
        assert len(rows) == 1
        assert rows[0][0] == "TX"

    @patch("ingestion.usaspending.execute_values")
    def test_uppercases_state_code(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [{"shape_code": "tx", "amount": 5e9}])
        rows = mock_ev.call_args[0][2]
        assert rows[0][0] == "TX"

    @patch("ingestion.usaspending.execute_values")
    def test_strips_whitespace_from_code(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [{"shape_code": " TX ", "amount": 5e9}])
        rows = mock_ev.call_args[0][2]
        assert rows[0][0] == "TX"

    @patch("ingestion.usaspending.execute_values")
    def test_row_structure_is_code_amount_def_codes(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [{"shape_code": "TX", "amount": 5_000_000_000}])
        code, amount, def_codes = mock_ev.call_args[0][2][0]
        assert code == "TX"
        assert amount == 5_000_000_000
        assert def_codes == DEF_CODES_STR

    @patch("ingestion.usaspending.execute_values")
    def test_passes_none_amount_through(self, mock_ev):
        conn, _ = _mock_conn()
        upsert_obligations(conn, [{"shape_code": "TX", "amount": None}])
        _, amount, _ = mock_ev.call_args[0][2][0]
        assert amount is None

    @patch("ingestion.usaspending.execute_values")
    def test_all_valid_rows_passed_to_execute_values(self, mock_ev):
        conn, _ = _mock_conn(rowcount=2)
        upsert_obligations(conn, [
            {"shape_code": "TX", "amount": 5e9},
            {"shape_code": "FL", "amount": 8e9},
        ])
        assert len(mock_ev.call_args[0][2]) == 2
