![Tests](https://github.com/bordanattila/FedSight/actions/workflows/test.yml/badge.svg)

# FedSight

Decision-support tool for FEMA-style regional risk analysis. Combines FEMA disaster declarations, USAspending federal obligations, and NOAA hurricane track data into a state-level risk map.

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI + Uvicorn |
| Database | PostgreSQL + SQLAlchemy + Alembic |
| Frontend | React + TypeScript |
| Map | React map component (deck.gl / Leaflet) |
| Data ingestion | Python scripts (FEMA, USAspending, NOAA) |

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+

## Setup

### 1. Database

```bash
createdb fedsight
psql fedsight < db/schema.sql
```

### 2. Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set DATABASE_URL
```

### 3. Frontend

```bash
cd frontend
npm install
```

## Running

**Backend API**
```bash
uvicorn backend.main:app --reload
```

**Frontend**
```bash
cd frontend
npm run dev
```

## Data Ingestion

Run ingestion scripts in order:

```bash
# 1. FEMA disaster declarations (full load ~70k records)
python -m ingestion.fema_declarations

# Limit to a single state for testing
python -m ingestion.fema_declarations --state TX
```

USAspending and NOAA ingestion scripts are pending (build steps 4–5).

## Project Structure

```
FedSight/
├── backend/          FastAPI app, routes, models
├── frontend/         React + TypeScript + map component
├── ingestion/        Data ingestion scripts
├── db/               SQL schema and migrations
├── tests/            pytest backend tests
└── docker-compose.yml
```

## Risk Score Composition

Each state receives a `final_risk_score` built from four sub-scores stored in `state_risk_scores`:

| Score | Source |
|---|---|
| `disaster_count_score` | FEMA declaration frequency |
| `recent_activity_score` | Declarations in last 5 / 10 years |
| `hurricane_exposure_score` | NOAA track landfall proximity |
| `spending_gap_score` | USAspending obligations vs. disaster severity |
