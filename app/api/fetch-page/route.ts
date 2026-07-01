import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { fetchPageText } from "@/lib/engine/websearch";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, "generate");
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const url: string = (body?.url || "").toString().trim();
  if (!url) return NextResponse.json({ error: "No URL provided." }, { status: 400 });

  // Normalize URL
  let fullUrl = url;
  if (!/^https?:\/\//i.test(fullUrl)) fullUrl = "https://" + fullUrl;

  try {
    const text = await fetchPageText(fullUrl);
    if (!text || text.trim().length < 30) {
      return NextResponse.json({ error: "Could not fetch page content." }, { status: 422 });
    }
    // Append the URL at the end so the engine can use it for company detection
    return NextResponse.json({ text: `${text}\n\n${fullUrl}` });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch the page." }, { status: 500 });
  }
}
