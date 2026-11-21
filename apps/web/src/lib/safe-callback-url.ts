const CALLBACK_BASE = "https://signalforge.invalid";

export function safeCallbackPath(candidate?: string | null) {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }

  try {
    const decoded = decodeURIComponent(candidate);
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) {
      return "/";
    }

    const url = new URL(candidate, CALLBACK_BASE);
    if (url.origin !== CALLBACK_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
