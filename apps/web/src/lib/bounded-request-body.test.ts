import { describe, expect, it } from "vitest";
import { readBoundedRequestBody } from "@/lib/bounded-request-body";

function requestWithStream(
  stream: ReadableStream<Uint8Array>,
  headers?: HeadersInit,
) {
  return new Request("http://localhost/api/v1/events", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("readBoundedRequestBody", () => {
  it("accepts a body at the byte limit and decodes UTF-8", async () => {
    const request = new Request("http://localhost/api/v1/events", {
      method: "POST",
      body: new TextEncoder().encode("é"),
    });

    await expect(readBoundedRequestBody(request, 2)).resolves.toEqual({
      ok: true,
      body: "é",
    });
  });

  it("rejects an oversized declared length before reading the stream", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        canceled = true;
      },
    });

    const result = await readBoundedRequestBody(
      requestWithStream(stream, { "content-length": "6" }),
      5,
    );

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(canceled).toBe(true);
  });

  it("enforces the limit against streamed bytes and cancels an oversized body", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
      },
      pull(controller) {
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        canceled = true;
      },
    });

    const result = await readBoundedRequestBody(requestWithStream(stream), 5);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(canceled).toBe(true);
  });

  it("rejects invalid UTF-8 instead of silently replacing bytes", async () => {
    const request = new Request("http://localhost/api/v1/events", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });

    await expect(readBoundedRequestBody(request, 5)).resolves.toEqual({
      ok: false,
      reason: "invalid_utf8",
    });
  });

  it("returns a safe failure when the request stream errors", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("transport details must not leak"));
      },
    });

    await expect(readBoundedRequestBody(requestWithStream(stream), 5)).resolves.toEqual({
      ok: false,
      reason: "read_failed",
    });
  });
});
