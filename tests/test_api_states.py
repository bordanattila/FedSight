"""
API tests for /api/states/* endpoints using httpx TestClient.
The database session is overridden with a mock so no real DB is needed.
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db

# ---------------------------------------------------------------------------
# Shared fixture — mock DB rows that look like the JOIN query result
# ---------------------------------------------------------------------------

_MOCK_ROWS = [
    {
        "state_code": "FL",
        "state_name": "Florida",
        "fema_region": 4,
        "final_risk_score": 88.5,
        "disaster_count_score": 90.0,
        "recent_activity_score": 85.0,
        "hurricane_exposure_score": 95.0,
        "spending_gap_score": 24.5,
        "obligation_amount": 8_000_000_000,
        "explanation": "High risk. 300 total FEMA declarations; 40 in the last 5 years; 30 hurricane declaration(s).",
        "total_declarations": 300,
        "major_disaster_declarations": 250,
        "hurricane_count": 30,
        "declarations_last_5_years": 40,
        "most_recent_disaster_year": 2024,
    },
    {
        "state_code": "TX",
        "state_name": "Texas",
        "fema_region": 6,
        "final_risk_score": 76.2,
        "disaster_count_score": 80.0,
        "recent_activity_score": 72.0,
        "hurricane_exposure_score": 70.0,
        "spending_gap_score": None,
        "explanation": "High risk. 280 total FEMA declarations; 35 in the last 5 years; 15 hurricane declaration(s).",
        "total_declarations": 280,
        "major_disaster_declarations": 230,
        "hurricane_count": 15,
        "declarations_last_5_years": 35,
        "most_recent_disaster_year": 2023,
    },
    {
        "state_code": "CA",
        "state_name": "California",
        "fema_region": 9,
        "final_risk_score": 55.0,
        "disaster_count_score": 60.0,
        "recent_activity_score": 50.0,
        "hurricane_exposure_score": 5.0,
        "spending_gap_score": None,
        "explanation": "Moderate risk. 180 total FEMA declarations; 20 in the last 5 years; 0 hurricane declaration(s).",
        "total_declarations": 180,
        "major_disaster_declarations": 140,
        "hurricane_count": 0,
        "declarations_last_5_years": 20,
        "most_recent_disaster_year": 2022,
    },
]


def _make_db_override(rows=_MOCK_ROWS):
    """Return a get_db override whose execute().mappings().all() yields *rows*."""
    mapping_list = [MagicMock(**{"__getitem__": lambda s, k: row[k], **row}) for row in rows]

    # mappings().all() returns objects that support dict() conversion
    class _Mapping(dict):
        pass

    mapping_results = [_Mapping(r) for r in rows]

    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = mapping_results

    mock_db = MagicMock()
    mock_db.execute.return_value = mock_result

    def override():
        yield mock_db

    return override


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _make_db_override()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# GET /api/states/risk
# ---------------------------------------------------------------------------

class TestGetAllStateRisks:
    def test_returns_200(self, client):
        r = client.get("/api/states/risk")
        assert r.status_code == 200

    def test_response_shape(self, client):
        data = client.get("/api/states/risk").json()
        assert "states" in data
        assert "count" in data

    def test_count_matches_states_length(self, client):
        data = client.get("/api/states/risk").json()
        assert data["count"] == len(data["states"])

    def test_count_equals_mock_rows(self, client):
        data = client.get("/api/states/risk").json()
        assert data["count"] == len(_MOCK_ROWS)

    def test_state_fields_present(self, client):
        state = client.get("/api/states/risk").json()["states"][0]
        for field in ("state_code", "state_name", "final_risk_score",
                      "total_declarations", "hurricane_count"):
            assert field in state, f"missing field: {field}"

    def test_ordered_by_risk_score_desc(self, client):
        states = client.get("/api/states/risk").json()["states"]
        scores = [s["final_risk_score"] for s in states if s["final_risk_score"] is not None]
        assert scores == sorted(scores, reverse=True)

    def test_spending_gap_score_returned_when_present(self, client):
        states = client.get("/api/states/risk").json()["states"]
        fl = next(s for s in states if s["state_code"] == "FL")
        assert fl["spending_gap_score"] == 24.5

    def test_obligation_amount_returned_when_present(self, client):
        states = client.get("/api/states/risk").json()["states"]
        fl = next(s for s in states if s["state_code"] == "FL")
        assert fl["obligation_amount"] == 8_000_000_000

    def test_spending_gap_score_is_null_when_not_ingested(self, client):
        states = client.get("/api/states/risk").json()["states"]
        tx = next(s for s in states if s["state_code"] == "TX")
        assert tx["spending_gap_score"] is None

    def test_obligation_amount_is_null_when_not_ingested(self, client):
        states = client.get("/api/states/risk").json()["states"]
        ca = next(s for s in states if s["state_code"] == "CA")
        assert ca["obligation_amount"] is None


# ---------------------------------------------------------------------------
# GET /api/states/top
# ---------------------------------------------------------------------------

class TestGetTopStates:
    def test_returns_200(self, client):
        r = client.get("/api/states/top")
        assert r.status_code == 200

    def test_default_top_3(self, client):
        data = client.get("/api/states/top").json()
        assert data["count"] == 3
        assert len(data["states"]) == 3

    def test_custom_n(self, client):
        data = client.get("/api/states/top?n=2").json()
        assert data["count"] == 2
        assert len(data["states"]) == 2

    def test_n_1_returns_highest_risk_state(self, client):
        states = client.get("/api/states/top?n=1").json()["states"]
        assert states[0]["state_code"] == "FL"

    def test_n_above_10_rejected(self, client):
        r = client.get("/api/states/top?n=11")
        assert r.status_code == 422

    def test_n_below_1_rejected(self, client):
        r = client.get("/api/states/top?n=0")
        assert r.status_code == 422
