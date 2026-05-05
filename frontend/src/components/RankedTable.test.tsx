import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RankedTable } from './RankedTable';
import type { StateRisk } from '../types';

const FL: StateRisk = {
  state_code: 'FL', state_name: 'Florida', fema_region: 4,
  final_risk_score: 88.5,
  disaster_count_score: 90.0, recent_activity_score: 85.0,
  hurricane_exposure_score: 95.0, spending_gap_score: null,
  explanation: null,
  total_declarations: 300, major_disaster_declarations: 250,
  hurricane_count: 30, declarations_last_5_years: 40,
  most_recent_disaster_year: 2024,
};

const CA: StateRisk = {
  state_code: 'CA', state_name: 'California', fema_region: 9,
  final_risk_score: 55.0,
  disaster_count_score: 60.0, recent_activity_score: 50.0,
  hurricane_exposure_score: 5.0, spending_gap_score: null,
  explanation: null,
  total_declarations: 180, major_disaster_declarations: 140,
  hurricane_count: 0, declarations_last_5_years: 20,
  most_recent_disaster_year: 2022,
};

const ME: StateRisk = {
  state_code: 'ME', state_name: 'Maine', fema_region: 1,
  final_risk_score: 25.0,
  disaster_count_score: 20.0, recent_activity_score: 15.0,
  hurricane_exposure_score: 8.0, spending_gap_score: null,
  explanation: null,
  total_declarations: 50, major_disaster_declarations: 40,
  hurricane_count: 2, declarations_last_5_years: 5,
  most_recent_disaster_year: 2019,
};

const THREE = [FL, CA, ME];

describe('RankedTable', () => {
  it('renders the section heading', () => {
    render(<RankedTable states={THREE} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('All States — Risk Ranking');
  });

  it('renders all column headers', () => {
    render(<RankedTable states={THREE} />);
    for (const header of ['State', 'Risk Score', 'Tier', 'Total Decl.', 'Last 5 Yrs', 'Hurricanes', 'FEMA Region']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('renders one data row per state', () => {
    render(<RankedTable states={THREE} />);
    // getAllByRole('row') includes the header row
    expect(screen.getAllByRole('row')).toHaveLength(THREE.length + 1);
  });

  it('renders rank numbers in order', () => {
    render(<RankedTable states={THREE} />);
    const rows = screen.getAllByRole('row').slice(1); // skip header
    rows.forEach((row, i) => {
      expect(within(row).getByRole('cell', { name: String(i + 1) })).toBeInTheDocument();
    });
  });

  it('renders state names', () => {
    render(<RankedTable states={THREE} />);
    expect(screen.getByText('Florida')).toBeInTheDocument();
    expect(screen.getByText('California')).toBeInTheDocument();
    expect(screen.getByText('Maine')).toBeInTheDocument();
  });

  it('renders state code badges', () => {
    render(<RankedTable states={THREE} />);
    expect(screen.getByText('FL')).toBeInTheDocument();
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.getByText('ME')).toBeInTheDocument();
  });

  it('renders formatted risk scores', () => {
    render(<RankedTable states={THREE} />);
    expect(screen.getByText('88.5')).toBeInTheDocument();
    expect(screen.getByText('55.0')).toBeInTheDocument();
    expect(screen.getByText('25.0')).toBeInTheDocument();
  });

  it('shows High badge for score >= 75', () => {
    render(<RankedTable states={[FL]} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows Moderate badge for 45 <= score < 75', () => {
    render(<RankedTable states={[CA]} />);
    expect(screen.getByText('Moderate')).toBeInTheDocument();
  });

  it('shows Lower badge for score < 45', () => {
    render(<RankedTable states={[ME]} />);
    expect(screen.getByText('Lower')).toBeInTheDocument();
  });

  it('renders em-dash when score is null', () => {
    render(<RankedTable states={[{ ...FL, final_risk_score: null }]} />);
    // Score cell and badge both show "—" when score is null
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('renders FEMA region numbers', () => {
    render(<RankedTable states={[FL]} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders total declarations', () => {
    render(<RankedTable states={[FL]} />);
    expect(screen.getByText('300')).toBeInTheDocument();
  });
});
