-- FedSight Database Schema

CREATE TABLE states (
    id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) UNIQUE NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    fema_region INTEGER,
    fips_state_code VARCHAR(2)
);

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
    fips_county_code VARCHAR(5),
    place_code VARCHAR(20),
    designated_area VARCHAR(255),

    declaration_request_number VARCHAR(50),
    last_ia_filing_date TIMESTAMP,
    incident_id VARCHAR(100),
    region INTEGER,
    designated_incident_types TEXT,

    last_refresh TIMESTAMP,
    source_hash TEXT,
    source_id TEXT UNIQUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Indexes for common query patterns
CREATE INDEX idx_fema_state_code ON fema_disaster_declarations(state_code);
CREATE INDEX idx_fema_incident_type ON fema_disaster_declarations(incident_type);
CREATE INDEX idx_fema_declaration_date ON fema_disaster_declarations(declaration_date);
CREATE INDEX idx_risk_scores_state ON state_risk_scores(state_code);
CREATE INDEX idx_risk_scores_final ON state_risk_scores(final_risk_score DESC);
