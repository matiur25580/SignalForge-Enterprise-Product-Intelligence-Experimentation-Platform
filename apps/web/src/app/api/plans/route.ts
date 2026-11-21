import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

export async function GET() {
  return Response.json({
    plans: Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
      id,
      ...plan,
    })),
    billing: {
      enabled: false,
      note: "Plan tiers and ingestion entitlements are enforced. Checkout, invoices, payment collection, and self-serve plan changes are not implemented.",
    },
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
