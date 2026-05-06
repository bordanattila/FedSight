import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RiskMap } from "./RiskMap";
import type { StateRisk } from "../types";

// Mock d3-geo so every feature produces a non-null SVG path string regardless of
// coordinates — the projection math is covered by d3 itself; here we test interactions.
vi.mock("d3-geo", () => ({
  geoAlbersUsa: () => ({ scale: () => ({ translate: () => ({}) }) }),
  geoPath: () => () => "M0 0 L100 0 L100 100 Z",
}));

// Minimal topology — only the FIPS `id` fields matter (they drive FIPS→state-code
// mapping in the component). Arcs can be anything because geoPath is mocked above.
const MOCK_TOPOLOGY = {
  type: "Topology",
  arcs: [
    [[0, 0], [1, 0], [1, 1], [0, 1]],
    [[2, 0], [3, 0], [3, 1], [2, 1]],
  ],
  objects: {
    states: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: 12, arcs: [[0]] }, // FL
        { type: "Polygon", id: 48, arcs: [[1]] }, // TX
      ],
    },
  },
};

function makeState(overrides: Partial<StateRisk> = {}): StateRisk {
  return {
    state_code: "FL",
    state_name: "Florida",
    fema_region: 4,
    final_risk_score: 88.0,
    disaster_count_score: 60.0,
    recent_activity_score: 55.0,
    hurricane_exposure_score: 90.0,
    spending_gap_score: null,
    explanation: "High hurricane exposure.",
    total_declarations: 100,
    major_disaster_declarations: 80,
    emergency_declarations: 10,
    hurricane_count: 30,
    flood_count: 5,
    fire_count: 3,
    severe_storm_count: 5,
    tornado_count: 2,
    declarations_last_5_years: 10,
    declarations_last_10_years: 25,
    most_recent_disaster_year: 2023,
    ...overrides,
  };
}

const FL = makeState();
const TX = makeState({
  state_code: "TX",
  state_name: "Texas",
  fema_region: 6,
  final_risk_score: 84.0,
  disaster_count_score: 58.0,
  recent_activity_score: 52.0,
  hurricane_exposure_score: 70.0,
  hurricane_count: 15,
});

describe("RiskMap — tooltip and detail panel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => MOCK_TOPOLOGY })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  // ── tooltip appears ───────────────────────────────────────────────────────

  it("tooltip appears when hovering over a state", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    expect(screen.queryByTestId("map-tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(path, { clientX: 400, clientY: 300 });
    expect(screen.getByTestId("map-tooltip")).toBeInTheDocument();
  });

  it("tooltip disappears when the mouse leaves the state", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.mouseEnter(path, { clientX: 400, clientY: 300 });
    expect(screen.getByTestId("map-tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(path);
    expect(screen.queryByTestId("map-tooltip")).not.toBeInTheDocument();
  });

  // ── tooltip shows correct state name ─────────────────────────────────────

  it("tooltip shows the correct state name", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.mouseEnter(path, { clientX: 400, clientY: 300 });
    const tip = screen.getByTestId("map-tooltip");

    expect(within(tip).getByText("Florida")).toBeInTheDocument();
  });

  it("tooltip updates to the newly hovered state when the mouse moves between states", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const flPath = await screen.findByTestId("state-FL");
    const txPath = await screen.findByTestId("state-TX");

    fireEvent.mouseEnter(flPath, { clientX: 400, clientY: 300 });
    expect(within(screen.getByTestId("map-tooltip")).getByText("Florida")).toBeInTheDocument();

    fireEvent.mouseLeave(flPath);
    fireEvent.mouseEnter(txPath, { clientX: 200, clientY: 300 });
    expect(within(screen.getByTestId("map-tooltip")).getByText("Texas")).toBeInTheDocument();
  });

  // ── tooltip shows risk score and key metrics ──────────────────────────────

  it("tooltip shows the risk score and key metrics for the hovered state", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.mouseEnter(path, { clientX: 400, clientY: 300 });
    const tip = screen.getByTestId("map-tooltip");

    expect(within(tip).getByText("88.0")).toBeInTheDocument();      // risk score
    expect(within(tip).getByText("100")).toBeInTheDocument();        // total declarations
    expect(within(tip).getByText("10")).toBeInTheDocument();         // declarations last 5 yrs
    expect(within(tip).getByText("30")).toBeInTheDocument();         // hurricane count
    expect(within(tip).getByText("Hurricane")).toBeInTheDocument();  // top incident type
  });

  // ── tooltip handles missing values safely ─────────────────────────────────

  it("tooltip handles null values safely and renders em-dashes", async () => {
    const sparse = makeState({
      final_risk_score: null,
      total_declarations: null,
      declarations_last_5_years: null,
      hurricane_count: null,
      flood_count: null,
      severe_storm_count: null,
      tornado_count: null,
      fire_count: null,
    });
    render(<RiskMap states={[sparse]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.mouseEnter(path, { clientX: 400, clientY: 300 });
    const tip = screen.getByTestId("map-tooltip");

    expect(within(tip).getByText("Florida")).toBeInTheDocument();
    // Risk score, total declarations, last-5-years, hurricane count → all "—"
    expect(within(tip).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  // ── persistent detail panel (click / tap) ────────────────────────────────

  it("clicking a state opens the persistent detail panel", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    expect(screen.queryByTestId("state-detail-panel")).not.toBeInTheDocument();

    fireEvent.click(path);
    const panel = screen.getByTestId("state-detail-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Florida");
    expect(panel).toHaveTextContent("88.0");
  });

  it("detail panel shows all four sub-scores", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.click(path);
    const panel = screen.getByTestId("state-detail-panel");

    expect(within(panel).getByText("60.0")).toBeInTheDocument(); // disaster_count_score
    expect(within(panel).getByText("55.0")).toBeInTheDocument(); // recent_activity_score
    expect(within(panel).getByText("90.0")).toBeInTheDocument(); // hurricane_exposure_score
    // spending_gap_score is null → at least one em-dash in the panel
    expect(within(panel).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("detail panel persists while hovering a different state", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const flPath = await screen.findByTestId("state-FL");
    const txPath = await screen.findByTestId("state-TX");

    fireEvent.click(flPath);
    expect(screen.getByTestId("state-detail-panel")).toBeInTheDocument();

    // Hovering TX shows its tooltip but does NOT remove FL's pinned panel
    fireEvent.mouseEnter(txPath, { clientX: 200, clientY: 300 });
    expect(within(screen.getByTestId("map-tooltip")).getByText("Texas")).toBeInTheDocument();
    const panel = screen.getByTestId("state-detail-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("Florida");
  });

  it("clicking the same state again dismisses the detail panel", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.click(path);
    expect(screen.getByTestId("state-detail-panel")).toBeInTheDocument();

    fireEvent.click(path);
    expect(screen.queryByTestId("state-detail-panel")).not.toBeInTheDocument();
  });

  it("close button dismisses the detail panel", async () => {
    render(<RiskMap states={[FL, TX]} />);
    const path = await screen.findByTestId("state-FL");

    fireEvent.click(path);
    expect(screen.getByTestId("state-detail-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close detail panel/i }));
    expect(screen.queryByTestId("state-detail-panel")).not.toBeInTheDocument();
  });
});
