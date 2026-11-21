import { NextResponse, type NextRequest } from "next/server";

function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function middleware(request: NextRequest) {
  const incoming = request.headers.get("traceparent");
  const valid = incoming && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(incoming);
  const rate = Number(process.env.OTEL_TRACES_SAMPLE_RATE ?? "0.1");
  const sampled = valid ? ((parseInt(incoming!.slice(-2), 16) & 1) === 1) : Math.random() < (Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.1);
  const traceparent = valid ? incoming : `00-${randomHex(16)}-${randomHex(8)}-${sampled ? "01" : "00"}`;
  const requestId = traceparent.split("-")[1];
  const headers = new Headers(request.headers);
  headers.set("traceparent", traceparent);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("traceparent", traceparent);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
