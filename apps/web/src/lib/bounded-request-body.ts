export const MAX_REQUEST_BODY_BYTES = 256 * 1024;

export type BoundedRequestBodyResult =
  | { ok: true; body: string }
  | { ok: false; reason: "too_large" | "invalid_utf8" | "read_failed" };

/**
 * Reads a request body without buffering more than maxBytes.
 *
 * Content-Length is an early-rejection hint only; the streamed byte count is
 * authoritative because clients can omit or misstate that header.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<BoundedRequestBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    try {
      await request.body?.cancel();
    } catch {
      // The transport may already have closed or locked the stream.
    }
    return { ok: false, reason: "too_large" };
  }

  const stream = request.body;
  if (!stream) {
    return { ok: true, body: "" };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch {
    return { ok: false, reason: "read_failed" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort; the request is rejected either way.
        }
        return { ok: false, reason: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A failed or canceled stream may already have released its lock.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
}
