import { channel } from "node:diagnostics_channel";
import { randomBytes } from "node:crypto";
import { recordHttpRequest } from "./src/lib/observability-runtime";

type IncomingRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type ServerResponse = { statusCode?: number };
type RequestState = {
  startedAt: bigint;
  method: string;
  pathname: string;
  traceId?: string;
  parentSpanId?: string;
  sampled: boolean;
};

const active = new WeakMap<object, RequestState>();
const BUCKET_NS = 1_000_000_000n;

function header(request: IncomingRequest, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseTraceParent(value?: string) {
  const match = value?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), sampled: (parseInt(match[3], 16) & 1) === 1 };
}

function exportSpan(state: RequestState, status: number, durationNs: bigint) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || !state.sampled || !state.traceId) return;
  const spanId = randomBytes(8).toString("hex");
  const startNs = process.hrtime.bigint() - durationNs;
  const attributes = [
    { key: "http.request.method", value: { stringValue: state.method } },
    { key: "url.path", value: { stringValue: state.pathname } },
    { key: "http.response.status_code", value: { intValue: status } },
    { key: "server.address", value: { stringValue: process.env.OTEL_SERVICE_NAME || "signalforge-web" } },
  ];
  const payload = {
    resourceSpans: [{
      resource: { attributes: [
        { key: "service.name", value: { stringValue: process.env.OTEL_SERVICE_NAME || "signalforge-web" } },
        { key: "deployment.environment.name", value: { stringValue: process.env.NODE_ENV || "unknown" } },
      ] },
      scopeSpans: [{
        scope: { name: "signalforge.http", version: "1.0.0" },
        spans: [{
          traceId: state.traceId,
          spanId,
          ...(state.parentSpanId ? { parentSpanId: state.parentSpanId } : {}),
          name: `${state.method} ${state.pathname}`,
          kind: 2,
          startTimeUnixNano: startNs.toString(),
          endTimeUnixNano: (startNs + durationNs).toString(),
          attributes,
          status: status >= 500 ? { code: 2, message: "HTTP server error" } : { code: 1 },
        }],
      }],
    }],
  };
  const base = endpoint.replace(/\/$/, "");
  const url = base.endsWith("/v1/traces") ? base : `${base}/v1/traces`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const configured = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (configured) {
    for (const pair of configured.split(",")) {
      const separator = pair.indexOf("=");
      if (separator > 0) headers[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
    }
  }
  void fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(3000) })
    .then((response) => {
      if (!response.ok) console.error("OpenTelemetry trace export failed", { status: response.status });
    })
    .catch(() => console.error("OpenTelemetry trace export unavailable"));
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  channel("http.server.request.start").subscribe((message: { request?: IncomingRequest; response?: object }) => {
    const request = message.request;
    const response = message.response;
    if (!request || !response) return;
    const pathname = (request.url || "/").split("?")[0] || "/";
    if (pathname === "/api/internal/metrics") return;
    const trace = parseTraceParent(header(request, "traceparent"));
    const rate = Number(process.env.OTEL_TRACES_SAMPLE_RATE ?? "0.1");
    const sampled = Boolean(trace?.sampled) && Math.random() < (Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.1);
    active.set(response, {
      startedAt: process.hrtime.bigint(),
      method: request.method || "GET",
      pathname,
      traceId: trace?.traceId,
      parentSpanId: trace?.parentSpanId,
      sampled,
    });
  });

  channel("http.server.response.finish").subscribe((message: { request?: IncomingRequest; response?: ServerResponse & object }) => {
    const response = message.response;
    if (!response) return;
    const state = active.get(response);
    if (!state) return;
    active.delete(response);
    const duration = process.hrtime.bigint() - state.startedAt;
    const seconds = Number(duration) / Number(BUCKET_NS);
    const status = response.statusCode || 200;
    recordHttpRequest(state.method, state.pathname, status, seconds);
    exportSpan(state, status, duration);
  });
}
