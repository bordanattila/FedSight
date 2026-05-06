import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import App from "./App";
import { fetchAllStateRisks } from "./api";
import type { StateRisk } from "./types";

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

vi.mock("./api");
const mockFetch = vi.mocked(fetchAllStateRisks);

function makeState(overrides: Partial<StateRisk>): StateRisk {
  return {
    state_code: "XX",
    state_name: "Test State",
    fema_region: 1,
    final_risk_score: 50.0,
    disaster_count_score: 50.0,
    recent_activity_score: 50.0,
    hurricane_exposure_score: 50.0,
    spending_gap_score: null,
    explanation: "Test explanation.",
    total_declarations: 100,
    major_disaster_declarations: 80,
    emergency_declarations: 10,
    hurricane_count: 0,
    flood_count: 5,
    fire_count: 3,
    severe_storm_count: 5,
    tornado_count: 2,
    declarations_last_5_years: 10,
    declarations_last_10_years: 25,
    most_recent_disaster_year: 2023,
    obligation_amount: null,
    ...overrides,
  };
}

const FL = makeState({ state_code: "FL", state_name: "Florida",    fema_region: 4,  final_risk_score: 88.0, hurricane_count: 30, obligation_amount: 8_000_000_000 });
const TX = makeState({ state_code: "TX", state_name: "Texas",      fema_region: 6,  final_risk_score: 84.0, hurricane_count: 15, obligation_amount: 5_000_000_000 });
const CA = makeState({ state_code: "CA", state_name: "California", fema_region: 9,  final_risk_score: 72.0, hurricane_count: 0  });
const AK = makeState({ state_code: "AK", state_name: "Alaska",     fema_region: 10, final_risk_score: 30.0, hurricane_count: 0  });
const ME = makeState({ state_code: "ME", state_name: "Maine",      fema_region: 1,  final_risk_score: 20.0, hurricane_count: 0  });

// Five states: FL and TX have hurricanes; only FL is in Region 4.
const FIXTURE = [FL, TX, CA, AK, ME];

describe("App — filter integration", () => {
  beforeEach(() => {
    // Return a minimal valid topology so RiskMap's fetch doesn't hit the network.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          type: "Topology",
          objects: { states: { type: "GeometryCollection", geometries: [] } },
          arcs: [],
        }),
      })
    );
    mockFetch.mockResolvedValue({ states: FIXTURE, count: FIXTURE.length });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup() {
    render(<App />);
    // FilterBar only mounts after data has loaded — waiting for it confirms
    // the loading state has resolved.
    await screen.findByLabelText(/incident type/i);
  }

  it("Hurricane + Region 4 returns only Florida", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Hurricane" } });
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "4" } });
    expect(screen.queryAllByText("Florida").length).toBeGreaterThan(0);
    expect(screen.queryByText("Texas")).not.toBeInTheDocument();
    expect(screen.queryByText("California")).not.toBeInTheDocument();
  });

  it("filtered count updates to '1 of 5 states' for Hurricane + Region 4", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Hurricane" } });
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "4" } });
    expect(screen.getByText("1 of 5 states")).toBeInTheDocument();
  });

  it("Clear button resets to all 5 states", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Hurricane" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByText("5 states")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("filtered-out states do not appear in top 3 cards", async () => {
    await setup();
    // Filter to Region 4 only — only FL qualifies; TX and CA are removed.
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "4" } });
    expect(screen.queryByText("Texas")).not.toBeInTheDocument();
    expect(screen.queryByText("California")).not.toBeInTheDocument();
    // Florida remains visible (appears in both the card and the ranked table).
    expect(screen.queryAllByText("Florida").length).toBeGreaterThan(0);
  });

  it("empty filter combination shows a no-results message", async () => {
    await setup();
    // Hurricane + Region 10 → AK has hurricane_count = 0 → empty result set.
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Hurricane" } });
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "10" } });
    expect(screen.getByText(/no states match/i)).toBeInTheDocument();
  });

  it("spending chart reflects the active filter", async () => {
    await setup();
    const spendingSection = screen.getByTestId("spending-chart");

    // Unfiltered: FL and TX have obligation_amount; CA, AK, ME do not → 2 bars.
    expect(within(spendingSection).getByTestId("bar-chart")).toHaveAttribute("data-item-count", "2");

    // Filter to Region 4 → only FL passes → 1 bar.
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "4" } });
    expect(within(spendingSection).getByTestId("bar-chart")).toHaveAttribute("data-item-count", "1");
  });
});
