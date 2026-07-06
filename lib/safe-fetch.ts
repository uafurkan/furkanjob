// Some API routes run several sequential AI calls + a web search per request and can occasionally
// exceed the platform's function timeout; when that happens the response is an HTML error page
// (e.g. a 504 gateway page), not JSON. A raw `await r.json()` on that throws a cryptic
// "Unexpected token '<', ... is not valid JSON" instead of a message the user can act on.
// This reads the body as text first and only parses it as JSON if it actually looks like JSON,
// otherwise it raises a clear, friendly error.
export async function safeJson<T = any>(r: Response): Promise<T> {
  const raw = await r.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(r.ok ? "Empty response from server." : `Server error (${r.status}). Please try again.`);
  }
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    throw new Error(
      r.status === 504 || r.status === 502 || r.status === 503
        ? "The request took too long and timed out. Please try again."
        : `Server error (${r.status}). Please try again.`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error("Received an invalid response from the server. Please try again.");
  }
}
