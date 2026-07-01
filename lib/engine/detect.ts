// Extract emails/URLs and detect country, positions and company from pasted business text.
import type { CountryRule } from "./rules";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.(?:com|co\.nz|co\.uk|com\.au|org|net|nz|au|uk|us|ca|ie|es|fr|de|it|pt|nl|ch|at|dk|se|no|fi|be|cz|pl|gr|io|info|biz|co)/gi;
const URL_RE =
  /\bhttps?:\/\/[^\s)"'<>]+|\b(?:www\.)[^\s)"'<>]+|\b[a-z0-9.\-]+\.(?:com|org|net|co\.nz|co\.uk|com\.au|nz|au|us|io|info)\b[^\s)"'<>]*/gi;

const BAD_EMAIL =
  /(example\.com|sentry\.io|wixpress|@2x|\.png|\.jpg|\.svg|\.gif|domain\.com|email\.com|yourname|business\.com|company\.com|test\.com|demo\.com|localhost|sample)/i;

export function extractEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) || [])
    .map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, ""))
    .filter((e) => {
      if (BAD_EMAIL.test(e)) return false;

      const parts = e.split("@");
      if (parts.length !== 2) return false;
      const local = parts[0];
      const domain = parts[1];

      // Exclude junk/system local parts
      const junkLocal = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|hostmaster|webmaster|privacy|legal|terms|abuse|security|billing|accounts|finance|payment|invoice|newsletter|subscribe|feedback|root|test|example|placeholder|yourname)$/i;
      if (junkLocal.test(local)) return false;

      // Exclude platform domains
      const platformDomains = /(wix\.com|wixpress|shopify\.com|squarespace\.com|godaddy\.com|wordpress\.com|weebly\.com|sentry\.io)/i;
      if (platformDomains.test(domain)) return false;

      return true;
    });

  const unique = [...new Set(found)];
  if (!unique.length) return [];

  // Group by priority
  const t1: string[] = [];
  const t2: string[] = [];
  const t3: string[] = [];

  const tier1Regex = /^(careers|jobs|recruitment|hr|work|employment|join|hiring|application|apply|talent)/i;
  const tier2Regex = /^(hello|info|contact|office|manager|welcome|reservations|frontdesk|enquiries|team)/i;

  for (const email of unique) {
    const local = email.split("@")[0];
    if (tier1Regex.test(local)) {
      t1.push(email);
    } else if (tier2Regex.test(local)) {
      t2.push(email);
    } else {
      t3.push(email);
    }
  }

  // Prioritization rule:
  // If there are hiring/career emails (Tier 1), use them exclusively.
  // Otherwise, if there are general contact emails (Tier 2), use those.
  // Otherwise, use Tier 3 emails.
  if (t1.length > 0) return t1;
  if (t2.length > 0) return t2;
  return t3;
}

// Score an email address by how well it suits a job application.
// Higher = better. Used to pick the single best recipient from a list.
const JOB_PRIORITY: [RegExp, number][] = [
  [/^(careers|jobs|recruitment|hiring|hr|talent|apply|applications|employment|staffing|work)@/i, 100],
  [/^(manager|gm|generalmanager|owner|director|people|humanresources)@/i, 80],
  [/^(hello|team|contact|enquiries|enquiry|enquire)@/i, 40],
  [/^(info|mail|office|admin|reception|general|support|service|help|sales|booking|bookings|reservations|events)@/i, 20],
];

function emailScore(email: string): number {
  for (const [re, score] of JOB_PRIORITY) {
    if (re.test(email)) return score;
  }
  return 10; // unknown prefix — better than a clearly wrong one
}

// Return the single best email for a job application, or all if none stands out.
export function pickBestEmail(emails: string[]): string[] {
  if (emails.length <= 1) return emails;
  const scored = emails.map((e) => ({ e, s: emailScore(e) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  // If the top candidate has a clearly higher score than the rest, use only it.
  const second = scored[1];
  if (best.s >= 40 && best.s > second.s) return [best.e];
  // If there's a tie at the high-priority level, keep all tied winners.
  if (best.s >= 80) return scored.filter((x) => x.s === best.s).map((x) => x.e);
  // Otherwise fall back to just the best one to avoid spamming multiple inboxes.
  return [best.e];
}

export function extractUrls(text: string): string[] {
  const found = (text.match(URL_RE) || [])
    .map((u) => u.trim().replace(/[.,;:)]+$/, ""))
    .filter((u) => !/\.(png|jpg|jpeg|svg|gif|webp|css|js)$/i.test(u));
  return [...new Set(found)];
}

const COUNTRY_RULES: (CountryRule & { test: RegExp; testCaseSensitive?: RegExp })[] = [
  {
    code: "NZ",
    name: "New Zealand",
    visa: "Accredited Employer Work Visa (AEWV) sponsorship",
    test: /\b(new zealand|nz\b|auckland|wellington|christchurch|queenstown|kiwi|\.co\.nz|\.nz\b|nzd|napier|hamilton|tauranga|dunedin|nelson|palmerston north|rotorua|new plymouth|hastings|whangarei|invercargill|gisborne|ahuriri|wanaka|taupo|marlborough|hawke's bay|hawkes bay|otago|canterbury|waikato|bay of plenty)\b/i,
  },
  {
    code: "AU",
    name: "Australia",
    visa: "TSS / Skilled Work visa (employer sponsorship)",
    test: /\b(australia|australian|sydney|melbourne|brisbane|perth|adelaide|\.com\.au|\.au\b|aud)\b/i,
  },
  {
    code: "US",
    name: "United States",
    visa: "H-2B / work visa sponsorship",
    test: /\b(united states|u\.s\.a|\busa\b|new york|los angeles|miami|chicago|texas|california|florida|usd)\b/i,
  },
  {
    code: "CA",
    name: "Canada",
    visa: "LMIA-based work permit sponsorship",
    test: /\b(canada|canadian|toronto|vancouver|montreal|\.ca\b|cad)\b/i,
  },
  {
    code: "UK",
    name: "United Kingdom",
    visa: "Skilled Worker visa (employer sponsorship)",
    test: /\b(united kingdom|england|scotland|london|manchester|\.co\.uk|\bgbp\b|£)\b/i,
  },
  // ---- Europe (EU/EEA/Schengen destinations) ----
  {
    code: "DE",
    name: "Germany",
    visa: "EU work visa / employer sponsorship (e.g. EU Blue Card)",
    test: /\b(germany|deutschland|german|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|\.de\b)\b/i,
  },
  {
    code: "ES",
    name: "Spain",
    visa: "Spanish work / residence authorization (employer sponsorship)",
    test: /\b(spain|españa|spanish|madrid|barcelona|valencia|seville|sevilla|malaga|málaga|\.es\b)\b/i,
  },
  {
    code: "FR",
    name: "France",
    visa: "French work visa / employer sponsorship",
    test: /\b(france|french|paris|lyon|marseille|bordeaux|toulouse|\.fr\b)\b/i,
    testCaseSensitive: /\bNice\b/,
  },
  {
    code: "IT",
    name: "Italy",
    visa: "Italian work visa (nulla osta / employer sponsorship)",
    test: /\b(italy|italia|italian|rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|\.it\b)\b/i,
  },
  {
    code: "NL",
    name: "the Netherlands",
    visa: "Dutch work permit (GVVA / employer sponsorship)",
    test: /\b(netherlands|holland|dutch|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|\.nl\b)\b/i,
  },
  {
    code: "PT",
    name: "Portugal",
    visa: "Portuguese work / residence visa (employer sponsorship)",
    test: /\b(portugal|portuguese|lisbon|lisboa|porto|algarve|madeira|\.pt\b)\b/i,
  },
  {
    code: "IE",
    name: "Ireland",
    visa: "Irish Employment Permit (employer sponsorship)",
    test: /\b(ireland|irish|dublin|cork|galway|\.ie\b)\b/i,
  },
  {
    code: "AT",
    name: "Austria",
    visa: "Austrian work permit (Rot-Weiß-Rot / employer sponsorship)",
    test: /\b(austria|österreich|austrian|vienna|wien|salzburg|innsbruck|graz|\.at\b)\b/i,
  },
  {
    code: "CH",
    name: "Switzerland",
    visa: "Swiss work permit (employer sponsorship)",
    test: /\b(switzerland|schweiz|suisse|swiss|zurich|zürich|geneva|genève|basel|bern|lausanne|\.ch\b)\b/i,
  },
  {
    code: "GR",
    name: "Greece",
    visa: "Greek work / residence permit (employer sponsorship)",
    test: /\b(greece|hellas|greek|athens|athína|thessaloniki|crete|santorini|mykonos|\.gr\b)\b/i,
  },
  {
    code: "SE",
    name: "Sweden",
    visa: "Swedish work permit (employer sponsorship)",
    test: /\b(sweden|sverige|swedish|stockholm|gothenburg|göteborg|malmö|\.se\b)\b/i,
  },
  {
    code: "DK",
    name: "Denmark",
    visa: "Danish work permit (employer sponsorship)",
    test: /\b(denmark|danmark|danish|copenhagen|københavn|aarhus|\.dk\b)\b/i,
  },
  {
    code: "NO",
    name: "Norway",
    visa: "Norwegian residence permit for work (employer sponsorship)",
    test: /\b(norway|norge|norwegian|oslo|bergen|trondheim|\.no\b)\b/i,
  },
  {
    code: "BE",
    name: "Belgium",
    visa: "Belgian work permit (employer sponsorship)",
    test: /\b(belgium|belgique|belgie|belgian|brussels|bruxelles|brussel|antwerp|antwerpen|ghent|gent|bruges|brugge|\.be\b)\b/i,
  },
  {
    code: "FI",
    name: "Finland",
    visa: "Finnish residence permit for work (employer sponsorship)",
    test: /\b(finland|suomi|finnish|helsinki|tampere|turku|oulu|\.fi\b)\b/i,
  },
  {
    code: "CZ",
    name: "Czech Republic",
    visa: "Czech work permit (employer sponsorship)",
    test: /\b(czech republic|česká republika|czech|prague|praha|brno|ostrava|\.cz\b)\b/i,
  },
  {
    code: "PL",
    name: "Poland",
    visa: "Polish work permit (employer sponsorship)",
    test: /\b(poland|polska|polish|warsaw|warszawa|kraków|wrocław|gdansk|\.pl\b)\b/i,
  },
];

export function detectCountry(text: string): CountryRule {
  for (const r of COUNTRY_RULES) {
    if (r.test.test(text)) return { code: r.code, name: r.name, visa: r.visa };
    if (r.testCaseSensitive && r.testCaseSensitive.test(text)) return { code: r.code, name: r.name, visa: r.visa };
  }
  return { code: "XX", name: "the destination country", visa: "work visa sponsorship" };
}

// Canonical country/visa lookup by code (used when the AI layer returns a country code,
// so visa wording stays controlled rather than AI-generated).
export function countryByCode(code: string): CountryRule {
  const r = COUNTRY_RULES.find((c) => c.code === code.toUpperCase());
  return r ? { code: r.code, name: r.name, visa: r.visa } : { code: "XX", name: "the destination country", visa: "work visa sponsorship" };
}

const POSITION_RULES: { test: RegExp; label: string }[] = [
  { test: /\bfront desk|receptionist|front office|check.in|guest service/i, label: "Front Desk" },
  { test: /\bkitchen|chef|cook|kitchen hand|commis|sous chef|prep cook|dishwasher|kitchen porter/i, label: "Kitchen" },
  { test: /\bwait(er|ress)|server|serving|food service|f&b|dining room|table service/i, label: "Food & Beverage Service" },
  { test: /\bhousekeep|room attendant|cleaner|laundry|turndown/i, label: "Housekeeping" },
  { test: /\bbarista|coffee|café\b/i, label: "Barista" },
  { test: /\bbartender|bar staff|bar\b|cocktail|mixologist/i, label: "Bar" },
  { test: /\bconcierge|guest relations|guest experience/i, label: "Concierge" },
  { test: /\bmanager|management|supervisor|head of|general manager/i, label: "Management" },
  { test: /\bnight auditor|night shift|night manager/i, label: "Night Auditor" },
  { test: /\breservations|booking(s)?\b/i, label: "Reservations" },
  { test: /\bporter|bellhop|valet|doorman|luggage/i, label: "Porter / Valet" },
  { test: /\bevent|banquet|function|catering/i, label: "Events / Banquet" },
];

export function detectPositions(text: string): string[] {
  const hits = POSITION_RULES.filter((p) => p.test.test(text)).map((p) => p.label);
  return hits.length ? [...new Set(hits)] : [];
}

// Collapse a brand string that was duplicated by scraped logo markup:
// "Hotel Montreal Hotel Montreal" or "Hotel MontrealHotel Montreal" → "Hotel Montreal".
function collapseDouble(s: string): string {
  const compact = s.replace(/\s+/g, " ").trim();
  const words = compact.split(" ");
  if (words.length >= 2 && words.length % 2 === 0) {
    const h = words.length / 2;
    if (words.slice(0, h).join(" ").toLowerCase() === words.slice(h).join(" ").toLowerCase()) {
      return words.slice(0, h).join(" ");
    }
  }
  const n = compact.length;
  if (n >= 6 && n % 2 === 0) {
    const a = compact.slice(0, n / 2).trim();
    const b = compact.slice(n / 2).trim();
    if (a && a.toLowerCase() === b.toLowerCase()) return a;
  }
  return compact;
}

export function guessCompany(text: string, emails: string[], urls: string[] = []): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 0. Facebook page detection: when the user copies a Facebook business page,
  //    the page name appears prominently (in a heading or in metadata like "Page · Restaurant").
  //    Pattern: a line followed by a "X followers · Y following" line or "Page · Category" pattern,
  //    OR a line with the format "X likes · X followers" which always follows the page name.
  const fullText = lines.join("\n");
  // Check if this looks like a Facebook page paste
  if (/\b(followers?|following|takipçi|tak(i|ı)p)\b/i.test(fullText) || /facebook\.com/i.test(fullText)) {
    // Strategy A: Find a line where next line contains "followers" or "likes"
    for (let i = 0; i < Math.min(lines.length - 1, 30); i++) {
      const nextLine = lines[i + 1] || "";
      if (/\b(follower|following|likes?|takipçi|takip)\b/i.test(nextLine)) {
        const candidate = lines[i].trim();
        // Must not be a URL, navigation item, or too long
        if (
          candidate.length >= 3 && candidate.length <= 80 &&
          !/^https?:\/\//i.test(candidate) &&
          !/^(home|about|photos|videos|events|posts|community|info|shop|services)$/i.test(candidate)
        ) {
          return collapseDouble(candidate);
        }
      }
    }
    // Strategy B: look for "Page · Category" pattern — the line before it is the page name
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      if (/^(page|sayfa)\s*[·•·]\s*\S/i.test(lines[i])) {
        const candidate = lines[i - 1].trim();
        if (
          candidate.length >= 3 && candidate.length <= 80 &&
          !/^https?:\/\//i.test(candidate) &&
          !/^(home|about|photos|videos|events|posts|community|info|shop|services|posts|gönderiler|hakkında|fotoğraflar)$/i.test(candidate)
        ) {
          return collapseDouble(candidate);
        }
      }
    }
    // Strategy C: find any short line between nav items that looks like a proper name
    //  ("Gönderiler Hakkında Fotoğraflar" suggests FB, name is likely near those)
    const fbNavIdx = lines.findIndex(l => /^(gönderiler|posts|hakkında|about)$/i.test(l));
    if (fbNavIdx > 1) {
      for (let i = Math.max(0, fbNavIdx - 3); i < fbNavIdx; i++) {
        const candidate = lines[i].trim();
        if (
          candidate.length >= 3 && candidate.length <= 80 &&
          !/^https?:\/\//i.test(candidate) &&
          !/^\d+/.test(candidate)
        ) {
          return collapseDouble(candidate);
        }
      }
    }
  }

  // 1. Try to find a copyright line (very specific to the business owner)
  for (const line of lines) {
    if (/(?:©|copyright|\(c\))/i.test(line)) {
      // Remove copyright symbol, (c), and "copyright" case-insensitively
      let clean = line.replace(/(copyright|©|\(c\))/ig, "").trim();
      
      // Remove year ranges or lists (e.g., "2016-2026", "2016 - 2026", "2016, 2018", "2016")
      clean = clean.replace(/\b\d{4}\s*[-–—,]\s*\d{4}\b/g, ""); // e.g. 2016-2026
      clean = clean.replace(/\b\d{4}\b/g, ""); // e.g. 2016
      
      // Split on separators if followed by typical footer noise words (website, design, powered, etc.)
      const parts = clean.split(/\s*[-–—|•·/]\s*(?:website|design|powered|privacy|terms|all\s+rights|cookie|link|login|legal|wdw|staah)/i);
      clean = parts[0];
      
      // Also split on pipe or bullet points unconditionally since they are standard footer separators
      clean = clean.split(/\s*[|•·]\s*/)[0];

      // Remove common suffixes like "all rights reserved", "ltd", etc.
      clean = clean
        .replace(/\b(all rights reserved|ltd|limited|inc|pty|co|corp|corporation|wdw|staah)\b.*/i, "")
        .replace(/[^a-zA-Z0-9\s&]/g, "") // Keep alphanumeric, spaces, and ampersand
        .replace(/\s+/g, " ")
        .trim();
        
      // Capitalize words nicely
      clean = clean.replace(/\b\w/g, (c) => c.toUpperCase());
      
      // Skip if it's just developer credits
      const IS_JUNK_CREDIT = /^(designed\s*(?:&|and)?\s*developed(?:\s+by)?|designed\s+by|developed\s+by|website\s+design|web\s+design|powered\s+by|created\s+by|built\s+by|design\s+by|staah)$/i;
      if (IS_JUNK_CREDIT.test(clean)) {
        continue;
      }
      
      if (clean.length > 2 && !/^(wix|shopify|squarespace|godaddy|wordpress|website|design|powered by|privacy|terms|login)$/i.test(clean.toLowerCase())) {
        return collapseDouble(clean);
      }
    }
  }

  // 2. Try the email domain name (extremely reliable)
  // Blacklist known ISP/generic email providers that are NOT the business name.
  const ISP_DOMAINS = /^(gmail|googlemail|outlook|hotmail|yahoo|icloud|proton|protonmail|mail|live|me|msn|ymail|aol|zoho|fastmail|xtra|spark|clear|slingshot|orcon|snap|woosh|paradise|callplus|telecom|vodafone|optus|bigpond|internode|iinet|aapt|tpg|dodo|telstra|singtel|starhub|maxis|celcom|digi|tm|bsnl|jio|airtel|tata|idea|mynet|superonline|ttmail|turknet|kablonet|shaw|rogers|telus|bell|sympatico|videotron|cogeco|eastlink|sasktel|btinternet|btconnect|virginmedia|talktalk|blueyonder|ntlworld|plusnet|gmx|web|t-online|freenet|alice|libero|virgilio|wanadoo|orange|sfr|free|neuf|laposte|cox|comcast|charter|spectrum|roadrunner|twc|verizon|att|bellsouth|sbcglobal|earthlink|windstream|suddenlink|optonline|netzero|juno|mac|sky|hushmail|hush|rediffmail|yandex|mailru|rambler|farmside|actrix|westnet|adam|netspace|chariot|tassie|picknowl|ozemail)$/i;
  if (emails.length) {
    const domain = emails[0].split("@")[1] || "";
    const core = domain.split(".")[0];
    if (core) {
      if (!ISP_DOMAINS.test(core)) {
        let name = core
          .replace(/(restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie|dining|eatery|tavern|pub|hotel|suites|motel|resort)/i, " $1")
          .replace(/[-_]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        name = name.replace(/\b\w/g, (c) => c.toUpperCase());
        if (name && name.length > 2 && !/^(wix|shopify|squarespace|godaddy|wordpress)$/i.test(name.toLowerCase())) {
          return name;
        }
      } else {
        // If it's a generic email provider, try to clean the username (e.g. "zephyrrestaurantnz" -> "Zephyr Restaurant")
        const username = emails[0].split("@")[0] || "";
        const genericUsernames = /^(info|jobs|careers|recruitment|apply|applications|hello|contact|enquiries|office|admin|reception|general|support|service|help|sales|booking|bookings|reservations|events|manager|gm|owner|director|staff|work|mail)$/i;
        if (!genericUsernames.test(username)) {
          let cleaned = username
            .replace(/(?:nz|au|uk|usa?)$/i, "")
            .replace(/(restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie|dining|eatery|tavern|pub|hotel|suites|motel|resort)/i, " $1")
            .replace(/[-_]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          cleaned = cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
          if (cleaned.length > 2) {
            return cleaned;
          }
        }
      }
    }
  }

  // Lines we should always skip when searching for a company name
  const JUNK_COMPANY_LINES = /^(home|menu|menus|book|book now|cart|contact|contact us|about|about us|welcome|gallery|skip to content|privacy policy|terms of service|terms & conditions|website by|designed by|powered by|wix|shopify|squarespace|godaddy|wordpress|facebook|instagram|twitter|linkedin|day|breakfast|lunch|dinner|starters|main courses|sides|desserts|cheeseboard|toast)$/i;
  const DISCLAIMER_RE = /\b(subject to change|please inform|dietar|allerg|cannot guarantee|gluten free|we cannot|may contain|restrictions|gift card|gift voucher|certificate|sign up|newsletter|stay in the loop)\b/i;

  // 3. Detect a concatenated page title (e.g. "Mister D DiningMister D Dining, Napier...")
  //    Scrapers often merge <title> with the first heading, producing a doubled brand name.
  for (const line of lines.slice(0, 5)) {
    if (line.length < 10 || line.length > 200) continue;
    if (JUNK_COMPANY_LINES.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    // Try progressively shorter prefixes to find one that repeats
    for (let len = Math.min(40, Math.floor(line.length / 2)); len >= 4; len--) {
      const prefix = line.slice(0, len);
      const rest = line.slice(len);
      if (rest.toLowerCase().startsWith(prefix.toLowerCase())) {
        let candidate = prefix.trim().replace(/\s*[-–—,|:].*/g, "").trim();
        if (candidate.length >= 3 && !/^(home|menu|book|cart|contact|about|welcome|the|and|for)$/i.test(candidate)) {
          return collapseDouble(candidate);
        }
      }
    }
  }

  // 4. Look for the brand in an "About Us" section (e.g. "Mister D is a little bit country...")
  const aboutIdx = lines.findIndex(l => /^about\s*us$/i.test(l));
  if (aboutIdx >= 0 && aboutIdx + 1 < lines.length) {
    const aboutLine = lines[aboutIdx + 1];
    const m = aboutLine.match(/^(.{3,35}?)\s+(?:is|was|are|has|have|offers?|provides?|serves?|opened|started|began)\b/i);
    if (m) {
      const candidate = m[1].trim();
      if (candidate.length >= 3 && !JUNK_COMPANY_LINES.test(candidate) && !DISCLAIMER_RE.test(candidate)) {
        return collapseDouble(candidate);
      }
    }
  }

  // 5. Frequency-based: find a short capitalized phrase that appears 3+ times (strong brand signal)
  const brandCounts = new Map<string, number>();
  const spaceJoinedText = lines.join(" ");
  // Match capitalized word(s) like "Mister D" or "Black Barn" (2–4 words, first word capitalized)
  const brandRe = /\b([A-Z][a-zA-Z']*(?:\s+[A-Z][a-zA-Z']*){0,2}(?:\s+[A-Z])?)\b/g;
  let bm: RegExpExecArray | null;
  while ((bm = brandRe.exec(spaceJoinedText)) !== null) {
    const brand = bm[1].trim();
    if (brand.length >= 4 && brand.length <= 35
      && !/^(The|And|For|With|Add|Our|All|New|Day|Hot|Big|Free|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Greek|Asian|Italian|French|GFO|ONLINE|RESTAURANT|BOOKINGS|RISE|SHINE|CROWDS|LOVE|THESE|HAPPY|HENS|LAY|EGGS|SIDE|KICKS|BAKERS|CORNER|STARTERS|MAIN|COURSES|SIDES|DESSERTS|AUTUMN|MATCH|FOR THE TABLE)$/i.test(brand)
    ) {
      brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    }
  }
  let bestBrand = "";
  let bestCount = 2; // need at least 3 occurrences
  for (const [brand, count] of brandCounts) {
    if (count > bestCount) {
      bestBrand = brand;
      bestCount = count;
    }
  }
  if (bestBrand) return collapseDouble(bestBrand);

  // 6. Prefer a content line that names a venue type, but filter out generic terms and sentences.
  const venueLine = lines.find((l) => {
    if (l.length >= 60 || l.length < 3) return false;
    if (JUNK_COMPANY_LINES.test(l)) return false;
    if (/^https?:\/\//i.test(l) || /^www\./i.test(l)) return false;
    if (/\b(book online|make a reservation|online bookings|restaurant bookings|skip to content|click to|find us)\b/i.test(l)) return false;
    if (DISCLAIMER_RE.test(l)) return false;
    // Must contain a hospitality venue term
    if (!/\b(hotel|suites|resort|restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie|dining|eatery|tavern|pub)\b/i.test(l)) return false;
    // Avoid full narrative sentences
    if (/\b(our|we|us|visit|welcome|check|open|hours|closed|from|cook|making|some)\b/i.test(l)) return false;
    return true;
  });

  if (venueLine) {
    return collapseDouble(venueLine.replace(/\s+[-–—|].*$/, "").trim());
  }

  // 7. Try to guess from URLs if available
  if (urls.length) {
    try {
      const validUrl = urls.find(u => !/\b(facebook|instagram|twitter|x|linkedin|google|youtube|tiktok|apple|android|wix|squarespace|shopify|wordpress)\b/i.test(u));
      if (validUrl) {
        const urlStr = validUrl.startsWith("http") ? validUrl : "https://" + validUrl;
        const hostname = new URL(urlStr).hostname;
        const parts = hostname.replace(/^www\./, "").split(".");
        if (parts.length >= 2) {
          let name = parts[0]
            .replace(/(restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie|dining|eatery|tavern|pub|hotel|suites|motel|resort)/i, " $1")
            .replace(/[-_]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          name = name.replace(/\b\w/g, c => c.toUpperCase());
          if (name && name.length > 2 && !/^(wix|shopify|squarespace|godaddy|wordpress|site|home)$/i.test(name.toLowerCase())) {
            return name;
          }
        }
      }
    } catch (e) {}
  }

  // 8. Fallback to the first non-junk, non-disclaimer line
  const fallbackLine = lines.find((l) => {
    if (l.length < 4 || l.length >= 60) return false;
    if (JUNK_COMPANY_LINES.test(l)) return false;
    if (/^https?:\/\//i.test(l) || /^www\./i.test(l)) return false;
    if (/\b(book online|make a reservation|online bookings|restaurant bookings|skip to content|click to|find us|stay in the loop)\b/i.test(l)) return false;
    if (DISCLAIMER_RE.test(l)) return false;
    if (/\b(our|we|us|visit|welcome|check|open|hours|closed|from|some)\b/i.test(l)) return false;
    if (/\b(telephone|phone|email|fax|call us|mobile|tel|address)\s*[:]/i.test(l)) return false;
    // Skip common menu/food content lines
    if (/^\d+\s*$/.test(l) || /\b(add|served with|choice of|extra|GFO?|DF|vegan)\b/i.test(l)) return false;
    if (/\$\s*\d|\d+\.\d{2}$|\b\d{2}\s*(GF|DF|V)\b/.test(l)) return false;
    return true;
  });

  if (fallbackLine) {
    return collapseDouble(fallbackLine.replace(/\s+[-–—|].*$/, "").trim());
  }

  return "your company";
}

// Lightweight language detection of the pasted business text (for "auto" application language).
// Only switches away from English when there is clear, distinctive evidence. Hint words that
// collide with English or proper nouns (a, o, de, la, le, hotel, restaurant…) are deliberately
// EXCLUDED — they caused English hospitality copy (e.g. "a ... hotel") to be misread as
// Portuguese/Spanish. Language-unique diacritics weigh double. English-dominant or ambiguous
// text returns null, which the caller treats as English / the user's profile language.
const EN_HINTS = /\b(the|and|you|your|our|for|with|are|from|this|that|will|have|rooms?|booking|luxury|stay|guests?|city|welcome|enjoy|home|world|best|find|place|relaxed|comfort)\b/gi;

const LANG_HINTS: { code: string; words: RegExp; marks?: RegExp }[] = [
  { code: "es", words: /\b(los|las|para|con|una|por|trabajo|empresa|gracias|nuestro|empleo|habitaciones|ciudad|estancia|buscamos|camarero|camarera|cocina|calle|ayudante|ofrecemos|candidatos|jornada|sueldo|escribenos|escríbenos|restaurante|hostelería|hosteleria)\b/gi, marks: /[ñ¿¡]/g },
  { code: "fr", words: /\b(les|des|pour|avec|nous|votre|vous|travail|emploi|merci|équipe|chambres?|ville|séjour|nos|cet)\b/gi, marks: /[àâçèêëîïôùûœ]/g },
  { code: "de", words: /\b(und|der|die|das|für|mit|wir|unser|eine|arbeit|stelle|bewerbung|gäste|küche|zimmer|stadt|suchen)\b/gi, marks: /[äöüß]/g },
  { code: "it", words: /\b(gli|per|con|noi|una|nostro|lavoro|albergo|ristorante|grazie|cucina|camere?|città|soggiorno)\b/gi, marks: /[ìòù]/g },
  { code: "pt", words: /\b(para|com|nós|nosso|uma|trabalho|emprego|obrigado|equipa|cozinha|quartos?|cidade|estadia)\b/gi, marks: /[ãõ]/g },
  { code: "tr", words: /\b(ve|için|ile|bir|başvuru|otel|restoran|mutfak|ekip|departman|misafir|oda|şehir|çalışma)\b/gi, marks: /[şğıİ]/g },
];

export function detectTextLang(text: string): string | null {
  const sample = text.slice(0, 2000);
  const english = (sample.match(EN_HINTS) || []).length;
  let best: { code: string; n: number } | null = null;
  for (const h of LANG_HINTS) {
    const words = (sample.match(h.words) || []).length;
    const marks = h.marks ? (sample.match(h.marks) || []).length : 0;
    const n = words + marks * 2; // distinctive diacritics are a strong signal
    if (!best || n > best.n) best = { code: h.code, n };
  }
  // Require clear, distinctive evidence that also outweighs the English baseline.
  if (best && best.n >= 5 && best.n > english) return best.code;
  return null;
}

// A street-address line: a number + street name + a street-type suffix. Used to enrich
// the email web-search when the pasted text has a physical address but no email.
// Handles both English suffix-style ("24 Customs Street") and Romance/German prefix-style
// ("15 Rue de Rivoli", "42 Via Roma") street lines.
const STREET_RE =
  /\b\d{1,5}[a-z]?\s+(?:(?:rue|via|calle|avenida|piazza|plaza|viale|corso|strasse|straße)\s+(?:[A-Za-z][\w'’.-]+\s*){1,4}|(?:[A-Z][\w'’.-]+\s+){1,4}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|highway|hwy|quay|terrace|tce|place|pl|boulevard|blvd|parade|pde|crescent|cres|court|ct|square|sq|wharf|esplanade|str))\b\.?/i;

// Well-known cities/towns from the country rules — a strong locality signal for search.
const CITY_RE =
  /\b(auckland|wellington|christchurch|queenstown|hamilton|tauranga|dunedin|rotorua|napier|nelson|sydney|melbourne|brisbane|perth|adelaide|gold coast|cairns|byron bay|new york|los angeles|miami|chicago|san francisco|boston|seattle|toronto|vancouver|montreal|calgary|ottawa|london|manchester|edinburgh|glasgow|liverpool|bristol|birmingham|leeds|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|madrid|barcelona|valencia|seville|sevilla|malaga|málaga|paris|lyon|marseille|bordeaux|nice|toulouse|rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|lisbon|lisboa|porto|algarve|madeira|dublin|cork|galway|vienna|wien|salzburg|innsbruck|graz|zurich|zürich|geneva|genève|basel|bern|lausanne|athens|thessaloniki|crete|santorini|mykonos|stockholm|gothenburg|göteborg|malmö|copenhagen|københavn|aarhus|oslo|bergen|trondheim|brussels|bruxelles|antwerp|antwerpen|ghent|bruges|brugge|helsinki|tampere|turku|oulu|prague|praha|brno|ostrava|warsaw|warszawa|kraków|wrocław|gdansk)\b/i;

function titleCase(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Pull location hints (street address + city/town) from pasted business text. Both feed
// the email web-search so a generic or duplicated company name can still be pinned down.
export function extractLocation(text: string): { address?: string; locality?: string } {
  const out: { address?: string; locality?: string } = {};
  const street = text.match(STREET_RE);
  if (street) out.address = street[0].replace(/\s+/g, " ").replace(/\.$/, "").trim();
  const city = text.match(CITY_RE);
  if (city) out.locality = titleCase(city[0]);
  return out;
}

// Phone number — used as a web-search signal so we can pin the exact business.
// Matches: +64 9 302 1234 / (09) 302-1234 / 020 7946 0958 / +1 800 555 1234.
// Result is digit-only (with optional leading +) for a safe search query.
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-])?\(?\d{1,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?|\+\d{7,15}/g;

export function extractPhone(text: string): string | null {
  const hits = (text.match(PHONE_RE) || [])
    .map((h) => h.replace(/[^\d+]/g, ""))
    .filter((h) => h.replace(/\D/g, "").length >= 7);
  return hits[0] || null;
}

export type Analysis = {
  emails: string[];
  urls: string[];
  country: CountryRule;
  positions: string[];
  company: string;
  locality?: string;
  address?: string;
  phone?: string;
};

export function analyze(text: string): Analysis {
  const emails = extractEmails(text);
  const loc = extractLocation(text);
  const urls = extractUrls(text);
  return {
    emails,
    urls,
    country: detectCountry(text),
    positions: detectPositions(text),
    company: guessCompany(text, emails, urls),
    locality: loc.locality,
    address: loc.address,
    phone: extractPhone(text) || undefined,
  };
}
