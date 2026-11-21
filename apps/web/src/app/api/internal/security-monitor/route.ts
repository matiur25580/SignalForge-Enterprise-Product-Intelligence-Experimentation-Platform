import { isAuthorizedSecurityMonitor, runSecurityMonitor } from "@/lib/security-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorizedSecurityMonitor(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await runSecurityMonitor();
    return Response.json({
      success: true,
      ...result,
      notificationsConfigured: Boolean(
        (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) ||
        process.env.SECURITY_ALERT_SLACK_WEBHOOK_URL,
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Avoid exposing provider errors, organization data, or secrets to the scheduler.
    return Response.json({ error: "Security monitoring run failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
