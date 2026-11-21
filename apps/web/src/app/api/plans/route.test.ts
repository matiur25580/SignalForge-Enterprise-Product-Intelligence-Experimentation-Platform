import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/plans/route";

describe("GET /api/plans", () => {
  it("publishes plan entitlements without implying billing is enabled", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans).toHaveLength(3);
    expect(body.plans.find((plan: { id: string }) => plan.id === "FREE").ingestion)
      .toEqual({ requestsPerMinute: 120, eventsPerMinute: 10_000 });
    expect(body.plans.find((plan: { id: string }) => plan.id === "PRO").ingestion)
      .toEqual({ requestsPerMinute: 600, eventsPerMinute: 50_000 });
    expect(body.plans.find((plan: { id: string }) => plan.id === "ENTERPRISE").ingestion)
      .toEqual({ requestsPerMinute: 3_000, eventsPerMinute: 250_000 });
    expect(body.billing.enabled).toBe(false);
  });
});
