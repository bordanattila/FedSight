import type { StatesRiskResponse } from "./types";

const BASE = "http://localhost:8000";

export async function fetchAllStateRisks(): Promise<StatesRiskResponse> {
  const res = await fetch(`${BASE}/api/states/risk`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchTopStates(n = 3): Promise<StatesRiskResponse> {
  const res = await fetch(`${BASE}/api/states/top?n=${n}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
