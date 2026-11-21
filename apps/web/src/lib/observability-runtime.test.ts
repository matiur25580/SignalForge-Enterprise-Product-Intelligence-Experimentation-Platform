import { afterEach, describe, expect, it } from "vitest";
import { recordHttpRequest, renderHttpMetrics, resetHttpMetricsForTests } from "@/lib/observability-runtime";

describe("HTTP operational metrics", () => {
  afterEach(() => resetHttpMetricsForTests());

  it("records request counts, 5xx errors, and latency histograms with bounded route labels", () => {
    recordHttpRequest("GET", "/api/organizations/c123456789012345678901234/projects", 200, 0.04);
    recordHttpRequest("POST", "/api/v1/events", 503, 0.7);
    const output = renderHttpMetrics();
    expect(output).toContain('method="GET",route="/api/organizations/:id/projects",status_class="2xx"');
    expect(output).toContain("signalforge_http_requests_total");
    expect(output).toContain("signalforge_http_request_errors_total");
    expect(output).toContain('le="+Inf"');
    expect(output).toContain("signalforge_http_request_duration_seconds_sum");
    expect(output).toContain("signalforge_http_request_errors_total{method=\"POST\",route=\"/api/v1/events\",status_class=\"5xx\"} 1");
  });

  it("escapes label values before exposing Prometheus text", () => {
    recordHttpRequest('GET"evil', "/api/a", 200, 0.01);
    expect(renderHttpMetrics()).toContain('method="GET\\"evil"');
  });
});
