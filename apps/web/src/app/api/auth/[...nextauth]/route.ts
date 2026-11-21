import { handlers } from "../../../../../auth";
import type { NextRequest } from "next/server";
import { clientAddressFromHeaders, consumeAuthRateLimit } from "@/lib/auth-rate-limit";

async function guardSignIn(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/auth/signin" && !pathname.startsWith("/api/auth/signin/")) return null;

  try {
    const result = await consumeAuthRateLimit(`ip:${clientAddressFromHeaders(request.headers)}`);
    if (!result.allowed) {
      return Response.json(
        { error: "Too many sign-in attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
    return null;
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const blocked = await guardSignIn(request);
  return blocked ?? handlers.GET(request);
}

export async function POST(request: NextRequest) {
  const blocked = await guardSignIn(request);
  return blocked ?? handlers.POST(request);
}
