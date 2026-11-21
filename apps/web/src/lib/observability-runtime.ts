type RequestMetric = { count: number; errors: number; durationSum: number; buckets: number[] };
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const metrics = new Map<string, RequestMetric>();

export function normalizeHttpRoute(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^c[a-z0-9]{20,}$/i.test(segment) || /^[^/]+@[^/]+\.[^/]+$/.test(segment) || /^[A-Za-z0-9_-]{24,}$/.test(segment)) {
        return ":id";
      }
      return segment;
    })
    .join("/") || "/";
}

export function recordHttpRequest(method: string, pathname: string, status: number, durationSeconds: number) {
  const route = normalizeHttpRoute(pathname);
  const key = `${method.toUpperCase()} ${route} ${Math.floor(status / 100)}xx`;
  const current = metrics.get(key) ?? { count: 0, errors: 0, durationSum: 0, buckets: BUCKETS.map(() => 0) };
  current.count += 1;
  if (status >= 500) current.errors += 1;
  current.durationSum += durationSeconds;
  BUCKETS.forEach((bucket, index) => {
    if (durationSeconds <= bucket) current.buckets[index] += 1;
  });
  metrics.set(key, current);
}

function escapeLabel(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export function renderHttpMetrics() {
  const lines = [
    "# HELP signalforge_http_requests_total Completed HTTP requests.",
    "# TYPE signalforge_http_requests_total counter",
    "# HELP signalforge_http_request_errors_total HTTP responses with 5xx status.",
    "# TYPE signalforge_http_request_errors_total counter",
    "# HELP signalforge_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE signalforge_http_request_duration_seconds histogram",
  ];
  for (const [key, value] of metrics) {
    const [method, route, statusClass] = key.split(" ");
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_class="${statusClass}"`;
    lines.push(`signalforge_http_requests_total{${labels}} ${value.count}`);
    lines.push(`signalforge_http_request_errors_total{${labels}} ${value.errors}`);
    BUCKETS.forEach((bucket, index) => {
      lines.push(`signalforge_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${value.buckets[index]}`);
    });
    lines.push(`signalforge_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`);
    lines.push(`signalforge_http_request_duration_seconds_sum{${labels}} ${value.durationSum}`);
    lines.push(`signalforge_http_request_duration_seconds_count{${labels}} ${value.count}`);
  }
  return lines.join("\n") + "\n";
}

export function resetHttpMetricsForTests() {
  metrics.clear();
}
