import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/db";
import { toEngineProfile } from "@/lib/profile-adapter";
import { buildDraft, APP_LANGS, type AppLang } from "@/lib/engine/template";
import { countryByCode, type Analysis } from "@/lib/engine/detect";
import { VALID_ORG_TYPES, workKindForRoles, visaFor, type OrgType } from "@/lib/engine/professions";
import { isVisaCovered } from "@/lib/engine/visa";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

// Deterministic counterpart to /api/ask for the ONE thing that doesn't need an LLM at all:
// swapping which role(s) an application targets. Adding/removing a role is a mechanical edit —
// this rebuilds the subject + body from the same template engine used when AI is disabled
// (lib/engine/template.ts), so toggling a role chip never depends on AI provider uptime/quota.
// Trade-off vs the AI path: this regenerates the draft from scratch, so it does NOT preserve any
// free-text edits the user made to the body — callers should only use this for the mechanical
// role-toggle action, not general "improve my email" requests (those stay on /api/ask).
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const data = await req.json().catch(() => ({}));
    const company = typeof data?.company === "string" ? data.company.trim() : "";
    const countryCode = typeof data?.countryCode === "string" ? data.countryCode : "XX";
    const orgType: OrgType =
      typeof data?.orgType === "string" && (VALID_ORG_TYPES as string[]).includes(data.orgType)
        ? (data.orgType as OrgType)
        : "generic";
    const applyFor = Array.isArray(data?.applyFor)
      ? data.applyFor.filter((x: unknown): x is string => typeof x === "string" && Boolean(x.trim())).map((s: string) => s.trim())
      : [];
    const validLangs = APP_LANGS.map((l) => l.code) as string[];
    const lang: AppLang = (validLangs.includes(data?.language) ? data.language : "en") as AppLang;

    if (!applyFor.length) return NextResponse.json({ error: "No roles specified." }, { status: 400 });

    const profile = await getProfile(user.id);
    const engineProfile = toEngineProfile(profile, user);

    const country = countryByCode(countryCode);
    const workKind = workKindForRoles(applyFor);
    const countryWithVisa = { ...country, visa: visaFor(country.code, workKind, "job", country.visa) };

    const visaCovered = Boolean(engineProfile.hasVisa) && isVisaCovered(engineProfile.visaCountries, country.code);
    const authorization = { authorized: visaCovered, visaLabel: visaCovered ? engineProfile.visaLabel || null : null };

    const analysis: Analysis = {
      emails: [],
      urls: [],
      company: company || "the organization",
      country: countryWithVisa,
      positions: applyFor,
      orgType,
      intent: "job",
    };

    const draft = buildDraft(analysis, engineProfile, lang, authorization);
    return NextResponse.json(draft);
  } catch (e: any) {
    await reportError(e, { route: "roles-draft" });
    return NextResponse.json({ error: e?.message || "Failed to build draft" }, { status: 500 });
  }
}
