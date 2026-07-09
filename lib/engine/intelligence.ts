// Deterministic intelligence layer: skills gap, sponsorship signals, posting freshness,
// WHV timeline, tone detection, response rate prediction.
// No AI required — all analysis runs in O(n) on input text, CVText, and profile.
import type { EngineProfile } from "./types";
import type { OrgType } from "./professions";

// ── 1. Skills Gap Analysis ────────────────────────────────────────────────────

export type SkillsGap = {
  matchedSkills: string[];
  gapSkills: string[];
  strengthHighlights: string[];
  experienceRequired: number | null;
  educationRequired: "none" | "certificate" | "diploma" | "degree" | "masters" | "phd" | "unknown";
};

// Skill keywords: [label, job-posting regex, user-cv regex (optional, defaults to same)]
type SkillRule = [string, RegExp, RegExp?];
const SKILL_RULES: SkillRule[] = [
  ["IELTS / English test",    /\b(ielts|english\s*(proficiency|test|language|level)|oet\b|pte\b)/i],
  ["driver licence",          /\b(driver.?s?\s*(licence|license)|full\s*(nz|au|uk)?\s*(licence|license)|own\s*(vehicle|car|transport))/i],
  ["police check",            /\b(police\s*(check|clearance|background)|criminal\s*(background|history|record)\s*check|dbs\s*check|wwc\b|working\s*with\s*children)/i],
  ["first aid",               /\b(first\s*aid|cpr|defibrillator)\b/i],
  ["food safety",             /\b(food\s*safety|food\s*hygiene|haccp|food\s*handler)\b/i],
  ["AHPRA registration",      /\b(ahpra)\b/i],
  ["NMC registration",        /\bnmc\b/i, /\bnmc\b/i],
  ["HCPC registration",       /\bhcpc\b/i],
  ["GMC registration",        /\bgmc\b/i],
  ["forklift licence",        /\b(forklift|order\s*picker|reach\s*truck)\s*(licence|license|certified|operator)?/i],
  ["SQL / databases",         /\b(sql|mysql|postgresql|postgres|oracle\s*db|database)\b/i],
  ["JavaScript / Node",       /\b(javascript|node\.?js|typescript)\b/i],
  ["Python",                  /\bpython\b/i],
  ["cloud (AWS/Azure/GCP)",   /\b(aws|azure|google\s*cloud|gcp|cloud\s*(platform|infrastructure))\b/i],
  ["Xero / MYOB",             /\b(xero|myob)\b/i],
  ["QuickBooks",              /\bquickbooks?\b/i],
  ["trade certificate",       /\b(trade\s*certificate|apprenticeship|nzqa|city\s*&\s*guilds|tafe)\b/i],
  ["teaching registration",   /\b(teaching\s*(registration|council)|nztc|aitsl|gtcs)\b/i],
];

export function analyzeSkillsGap(text: string, profile: EngineProfile): SkillsGap {
  const cvLower = ((profile.cvText || "") + " " + (profile.documentsText || "")).toLowerCase();

  // Extract required years of experience from posting
  const expMatch =
    text.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)\b/i) ||
    text.match(/minimum\s*(\d+)\s*years?\b/i) ||
    text.match(/at\s*least\s*(\d+)\s*years?\b/i);
  const experienceRequired = expMatch ? parseInt(expMatch[1]) : null;

  // Education level from posting
  let educationRequired: SkillsGap["educationRequired"] = "unknown";
  if (/\b(phd|doctorate|doctoral)\b/i.test(text))                               educationRequired = "phd";
  else if (/\b(master|msc|mba|postgraduate|grad\s*dip)\b/i.test(text))          educationRequired = "masters";
  else if (/\b(bachelor|degree|bsc|b\.sc|b\.a\b|undergraduate)\b/i.test(text)) educationRequired = "degree";
  else if (/\bdiploma\b/i.test(text))                                            educationRequired = "diploma";
  else if (/\b(certificate|cert\b)\b/i.test(text))                              educationRequired = "certificate";
  else if (/\b(no formal (qualification|education)|experience\s*only)\b/i.test(text)) educationRequired = "none";

  const matchedSkills: string[] = [];
  const gapSkills: string[] = [];

  for (const [label, jobRe, cvRe] of SKILL_RULES) {
    if (!jobRe.test(text)) continue; // Not required by this posting
    const userHasIt = cvLower ? (cvRe || jobRe).test(cvLower) : false;
    if (userHasIt) {
      matchedSkills.push(label);
    } else if (cvLower) {
      // Only flag as gap if posting explicitly requires it (not just mentions it)
      const requiredRe = new RegExp(
        `(must|required|essential|minimum|mandatory).{0,60}${jobRe.source}|${jobRe.source}.{0,60}(required|essential|must|mandatory)`,
        "i"
      );
      if (requiredRe.test(text)) gapSkills.push(label);
    }
  }

  // Strength highlights from profile fields
  const strengthHighlights: string[] = [];
  if (profile.languages.length > 1)
    strengthHighlights.push(`multilingual (${profile.languages.slice(0, 2).join(", ")})`);
  if (profile.relocation)
    strengthHighlights.push("available to relocate");
  if (profile.availability && !/flexible|asap/i.test(profile.availability))
    strengthHighlights.push(`available ${profile.availability}`);

  return { matchedSkills, gapSkills, strengthHighlights, experienceRequired, educationRequired };
}

// ── 4. Employer Sponsorship Signal ───────────────────────────────────────────

export type SponsorshipSignal = {
  signal: "open" | "closed" | "unknown";
  note: string | null;
};

const CLOSED_PATTERNS = [
  /no\s*(visa\s*)?(sponsorship|sponsor)/i,
  /sponsorship\s*(is\s*)?(not\s*)?available/i,
  /we\s*(do\s*not|don.t)\s*offer\s*(visa\s*)?sponsorship/i,
  /must\s*(have|hold)\s*(current|valid|existing)?\s*(nz|au|uk|us|ca|new\s*zealand|australian)?\s*(work\s*)?(rights?|visa|authorization|authorisation)/i,
  /applicants?\s*must\s*(be|have)\s*(a\s*)?(nz|au|uk|us|ca|new\s*zealand|australian|british|american|canadian)\s*(resident|citizen|pr|permanent)/i,
  /only\s*(nz|au|uk|us|ca|new\s*zealand|australian|british|american|canadian)\s*(residents?|citizens?|pr|permanent\s*residents?)\s*(will\s*be\s*considered|need\s*apply)/i,
  /work\s*authorization\s*(required|is\s*required)/i,
  /residents?\s*only/i,
  /citizens?\s*only/i,
  /no\s*overseas\s*applicants?/i,
  /you\s*must\s*(already\s*)?(have|hold|possess)\s*(the\s*)?(right|permission|authorization|authorisation)\s*to\s*work/i,
  /right\s*to\s*work\s*(in|for)\s*(nz|au|uk|the\s*uk|the\s*us|canada)/i,
];

const OPEN_PATTERNS: Record<string, RegExp[]> = {
  NZ: [
    /accredited\s*(employer|aewv)/i,
    /aewv/i,
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /we\s*(can|will|do)\s*(sponsor|provide\s*(a\s*)?visa)/i,
    /international\s*(applicants?|candidates?)\s*(welcome|encouraged|considered)/i,
  ],
  AU: [
    /sponsor(ing|ship|ed)?\s*(visa|482|tss|talent)/i,
    /482\s*visa/i,
    /tss\s*visa/i,
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /international\s*(applicants?|candidates?)\s*(welcome|encouraged|considered)/i,
  ],
  UK: [
    /licensed?\s*sponsor/i,
    /skilled\s*worker\s*visa/i,
    /certificate\s*of\s*sponsorship/i,
    /\bcos\b/i,
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /international\s*(applicants?|candidates?)\s*(welcome|encouraged|considered)/i,
  ],
  CA: [
    /\blmia\b/i,
    /work\s*permit\s*(available|provided|arranged)/i,
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /international\s*(applicants?|candidates?)\s*(welcome|encouraged|considered)/i,
  ],
  US: [
    /h[-\s]?1b\s*(sponsorship|visa)?/i,
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /we\s*(sponsor|file|support)\s*(h[-\s]?1b|visas?|work\s*auth)/i,
    /open\s*to\s*(international|overseas)\s*(applicants?|candidates?)/i,
  ],
  DEFAULT: [
    /visa\s*sponsorship\s*(available|provided|offered|considered)/i,
    /international\s*(applicants?|candidates?)\s*(welcome|encouraged|considered)/i,
    /open\s*to\s*(international|overseas)\s*(applicants?|candidates?)/i,
    /relocation\s*(package|support|assistance)\s*(provided|available|offered)/i,
  ],
};

export function detectSponsorshipSignal(text: string, countryCode: string): SponsorshipSignal {
  for (const re of CLOSED_PATTERNS) {
    if (re.test(text))
      return { signal: "closed", note: "This listing requires existing local work rights or states no sponsorship is available." };
  }

  const openPatterns = OPEN_PATTERNS[countryCode] ?? OPEN_PATTERNS.DEFAULT;
  for (const re of openPatterns) {
    if (re.test(text))
      return { signal: "open", note: "This employer appears open to visa sponsorship." };
  }

  return { signal: "unknown", note: null };
}

// ── 5. Posting Freshness ─────────────────────────────────────────────────────

export type PostingFreshness = {
  ageDays: number | null;
  label: "fresh" | "recent" | "old" | "unknown";
  note: string | null;
};

const MONTH_MAP: Record<string, string> = {
  january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
};

export function detectPostingFreshness(text: string): PostingFreshness {
  // "Posted X hours/minutes ago"
  if (/posted\s*:?\s*\d+\s*(minute|hour|hr)s?\s*ago/i.test(text) || /\bjust\s*now\b|\bposted\s*today\b/i.test(text))
    return { ageDays: 0, label: "fresh", note: "Posted in the last 24 hours — good time to apply." };

  // "Posted X days ago"
  const dayAgo = text.match(/posted\s*:?\s*(\d+)\s*days?\s*ago/i) || text.match(/(\d+)\s*days?\s*ago\b/i);
  if (dayAgo) {
    const d = parseInt(dayAgo[1]);
    return { ageDays: d, label: d <= 3 ? "fresh" : d <= 14 ? "recent" : "old", note: d > 30 ? "This listing is 30+ days old — the role may already be filled." : d <= 3 ? "Posted recently — apply while it's fresh." : null };
  }

  // "30+ days ago"
  if (/30\+\s*days?\s*ago/i.test(text))
    return { ageDays: 31, label: "old", note: "This listing is 30+ days old — the role may already be filled." };

  // "X weeks ago"
  const weekAgo = text.match(/posted\s*:?\s*(\d+)\s*weeks?\s*ago/i);
  if (weekAgo) {
    const weeks = parseInt(weekAgo[1]);
    const d = weeks * 7;
    return { ageDays: d, label: weeks <= 2 ? "recent" : "old", note: weeks > 4 ? "This listing may be over a month old — the role may already be filled." : null };
  }

  // ISO date: 2025-01-22
  const iso = text.match(/\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return fromDate(new Date(`${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`));

  // DD/MM/YYYY
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (dmy) return fromDate(new Date(`${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`));

  // "22 January 2025"
  const textDate = text.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/i);
  if (textDate) {
    const m = MONTH_MAP[textDate[2].toLowerCase()];
    if (m) return fromDate(new Date(`${textDate[3]}-${m}-${textDate[1].padStart(2,"0")}`));
  }

  return { ageDays: null, label: "unknown", note: null };
}

function fromDate(d: Date): PostingFreshness {
  if (isNaN(d.getTime())) return { ageDays: null, label: "unknown", note: null };
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0 || days > 730) return { ageDays: null, label: "unknown", note: null };
  return {
    ageDays: days,
    label: days <= 3 ? "fresh" : days <= 14 ? "recent" : "old",
    note: days > 30 ? "This listing is 30+ days old — the role may already be filled." : days <= 3 ? "Posted recently — apply while it's fresh." : null,
  };
}

// ── 6. WHV Timeline Awareness ─────────────────────────────────────────────────

export type WhvTimeline = {
  monthsRemaining: number | null;
  urgencyLevel: "ok" | "soon" | "critical" | "expired" | "unknown";
  note: string | null;
};

export function assessWhvTimeline(whvExpiry: string | null | undefined): WhvTimeline {
  if (!whvExpiry) return { monthsRemaining: null, urgencyLevel: "unknown", note: null };
  const expiry = new Date(whvExpiry);
  if (isNaN(expiry.getTime())) return { monthsRemaining: null, urgencyLevel: "unknown", note: null };
  const msLeft = expiry.getTime() - Date.now();
  if (msLeft < 0)
    return { monthsRemaining: 0, urgencyLevel: "expired", note: "Your WHV has expired — verify your current visa status before applying." };
  const months = Math.floor(msLeft / (30 * 86400000));
  if (months < 2)
    return { monthsRemaining: months, urgencyLevel: "critical", note: `Your WHV expires in under ${months + 1} month(s). State this explicitly so the employer can start sponsorship immediately.` };
  if (months < 4)
    return { monthsRemaining: months, urgencyLevel: "soon", note: `Your WHV expires in ~${months} months — note your timeline so the employer can plan the sponsorship transition.` };
  return { monthsRemaining: months, urgencyLevel: "ok", note: null };
}

// ── 7. Posting Tone Detection ─────────────────────────────────────────────────

export type PostingTone = "startup" | "corporate" | "healthcare" | "hospitality" | "government" | "trades" | "neutral";

const TONE_WORDS: Record<PostingTone, string[]> = {
  startup:     ["startup","scale up","disrupt","mission-driven","equity","stock option","series a","series b","seed round","founding team","move fast","agile","remote-first","async","flat structure","yc","y combinator","growth hacker","scrappy","iterate"],
  corporate:   ["global","fortune","established","leading provider","world-class","enterprise","compliance","governance","procedures","stakeholder","kpi","performance review","annual leave","superannuation","pension","benefits package","regulated","insurance"],
  healthcare:  ["patient","clinical","hospital","ward","clinic","care","health","medical","nursing","gp ","referral","diagnosis","treatment","ahpra","nmc","gmc","hcpc","aged care","disability","mental health"],
  hospitality: ["guest","front desk","check-in","housekeeping","concierge","f&b","food and beverage","hotel","motel","resort","restaurant","bar","kitchen","chef","front of house","back of house","banquet","bistro","bistro"],
  government:  ["public service","ministry","department of","council","government","local authority","civil service","public sector","state government","federal","council","municipality"],
  trades:      ["tools","on site","construction","maintenance","electrical","plumbing","ppe","safety boots","trade certificate","apprentice","workshop","scaffolding","earthworks","machinery","heavy equipment"],
  neutral:     [],
};

const HEALTHCARE_ORGS: OrgType[] = ["clinic","dental_clinic","hospital","pharmacy","care_home"];
const HOSPITALITY_ORGS: OrgType[] = ["hotel","restaurant","cafe","bar"];
const GOVERNMENT_ORGS: OrgType[] = ["government"];
const TRADES_ORGS: OrgType[] = ["construction","factory","warehouse","logistics","garage","mining"];

export function detectPostingTone(text: string, orgType: OrgType): PostingTone {
  if (GOVERNMENT_ORGS.includes(orgType)) return "government";
  if (HEALTHCARE_ORGS.includes(orgType)) return "healthcare";
  if (HOSPITALITY_ORGS.includes(orgType)) return "hospitality";
  if (TRADES_ORGS.includes(orgType)) return "trades";

  const lower = text.toLowerCase();
  let best: PostingTone = "neutral";
  let bestScore = 1; // Must beat 1 to win

  for (const [tone, words] of Object.entries(TONE_WORDS) as [PostingTone, string[]][]) {
    if (tone === "neutral") continue;
    const score = words.filter(w => lower.includes(w)).length;
    if (score > bestScore) { best = tone; bestScore = score; }
  }
  return best;
}

// ── 8. Response Rate Prediction ───────────────────────────────────────────────

export type ResponseRatePrediction = {
  score: number;
  label: "high" | "medium" | "low";
  factors: string[];
};

export function predictResponseRate(opts: {
  fitScore: number;
  eligibilityStatus: "ok" | "warning" | "blocked";
  onSkillShortageList: boolean;
  sponsorshipSignal: SponsorshipSignal["signal"];
  freshness: PostingFreshness["label"];
  needsVisaSponsorship: boolean;
  gapCount: number;
}): ResponseRatePrediction {
  const { fitScore, eligibilityStatus, onSkillShortageList, sponsorshipSignal, freshness, needsVisaSponsorship, gapCount } = opts;

  let score = fitScore * 0.45; // Max 45 from fit
  const factors: string[] = [];

  if (onSkillShortageList)   { score += 15; factors.push("Role on skill shortage list"); }
  if (freshness === "fresh") { score += 12; factors.push("Recently posted listing"); }
  else if (freshness === "recent") score += 5;
  else if (freshness === "old") { score -= 10; factors.push("Older listing — may be filled"); }

  if (needsVisaSponsorship) {
    if (sponsorshipSignal === "open")   { score += 15; factors.push("Employer open to sponsorship"); }
    else if (sponsorshipSignal === "closed") { score -= 25; factors.push("Employer requires local work rights"); }
  }

  if (eligibilityStatus === "blocked") { score -= 30; factors.push("Hard eligibility block"); }
  else if (eligibilityStatus === "warning") score -= 8;

  if (gapCount >= 2) { score -= gapCount * 5; factors.push(`${gapCount} requirement gap(s) in CV`); }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: clamped,
    label: clamped >= 65 ? "high" : clamped >= 35 ? "medium" : "low",
    factors,
  };
}
