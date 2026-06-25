// Transactional email via Resend — dependency-free (HTTP API). No-ops until RESEND_API_KEY is set,
// so the app builds and runs without it. Used for product emails like the weekly digest.
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "paply <noreply@paply.me>";
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
