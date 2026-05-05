"""
Ingests FEMA Disaster Declaration Summaries into fema_disaster_declarations
and auto-populates the states table from encountered records.

Usage:
    python -m ingestion.fema_declarations
    python -m ingestion.fema_declarations --state TX
"""

import argparse
import logging
import os

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

load_dotenv()

log = logging.getLogger(__name__)

API_URL = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries"
PAGE_SIZE = 1000

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "VI": "Virgin Islands", "GU": "Guam",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
}


def fetch_page(skip: int, state_filter: str | None) -> list[dict]:
    params = {
        "$format": "json",
        "$top": PAGE_SIZE,
        "$skip": skip,
        "$orderby": "id asc",
    }
    if state_filter:
        params["$filter"] = f"state eq '{state_filter}'"

    resp = requests.get(API_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("DisasterDeclarationsSummaries", [])


def upsert_states(conn, records: list[dict]) -> None:
    seen = {}
    for r in records:
        code = r.get("state")
        if code and code not in seen:
            seen[code] = r.get("fipsStateCode")

    if not seen:
        return

    rows = [
        (code, STATE_NAMES.get(code, code), fips)
        for code, fips in seen.items()
    ]
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO states (state_code, state_name, fips_state_code)
            VALUES %s
            ON CONFLICT (state_code) DO UPDATE
                SET fips_state_code = EXCLUDED.fips_state_code
            """,
            rows,
        )


def upsert_declarations(conn, records: list[dict]) -> None:
    rows = []
    for r in records:
        dit = r.get("designatedIncidentTypes")
        if isinstance(dit, list):
            dit = ",".join(dit)

        rows.append((
            r.get("disasterNumber"),
            r.get("femaDeclarationString"),
            r.get("state"),
            r.get("declarationType"),
            r.get("declarationDate"),
            r.get("fyDeclared"),
            r.get("incidentType"),
            r.get("declarationTitle"),
            r.get("ihProgramDeclared"),
            r.get("iaProgramDeclared"),
            r.get("paProgramDeclared"),
            r.get("hmProgramDeclared"),
            r.get("incidentBeginDate"),
            r.get("incidentEndDate"),
            r.get("disasterCloseoutDate"),
            r.get("tribalRequest"),
            r.get("fipsStateCode"),
            r.get("fipsCountyCode"),
            r.get("placeCode"),
            r.get("designatedArea"),
            r.get("declarationRequestNumber"),
            r.get("lastIAFilingDate"),
            r.get("incidentId"),
            r.get("region"),
            dit,
            r.get("lastRefresh"),
            r.get("hash"),
            r.get("id"),
        ))

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO fema_disaster_declarations (
                disaster_number, fema_declaration_string, state_code,
                declaration_type, declaration_date, fy_declared,
                incident_type, declaration_title,
                ih_program_declared, ia_program_declared,
                pa_program_declared, hm_program_declared,
                incident_begin_date, incident_end_date, disaster_closeout_date,
                tribal_request,
                fips_state_code, fips_county_code, place_code, designated_area,
                declaration_request_number, last_ia_filing_date,
                incident_id, region, designated_incident_types,
                last_refresh, source_hash, source_id
            ) VALUES %s
            ON CONFLICT (source_id) DO UPDATE SET
                last_refresh          = EXCLUDED.last_refresh,
                source_hash           = EXCLUDED.source_hash,
                disaster_closeout_date = EXCLUDED.disaster_closeout_date,
                incident_end_date     = EXCLUDED.incident_end_date
            """,
            rows,
        )


def run(state_filter: str | None = None) -> None:
    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url)

    try:
        skip = 0
        total = 0

        while True:
            log.info("Fetching records %d – %d%s",
                     skip, skip + PAGE_SIZE - 1,
                     f" (state={state_filter})" if state_filter else "")

            records = fetch_page(skip, state_filter)
            if not records:
                break

            upsert_states(conn, records)
            upsert_declarations(conn, records)
            conn.commit()

            total += len(records)
            log.info("Committed %d records (running total: %d)", len(records), total)

            if len(records) < PAGE_SIZE:
                break

            skip += PAGE_SIZE

        log.info("Ingestion complete — %d total records", total)

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

    parser = argparse.ArgumentParser(description="Ingest FEMA disaster declarations")
    parser.add_argument("--state", metavar="XX",
                        help="Two-letter state code to limit ingestion (e.g. TX)")
    args = parser.parse_args()

    run(state_filter=args.state)
