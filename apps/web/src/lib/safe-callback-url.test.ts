import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/lib/safe-callback-url";

describe("safeCallbackPath", () => {
  it("preserves safe same-origin relative paths, query strings, and fragments", () => {
    expect(safeCallbackPath("/organizations/acme/projects?tab=events#latest"))
      .toBe("/organizations/acme/projects?tab=events#latest");
  });

  it("rejects protocol-relative and absolute external URLs", () => {
    expect(safeCallbackPath("//attacker.example/path")).toBe("/");
    expect(safeCallbackPath("https://attacker.example/path")).toBe("/");
  });

  it("rejects backslash and encoded backslash redirect tricks", () => {
    expect(safeCallbackPath(String.raw`/\attacker.example`)).toBe("/");
    expect(safeCallbackPath("/%5c%5cattacker.example")).toBe("/");
  });

  it("rejects control characters and malformed percent encoding", () => {
    expect(safeCallbackPath("/safe\nLocation: https://attacker.example")).toBe("/");
    expect(safeCallbackPath("/%E0%A4%A")).toBe("/");
  });

  it("falls back to the application root for missing or non-root-relative values", () => {
    expect(safeCallbackPath(undefined)).toBe("/");
    expect(safeCallbackPath("organizations/acme")).toBe("/");
    expect(safeCallbackPath("")).toBe("/");
  });
});
