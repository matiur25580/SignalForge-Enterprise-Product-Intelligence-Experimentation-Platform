import type { SubscriptionPlan } from "@prisma/client";
import type { IngestionQuotaLimits } from "@/lib/ingestion-rate-limit";

export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: "Free",
    description: "For evaluating the product and small projects.",
    monthlyPriceUsd: 0,
    ingestion: { requestsPerMinute: 120, eventsPerMinute: 10_000 },
    includedProjects: 2,
    includedApiKeys: 3,
    support: "Community",
  },
  PRO: {
    name: "Pro",
    description: "For growing product teams with production workloads.",
    monthlyPriceUsd: null,
    ingestion: { requestsPerMinute: 600, eventsPerMinute: 50_000 },
    includedProjects: 20,
    includedApiKeys: 25,
    support: "Priority",
  },
  ENTERPRISE: {
    name: "Enterprise",
    description: "For larger organizations with custom requirements.",
    monthlyPriceUsd: null,
    ingestion: { requestsPerMinute: 3_000, eventsPerMinute: 250_000 },
    includedProjects: null,
    includedApiKeys: null,
    support: "Dedicated",
  },
} as const;

export function getPlanIngestionLimits(plan: SubscriptionPlan): IngestionQuotaLimits {
  return SUBSCRIPTION_PLANS[plan].ingestion;
}
