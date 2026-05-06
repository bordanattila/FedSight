import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SpendingChart, CustomTooltip } from "./SpendingChart";
import type { StateRisk } from "../types";
import { DEFAULT_FILTERS } from "../lib/filterStates";

// Recharts uses ResizeObserver and SVG rendering that jsdom doesn't support.
// Replace every export with a minimal stub so interaction tests can run.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <>{children}</>,
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-item-count={String(data?.length ?? 0)}>
      {children}
    </div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function makeState(overrides: Partial<StateRisk> = {}): StateRisk {
  return {
    state_code: "TX",
    state_name: "Texas",
    fema_region: 6,
    final_risk_score: 84.0,
    disaster_count_score: 80.0,
    recent_activity_score: 70.0,
    hurricane_exposure_score: 75.0,
    spending_gap_score: 60.0,
    explanation: null,
    total_declarations: 200,
    major_disaster_declarations: 160,
    emergency_declarations: 20,
    hurricane_count: 15,
    flood_count: 40,
    fire_count: 30,
    severe_storm_count: 50,
    tornado_count: 20,
    declarations_last_5_years: 30,
    declarations_last_10_years: 60,
    most_recent_disaster_year: 2024,
    obligation_amount: 5_000_000_000,
    ...overrides,
  };
}

const TX = makeState();
const FL = makeState({
  state_code: "FL",
  state_name: "Florida",
  obligation_amount: 8_000_000_000,
  spending_gap_score: 20.0,
});
const NO_SPEND = makeState({
  state_code: "CA",
  state_name: "California",
  obligation_amount: null,
  spending_gap_score: null,
});

describe("SpendingChart — empty state", () => {
  it("shows empty message when all states have null obligation_amount", () => {
    render(<SpendingChart states={[NO_SPEND]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText(/no spending data available/i)).toBeInTheDocument();
  });

  it("does not render the bar chart when there is no data", () => {
    render(<SpendingChart states={[NO_SPEND]} filters={DEFAULT_FILTERS} />);
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("shows empty message when states array is empty", () => {
    render(<SpendingChart states={[]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText(/no spending data available/i)).toBeInTheDocument();
  });

  it("names the ingestion command in the empty message", () => {
    render(<SpendingChart states={[NO_SPEND]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText(/python -m ingestion\.usaspending/)).toBeInTheDocument();
  });

  it("still renders the section heading in the empty state", () => {
    render(<SpendingChart states={[NO_SPEND]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("SpendingChart — chart renders with data", () => {
  it("renders the bar chart when at least one state has obligation data", () => {
    render(<SpendingChart states={[TX]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("excludes states with null obligation_amount", () => {
    render(<SpendingChart states={[TX, NO_SPEND]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-item-count", "1");
  });

  it("passes all states with spending data to the chart", () => {
    render(<SpendingChart states={[TX, FL]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-item-count", "2");
  });

  it("mixes data and no-data states correctly", () => {
    render(<SpendingChart states={[TX, NO_SPEND, FL]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-item-count", "2");
  });
});

describe("SpendingChart — heading and filter label", () => {
  it("renders a level-2 heading", () => {
    render(<SpendingChart states={[TX]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("heading shows 'All States' for default filters", () => {
    render(<SpendingChart states={[TX]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("All States");
  });

  it("heading includes incident type when that filter is active", () => {
    const filters = { ...DEFAULT_FILTERS, incidentType: "Hurricane" };
    render(<SpendingChart states={[TX]} filters={filters} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Hurricane");
  });

  it("heading includes FEMA region when that filter is active", () => {
    const filters = { ...DEFAULT_FILTERS, femaRegion: "6" };
    render(<SpendingChart states={[TX]} filters={filters} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Region 6");
  });

  it("heading includes 'Last 5 Years' when time range filter is active", () => {
    const filters = { ...DEFAULT_FILTERS, timeRange: "last5" };
    render(<SpendingChart states={[TX]} filters={filters} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Last 5 Years");
  });

  it("empty-state heading also reflects active filters", () => {
    const filters = { ...DEFAULT_FILTERS, incidentType: "Flood" };
    render(<SpendingChart states={[NO_SPEND]} filters={filters} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Flood");
  });
});

describe("SpendingChart — subheading legend", () => {
  it("renders DEF codes reference in the subheading", () => {
    render(<SpendingChart states={[TX]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText(/def codes/i)).toBeInTheDocument();
  });

  it("mentions gap colour coding", () => {
    render(<SpendingChart states={[TX]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByText(/high gap/i)).toBeInTheDocument();
    expect(screen.getByText(/low gap/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CustomTooltip — content tests
// ---------------------------------------------------------------------------

function makePayload(overrides: Record<string, unknown> = {}) {
  return [{
    payload: {
      state_code: "TX",
      state_name: "Texas",
      obligation_amount: 5_000_000_000,
      obligation_millions: 5_000,
      total_declarations: 200,
      spending_gap_score: 85.0,
      per_declaration: 25_000_000,
      ...overrides,
    },
  }];
}

describe("CustomTooltip — fields", () => {
  it("renders state name", () => {
    render(<CustomTooltip active payload={makePayload()} />);
    expect(screen.getByText("Texas")).toBeInTheDocument();
  });

  it("renders obligation amount", () => {
    render(<CustomTooltip active payload={makePayload()} />);
    expect(screen.getByText(/obligation/i)).toBeInTheDocument();
    expect(screen.getByText(/\$5(\.\d)?B/)).toBeInTheDocument();
  });

  it("renders declarations count", () => {
    render(<CustomTooltip active payload={makePayload()} />);
    expect(screen.getByText(/declarations/i)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
  });

  it("renders per-declaration value", () => {
    render(<CustomTooltip active payload={makePayload()} />);
    expect(screen.getByText(/per declaration/i)).toBeInTheDocument();
    expect(screen.getByText(/\$25(\.\d)?M/)).toBeInTheDocument();
  });

  it("renders spending gap score", () => {
    render(<CustomTooltip active payload={makePayload()} />);
    expect(screen.getByText(/spending gap score/i)).toBeInTheDocument();
    expect(screen.getByText(/85\.0/)).toBeInTheDocument();
  });

  it("omits gap score when spending_gap_score is null", () => {
    render(<CustomTooltip active payload={makePayload({ spending_gap_score: null })} />);
    expect(screen.queryByText(/spending gap score/i)).not.toBeInTheDocument();
  });

  it("omits declarations and per-declaration when total_declarations is null", () => {
    render(<CustomTooltip active payload={makePayload({ total_declarations: null, per_declaration: null })} />);
    expect(screen.queryByText(/declarations:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/per declaration/i)).not.toBeInTheDocument();
  });

  it("renders nothing when active is false", () => {
    const { container } = render(<CustomTooltip active={false} payload={makePayload()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when payload is empty", () => {
    const { container } = render(<CustomTooltip active payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// SpendingChart — null spending_gap_score
// ---------------------------------------------------------------------------

describe("SpendingChart — null spending_gap_score", () => {
  const NO_GAP = makeState({
    state_code: "WY",
    state_name: "Wyoming",
    spending_gap_score: null,
    obligation_amount: 2_000_000_000,
  });

  it("still renders the bar chart when spending_gap_score is null", () => {
    render(<SpendingChart states={[NO_GAP]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  it("passes the row to the chart even without a gap score", () => {
    render(<SpendingChart states={[NO_GAP]} filters={DEFAULT_FILTERS} />);
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-item-count", "1");
  });
});
