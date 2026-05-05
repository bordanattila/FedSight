import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TopRiskCards } from './TopRiskCards';
import type { StateRisk } from '../types';

const FL: StateRisk = {
  state_code: 'FL', state_name: 'Florida', fema_region: 4,
  final_risk_score: 88.5,
  disaster_count_score: 90.0, recent_activity_score: 85.0,
  hurricane_exposure_score: 95.0, spending_gap_score: null,
  explanation: 'High risk. 300 total FEMA declarations; 40 in the last 5 years; 30 hurricane declaration(s).',
  total_declarations: 300, major_disaster_declarations: 250,
  hurricane_count: 30, declarations_last_5_years: 40,
  most_recent_disaster_year: 2024,
};

const CA: StateRisk = {
  state_code: 'CA', state_name: 'California', fema_region: 9,
  final_risk_score: 55.0,
  disaster_count_score: 60.0, recent_activity_score: 50.0,
  hurricane_exposure_score: 5.0, spending_gap_score: null,
  explanation: 'Moderate risk. 180 total FEMA declarations; 20 in the last 5 years; 0 hurricane declaration(s).',
  total_declarations: 180, major_disaster_declarations: 140,
  hurricane_count: 0, declarations_last_5_years: 20,
  most_recent_disaster_year: 2022,
};

const ME: StateRisk = {
  state_code: 'ME', state_name: 'Maine', fema_region: 1,
  final_risk_score: 25.0,
  disaster_count_score: 20.0, recent_activity_score: 15.0,
  hurricane_exposure_score: 8.0, spending_gap_score: null,
  explanation: 'Lower risk. 50 total FEMA declarations; 5 in the last 5 years; 2 hurricane declaration(s).',
  total_declarations: 50, major_disaster_declarations: 40,
  hurricane_count: 2, declarations_last_5_years: 5,
  most_recent_disaster_year: 2019,
};

const THREE = [FL, CA, ME];

describe('TopRiskCards', () => {
  it('renders heading with correct state count', () => {
    render(<TopRiskCards states={THREE} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Top 3 Highest-Risk States');
  });

  it('heading updates when fewer states are passed', () => {
    render(<TopRiskCards states={[FL]} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Top 1 Highest-Risk States');
  });

  it('renders a rank badge for each state', () => {
    render(<TopRiskCards states={THREE} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('renders each state name', () => {
    render(<TopRiskCards states={THREE} />);
    expect(screen.getByText('Florida')).toBeInTheDocument();
    expect(screen.getByText('California')).toBeInTheDocument();
    expect(screen.getByText('Maine')).toBeInTheDocument();
  });

  it('renders each state code', () => {
    render(<TopRiskCards states={THREE} />);
    expect(screen.getByText('FL')).toBeInTheDocument();
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.getByText('ME')).toBeInTheDocument();
  });

  it('renders the numeric risk score', () => {
    render(<TopRiskCards states={[FL]} />);
    expect(screen.getByText('88.5')).toBeInTheDocument();
  });

  it('shows High Risk tier for score >= 75', () => {
    render(<TopRiskCards states={[FL]} />);
    expect(screen.getByText('High Risk')).toBeInTheDocument();
  });

  it('shows Moderate Risk tier for 45 <= score < 75', () => {
    render(<TopRiskCards states={[CA]} />);
    expect(screen.getByText('Moderate Risk')).toBeInTheDocument();
  });

  it('shows Lower Risk tier for score < 45', () => {
    render(<TopRiskCards states={[ME]} />);
    expect(screen.getByText('Lower Risk')).toBeInTheDocument();
  });

  it('renders declaration stats in the card', () => {
    render(<TopRiskCards states={[FL]} />);
    expect(screen.getByText('300')).toBeInTheDocument();  // total
    expect(screen.getByText('40')).toBeInTheDocument();   // last 5 yrs
    expect(screen.getByText('30')).toBeInTheDocument();   // hurricanes
  });

  it('renders the explanation text', () => {
    render(<TopRiskCards states={[FL]} />);
    expect(screen.getByText(FL.explanation!)).toBeInTheDocument();
  });

  it('renders em-dash when score is null', () => {
    render(<TopRiskCards states={[{ ...FL, final_risk_score: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
