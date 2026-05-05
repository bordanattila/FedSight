# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hurricane Tracker — a Python project currently in early setup. Only `requirements.txt` exists; no application code has been written yet.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
## Tech stack
FastAPI
PostgreSQL
React
Map visualization

## Project structure
FedSight
├── backend/        FastAPI + PostgreSQL + SQLAlchemy
├── frontend/       React + TypeScript + Map component
├── tests/          pytest backend tests
├── docker-compose.yml
└── README.md

## Build order
1. PostgreSQL database
2. OpenFEMA disaster declaration ingestion
3. React state-level risk map
4. USAspending layer
5. NOAA hurricane exposure layer

## Project name
FedSight

## Project purpose
FedSight is a decision-support tool for FEMA-style regional risk analysis.

## Database schema
state table
CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) UNIQUE NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    fema_region INTEGER,
    fips_state_code VARCHAR(2)
);

fema_disaster_declarations table
CREATE TABLE fema_disaster_declarations (
    id SERIAL PRIMARY KEY,

    disaster_number INTEGER NOT NULL,
    fema_declaration_string VARCHAR(50),
    state_code VARCHAR(2) NOT NULL REFERENCES states(state_code),

    declaration_type VARCHAR(50),
    declaration_date TIMESTAMP,
    fy_declared INTEGER,

    incident_type VARCHAR(100),
    declaration_title TEXT,

    ih_program_declared BOOLEAN,
    ia_program_declared BOOLEAN,
    pa_program_declared BOOLEAN,
    hm_program_declared BOOLEAN,

    incident_begin_date TIMESTAMP,
    incident_end_date TIMESTAMP,
    disaster_closeout_date TIMESTAMP,

    tribal_request BOOLEAN,

    fips_state_code VARCHAR(2),
    fips county_code VARCHAR(5),
    place_code VARCHAR(20),
    designated_area VARCHAR(255),

    declaration_request_number VARCHAR(50),
    last_ia_filing_date TIMESTAMP,
    incident_id VARCHAR(100),
    region INTEGER,
    designated_incident_types TEXT,

    last_refresh TIMESTAMP,
    source_hash TEXT,
    source_id TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

state_disaster_summary table
CREATE TABLE state_disaster_summary (
    id SERIAL PRIMARY KEY,

    state_code VARCHAR(2) NOT NULL REFERENCES states(state_code),

    total_declarations INTEGER DEFAULT 0,
    major_disaster_declarations INTEGER DEFAULT 0,
    emergency_declarations INTEGER DEFAULT 0,

    hurricane_count INTEGER DEFAULT 0,
    flood_count INTEGER DEFAULT 0,
    fire_count INTEGER DEFAULT 0,
    severe_storm_count INTEGER DEFAULT 0,
    tornado_count INTEGER DEFAULT 0,

    declarations_last_5_years INTEGER DEFAULT 0,
    declarations_last_10_years INTEGER DEFAULT 0,

    first_disaster_year INTEGER,
    most_recent_disaster_year INTEGER,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(state_code)
);

usaspending_disaster_spending table
{
  "filter": {
    "def_codes": ["L", "M", "N", "O", "P", "U"]
  },
  "geo_layer": "state",
  "geo_layer_filters": ["NE", "WY", "CO", "IA", "IL", "MI", "IN", "TX"],
  "scope": "recipient_location",
  "spending_type": "obligation"
};

noaa_hurricane_tracks table
CREATE TABLE noaa_hurricane_tracks (
    id SERIAL PRIMARY KEY,

    sid VARCHAR(50) NOT NULL,
    season INTEGER,
    basin VARCHAR(20),
    subbasin VARCHAR(20),
    storm_name VARCHAR(100),

    iso_time TIMESTAMP,
    nature VARCHAR(20),

    latitude NUMERIC(8, 4),
    longitude NUMERIC(8, 4),

    wmo_wind INTEGER,
    wmo_pressure INTEGER,

    usa_wind INTEGER,
    usa_pressure INTEGER,
    usa_sshs INTEGER,

    distance_to_land INTEGER,
    landfall INTEGER,

    storm_speed INTEGER,
    storm_direction INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

state_risk_scores table
CREATE TABLE state_risk_scores (
    id SERIAL PRIMARY KEY,

    state_code VARCHAR(2) NOT NULL REFERENCES states(state_code),

    disaster_count_score NUMERIC(5, 2),
    recent_activity_score NUMERIC(5, 2),
    hurricane_exposure_score NUMERIC(5, 2),
    spending_gap_score NUMERIC(5, 2),

    final_risk_score NUMERIC(5, 2),

    explanation TEXT,

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(state_code)
);

