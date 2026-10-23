// Fixed, unroutable origin so the helper is pure and works on server and client.
const BASE = 'http://bseat.invalid';

// Backslash and ASCII control characters (incl. tab and newline) are normalised by
// browser URL parsers, so `/\evil.example` or `/\t/evil.example` can become `//evil.example`.
function hasUnsafeChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x5c || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Returns a same-site path (`pathname + search + hash`) from untrusted input, else `fallback`. */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || hasUnsafeChar(next)) return fallback;
  try {
    // A percent-encoded backslash is decoded by some servers, so judge the decoded form too.
    if (hasUnsafeChar(decodeURIComponent(next))) return fallback;
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
