// Lightweight endpoint the UI calls asynchronously to show a health indicator
// next to each recipient address — MX check + noreply/role classification.
// Auth required so it can't be abused as a bulk email validator.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkEmailHealth } from "@/lib/engine/email-health";

export const runtime = "nodejs";
// DNS lookup: fast but still needs real network; cap at 8s to stay well under any proxy limit.
export const maxDuration = 8;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("email") || "").trim();
  if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

  // One address per call; the UI fans out for multiple recipients.
  const health = await checkEmailHealth(email);
  return NextResponse.json(health, {
    headers: {
      // Cache at CDN layer for 5 minutes — MX records rarely change mid-session.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}
