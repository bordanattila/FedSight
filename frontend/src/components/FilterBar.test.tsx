import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTERS } from "../lib/filterStates";

const ACTIVE = { ...DEFAULT_FILTERS, incidentType: "Hurricane" };

describe("FilterBar — controls rendered", () => {
  it("renders all 4 filter selects", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    expect(screen.getByLabelText(/incident type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fema region/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/declaration type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/time range/i)).toBeInTheDocument();
  });

  it("incident type select has correct options", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    const select = screen.getByLabelText(/incident type/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("Hurricane");
    expect(values).toContain("Flood");
    expect(values).toContain("Fire");
    expect(values).toContain("Severe Storm");
    expect(values).toContain("Tornado");
  });

  it("FEMA region select lists regions 1–10", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    const select = screen.getByLabelText(/fema region/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual(["1","2","3","4","5","6","7","8","9","10"]);
  });

  it("declaration type select has DR and EM options", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    const select = screen.getByLabelText(/declaration type/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("DR");
    expect(values).toContain("EM");
  });

  it("time range select has all, last5, last10 options", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    const select = screen.getByLabelText(/time range/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["all", "last5", "last10"]);
  });
});

describe("FilterBar — Clear button", () => {
  it("does not show Clear when filters are default", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("shows Clear when any filter is non-default", () => {
    render(<FilterBar filters={ACTIVE} onChange={() => {}} resultCount={10} totalCount={50} />);
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("Clear button calls onChange with DEFAULT_FILTERS", () => {
    const onChange = vi.fn();
    render(<FilterBar filters={ACTIVE} onChange={onChange} resultCount={10} totalCount={50} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});

describe("FilterBar — onChange callbacks", () => {
  it("changing incident type calls onChange with updated filter", () => {
    const onChange = vi.fn();
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={onChange} resultCount={50} totalCount={50} />);
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Hurricane" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, incidentType: "Hurricane" });
  });

  it("changing FEMA region calls onChange with updated filter", () => {
    const onChange = vi.fn();
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={onChange} resultCount={50} totalCount={50} />);
    fireEvent.change(screen.getByLabelText(/fema region/i), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, femaRegion: "4" });
  });

  it("changing declaration type calls onChange with updated filter", () => {
    const onChange = vi.fn();
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={onChange} resultCount={50} totalCount={50} />);
    fireEvent.change(screen.getByLabelText(/declaration type/i), { target: { value: "DR" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, declarationType: "DR" });
  });

  it("changing time range calls onChange with updated filter", () => {
    const onChange = vi.fn();
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={onChange} resultCount={50} totalCount={50} />);
    fireEvent.change(screen.getByLabelText(/time range/i), { target: { value: "last5" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, timeRange: "last5" });
  });

  it("other filter keys are preserved when one changes", () => {
    const onChange = vi.fn();
    const partial = { ...DEFAULT_FILTERS, femaRegion: "4" };
    render(<FilterBar filters={partial} onChange={onChange} resultCount={10} totalCount={50} />);
    fireEvent.change(screen.getByLabelText(/incident type/i), { target: { value: "Flood" } });
    expect(onChange).toHaveBeenCalledWith({ ...partial, incidentType: "Flood" });
  });
});

describe("FilterBar — result count display", () => {
  it("shows only total when resultCount equals totalCount", () => {
    render(<FilterBar filters={DEFAULT_FILTERS} onChange={() => {}} resultCount={50} totalCount={50} />);
    expect(screen.getByText("50 states")).toBeInTheDocument();
  });

  it("shows 'X of Y states' when filtered", () => {
    render(<FilterBar filters={ACTIVE} onChange={() => {}} resultCount={12} totalCount={50} />);
    expect(screen.getByText("12 of 50 states")).toBeInTheDocument();
  });
});
