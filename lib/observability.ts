// Lightweight, dependency-free error reporting. Always logs to the server console;
// additionally POSTs to ERROR_WEBHOOK_URL (Slack/Discord/Sentry-tunnel) when configured.
// Avoids pulling in a heavy SDK while still surfacing production failures.

export async function reportError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  // eslint-disable-next-line no-console
  console.error("[paply]", message, context || "", stack || "");

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `paply error: ${message}`,
        message,
        stack,
        context: context || {},
        at: new Date().toISOString(),
      }),
    });
  } catch {
    // never let observability throw into the request path
  }
}
