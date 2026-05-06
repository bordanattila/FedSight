"""
Ingest USAspending state-level disaster obligation data.

Calls the USAspending geography API for DEF codes L, M, N, O, P, U
(supplemental disaster appropriations) and upserts results into
usaspending_disaster_spending.

Usage:
    python -m ingestion.usaspending
"""

import logging
import os

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

log = logging.getLogger(__name__)

API_URL = os.getenv(
    "USASPENDING_API_URL",
    "https://api.usaspending.gov/api/v2/disaster/spending_by_geography/",
)
DEF_CODES = os.getenv("USASPENDING_DEF_CODES", "L,M,N,O,P,U").split(",")
DEF_CODES_STR = ",".join(DEF_CODES)


def fetch_state_obligations() -> list[dict]:
    """POST to USAspending geo_filter and return the results list."""
    payload = {
        "filter": {"def_codes": DEF_CODES},
        "geo_layer": "state",
        "scope": "recipient_location",
        "spending_type": "obligation",
    }
    resp = requests.post(API_URL, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json().get("results", [])


def upsert_obligations(conn, results: list[dict]) -> int:
    """Upsert state obligation rows; returns the number of rows written."""
    rows = []
    for r in results:
        code = (r.get("shape_code") or "").upper().strip()
        if len(code) != 2:
            continue
        amount = r.get("amount")
        rows.append((code, amount, DEF_CODES_STR))

    if not rows:
        return 0

    with conn.cursor() as cur:
        # Join against the states table so codes that were never ingested
        # (military APO/FPO codes such as AP, AE, AA) are silently skipped.
        execute_values(
            cur,
            """
            INSERT INTO usaspending_disaster_spending (state_code, obligation_amount, def_codes)
            SELECT t.state_code, t.obligation_amount::NUMERIC, t.def_codes
            FROM (VALUES %s) AS t(state_code, obligation_amount, def_codes)
            WHERE t.state_code IN (SELECT state_code FROM states)
            ON CONFLICT (state_code) DO UPDATE SET
                obligation_amount = EXCLUDED.obligation_amount,
                def_codes         = EXCLUDED.def_codes,
                fetched_at        = NOW()
            """,
            rows,
        )
        return cur.rowcount


def run() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        log.info("Fetching state obligation totals from USAspending (DEF codes %s)", DEF_CODES)
        results = fetch_state_obligations()
        log.info("Received %d state results from API", len(results))

        count = upsert_obligations(conn, results)
        conn.commit()
        log.info("Upserted %d state obligation rows", count)
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
