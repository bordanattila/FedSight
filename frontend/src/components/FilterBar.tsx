import type { Filters } from "../lib/filterStates";
import { DEFAULT_FILTERS, isDefaultFilters } from "../lib/filterStates";
import styles from "./FilterBar.module.css";

const INCIDENT_TYPES = ["Hurricane", "Flood", "Fire", "Severe Storm", "Tornado"] as const;
const FEMA_REGIONS = Array.from({ length: 10 }, (_, i) => i + 1);

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}

function Select({ label, value, onChange, children }: SelectProps) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label className={styles.filterLabel} htmlFor={id}>
      <span className={styles.labelText}>{label}</span>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  totalCount: number;
}

export function FilterBar({ filters, onChange, resultCount, totalCount }: Props) {
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    onChange({ ...filters, [key]: val });

  return (
    <div className={styles.bar}>
      <div className={styles.controls}>
        <Select
          label="Incident type"
          value={filters.incidentType}
          onChange={(v) => set("incidentType", v)}
        >
          <option value="">All types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>

        <Select
          label="FEMA region"
          value={filters.femaRegion}
          onChange={(v) => set("femaRegion", v)}
        >
          <option value="">All regions</option>
          {FEMA_REGIONS.map((r) => (
            <option key={r} value={String(r)}>Region {r}</option>
          ))}
        </Select>

        <Select
          label="Declaration type"
          value={filters.declarationType}
          onChange={(v) => set("declarationType", v)}
        >
          <option value="">All types</option>
          <option value="DR">Major Disaster (DR)</option>
          <option value="EM">Emergency (EM)</option>
        </Select>

        <Select
          label="Time range"
          value={filters.timeRange}
          onChange={(v) => set("timeRange", v)}
        >
          <option value="all">All time</option>
          <option value="last5">Active last 5 years</option>
          <option value="last10">Active last 10 years</option>
        </Select>

        {!isDefaultFilters(filters) && (
          <button
            className={styles.clearBtn}
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            Clear
          </button>
        )}
      </div>

      <span className={styles.resultCount}>
        {resultCount === totalCount
          ? `${totalCount} states`
          : `${resultCount} of ${totalCount} states`}
      </span>
    </div>
  );
}
