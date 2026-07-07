// Extract emails/URLs and detect country, positions and company from pasted business text.
import type { CountryRule } from "./rules";
import { detectOrgType, detectIntent, type OrgType, type Intent } from "./professions";

export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/ig, "&")
    .replace(/&copy;/ig, "©")
    .replace(/&reg;/ig, "®")
    .replace(/&quot;/ig, '"')
    .replace(/&(apos|#39);/ig, "'")
    .replace(/&lt;/ig, "<")
    .replace(/&gt;/ig, ">")
    .replace(/&nbsp;/ig, " ")
    .replace(/&#\d+;/g, (match) => {
      const code = parseInt(match.replace(/[^0-9]/g, ""), 10);
      return isNaN(code) ? match : String.fromCharCode(code);
    });
}

// Global TLD coverage: second-level combos first (co.nz, edu.au, ac.uk, com.ng…), then long
// gTLDs, then any 2-letter ccTLD — so university (.edu / .ac.xx) and worldwide business
// addresses (.ng, .tr, .in, .br, .za…) are all extracted, never missed.
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.(?:(?:co|com|org|net|ac|edu|gov)\.[a-z]{2}|education|university|academy|healthcare|hospital|clinic|dental|health|careers|jobs|agency|clinic|farm|restaurant|cafe|hotel|travel|online|store|shop|site|tech|digital|solutions|services|group|global|team|email|works|world|life|care|school|college|institute|com|org|net|edu|gov|mil|int|info|biz|io|co|me|dev|app|xyz|[a-z]{2})\b/gi;
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
  // ---- Middle East / Asia-Pacific ----
  {
    code: "AE",
    name: "UAE",
    visa: "UAE employment visa / work permit sponsorship",
    test: /\b(united arab emirates|uae\b|dubai|abu dhabi|sharjah|ajman|fujairah|ras al khaimah|dirham|dhs\b|\.ae\b)\b/i,
  },
  {
    code: "SG",
    name: "Singapore",
    visa: "Employment Pass (EP) / S Pass sponsorship",
    test: /\b(singapore|singaporean|\.sg\b|sgd\b|sing dollar)\b/i,
  },
  {
    code: "JP",
    name: "Japan",
    visa: "Japanese employer-sponsored work visa",
    test: /\b(japan|japanese|tokyo|osaka|kyoto|yokohama|nagoya|fukuoka|sapporo|kobe|\.jp\b|yen\b|jpy\b)\b/i,
  },
  {
    code: "KR",
    name: "South Korea",
    visa: "Korean employer-sponsored work visa",
    test: /\b(south korea|korea|korean|seoul|busan|incheon|daegu|\.kr\b|won\b|krw\b)\b/i,
  },
  {
    code: "TR",
    name: "Turkey",
    visa: "Turkish work permit (çalışma izni) sponsorship",
    test: /\b(turkey|türkiye|turkish|istanbul|ankara|izmir|bursa|antalya|adana|konya|kayseri|\.com\.tr|\.tr\b)\b/i,
  },
  // ---- Mediterranean ----
  {
    code: "MT",
    name: "Malta",
    visa: "Maltese Single Permit (work + residence) sponsorship",
    test: /\b(malta|maltese|valletta|sliema|st julian|gzira|\.mt\b)\b/i,
  },
  {
    code: "CY",
    name: "Cyprus",
    visa: "Cypriot work permit sponsorship",
    test: /\b(cyprus|cypriot|nicosia|limassol|larnaca|paphos|\.cy\b)\b/i,
  },
  // ---- Africa / Other ----
  {
    code: "ZA",
    name: "South Africa",
    visa: "South African critical skills / general work visa sponsorship",
    test: /\b(south africa|south african|johannesburg|cape town|durban|pretoria|bloemfontein|port elizabeth|rand\b|zar\b|\.co\.za|\.za\b)\b/i,
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

// Cross-industry position detection. Ordered specific → generic; every rule maps page text to a
// clean role label. Covers hospitality, healthcare, engineering/IT, trades, agriculture,
// education, logistics, retail, office, beauty, childcare, security — the full global market.
const POSITION_RULES: { test: RegExp; label: string }[] = [
  // Hospitality
  { test: /\bfront desk|receptionist|front office|check.in|guest service/i, label: "Front Desk" },
  { test: /\bkitchen|chef|cook\b|kitchen hand|commis|sous chef|prep cook|dishwasher|kitchen porter|baker|pastry|butcher/i, label: "Kitchen" },
  { test: /\bwait(er|ress)|server|serving|food service|f&b|dining room|table service/i, label: "Food & Beverage Service" },
  { test: /\bhousekeep|room attendant|laundry|turndown/i, label: "Housekeeping" },
  { test: /\bbarista\b/i, label: "Barista" },
  { test: /\bbartender|bar staff|cocktail|mixologist|sommelier/i, label: "Bar" },
  { test: /\bconcierge|guest relations|guest experience/i, label: "Concierge" },
  { test: /\bnight auditor|night manager/i, label: "Night Auditor" },
  { test: /\bporter|bellhop|valet|doorman|luggage/i, label: "Porter / Valet" },
  { test: /\bbanquet|catering staff/i, label: "Events / Banquet" },
  // Healthcare
  { test: /\bdentist|dental surgeon|orthodontist|periodontist|endodontist|oral surgeon/i, label: "Dentist" },
  { test: /\bdental (assistant|nurse|hygienist|technician|receptionist)|oral health therapist/i, label: "Dental Assistant / Hygienist" },
  { test: /\bphysician|general practitioner|\bGP\b|medical officer|surgeon\b|psychiatrist|p(a)?ediatrician|cardiologist|dermatologist|an(a)?esthesi|radiologist|\bdoctors?\b/i, label: "Doctor / Physician" },
  { test: /\bnurse|nursing|midwif/i, label: "Nurse" },
  { test: /\bcaregiver|care worker|support worker|aged care|elderly care|\bcarer\b|personal care assistant|disability support|healthcare assistant/i, label: "Care Worker" },
  { test: /\bpharmacist|pharmacy (technician|assistant)|dispensary/i, label: "Pharmacist" },
  { test: /\bphysiotherap|physical therapist|occupational therapist|chiropract|osteopath|speech therapist|dietitian|paramedic|optometrist|radiographer|sonographer/i, label: "Allied Health" },
  { test: /\bveterinar|vet nurse\b/i, label: "Veterinary" },
  { test: /\b(laboratory|lab) (technician|scientist|assistant)|phlebotom/i, label: "Laboratory Technician" },
  // Engineering & IT
  { test: /\bsoftware (engineer|developer)|web developer|front.?end|back.?end|full.?stack|mobile developer|devops|data (scientist|engineer|analyst)|machine learning|qa engineer|programmer|cybersecurity/i, label: "Software / IT" },
  { test: /\bit support|help.?desk|system administrator|sysadmin|network (engineer|administrator)/i, label: "IT Support" },
  { test: /\b(mechanical|electrical|civil|structural|chemical|process|mechatronic|aerospace|automotive|marine|mining|geotechnical|environmental|industrial|project|site) engineer/i, label: "Engineer" },
  // Trades & construction
  { test: /\belectrician|electrical apprentice/i, label: "Electrician" },
  { test: /\bplumber|plumbing|gasfitter|drainlayer/i, label: "Plumber" },
  { test: /\bcarpenter|carpentry|joiner|cabinet maker|formwork/i, label: "Carpenter / Builder" },
  { test: /\bwelder|welding|fabricator|boilermaker/i, label: "Welder / Fabricator" },
  { test: /\bmechanic|automotive technician|auto electrician|panel beater|diesel technician/i, label: "Mechanic" },
  { test: /\bplasterer|tiler|roofer|glazier|bricklayer|scaffolder|hvac|refrigeration technician/i, label: "Construction Trades" },
  { test: /\blabourer|laborer|construction worker|site worker|groundworker|demolition/i, label: "Construction Labourer" },
  { test: /\blandscap|gardener|groundskeeper/i, label: "Landscaping / Gardening" },
  // Agriculture / seasonal
  { test: /\bfarm (worker|hand|assistant)|farmhand|dairy|milking|harvest|fruit pick|picker|pruning|pruner|orchard|vineyard|winery|cellar (hand|door)|packhouse|horticultur|greenhouse|shearer|beekeep|aquaculture|seasonal work/i, label: "Farm / Seasonal Work" },
  { test: /\bfisherman|deckhand|fishing crew/i, label: "Fishing Crew" },
  // Transport, logistics, manufacturing
  { test: /\b(truck|delivery|bus) driver|courier|forklift|\bhgv\b|\blgv\b|heavy vehicle|excavator|crane operator|machine operator/i, label: "Driver / Operator" },
  { test: /\bwarehouse|order picker|packer\b|storeperson|stock (controller|hand)|dispatch/i, label: "Warehouse" },
  { test: /\bfactory (worker|hand|operator)|production (worker|operator|line)|assembly line|process worker/i, label: "Factory / Production" },
  // Education
  { test: /\bteacher|teaching assistant|tutor|lecturer|professor|instructor|early childhood educator|kindergarten teacher|esl\b|tefl/i, label: "Teaching / Education" },
  // Retail, office, service
  { test: /\bretail (assistant|associate|staff)|shop assistant|sales (assistant|associate|representative|rep)\b|cashier|checkout|merchandis/i, label: "Retail / Sales" },
  { test: /\boffice (assistant|administrator|manager)|administrative assistant|administration officer|secretary|data entry|clerk\b/i, label: "Administration" },
  { test: /\baccountant|bookkeep|payroll|finance (officer|assistant|manager)|auditor/i, label: "Accounting / Finance" },
  { test: /\bcustomer (service|support|care)|call cent(re|er)|contact cent(re|er)/i, label: "Customer Service" },
  { test: /\bmarketing (assistant|coordinator|manager|specialist)|social media (manager|coordinator)|content (creator|writer)|copywriter|graphic design/i, label: "Marketing / Creative" },
  // Beauty, childcare, security, cleaning
  { test: /\bhairdresser|hair stylist|barber\b|beautician|beauty therapist|nail technician|spa therapist|makeup artist|massage therapist/i, label: "Hair & Beauty" },
  { test: /\bnanny|au pair|childcare|child care|daycare|creche|early learning/i, label: "Childcare" },
  { test: /\bsecurity (guard|officer|staff)|crowd control/i, label: "Security" },
  { test: /\bcleaner|cleaning (staff|position|role)|janitor|custodian/i, label: "Cleaner" },
  // Professional services
  { test: /\blawyer|solicitor|barrister|attorney|legal counsel|paralegal|legal assistant|conveyancer/i, label: "Legal" },
  { test: /\barchitect\b|architectural designer|urban planner|town planner|interior designer|drafter\b|draftsman/i, label: "Architecture / Design" },
  { test: /\bsocial worker|community worker|youth worker|family support worker|case manager|community development|welfare officer|community outreach/i, label: "Social Work" },
  { test: /\bjournalist|reporter|news (writer|editor)|photojournalist|videographer|video editor|broadcast(er)?\b|film (maker|producer)|digital producer/i, label: "Journalism / Media" },
  { test: /\bfinancial advisor|financial planner|financial analyst|investment analyst|mortgage broker|insurance (broker|advisor)|financial controller|treasurer|actuar|risk analyst|compliance officer/i, label: "Finance / Advisory" },
  { test: /\bhuman resources|hr (manager|coordinator|advisor|business partner)|talent acquisition|people (and|&) culture|employment relations|learning and development|training coordinator/i, label: "HR / People & Culture" },
  { test: /\bpersonal trainer\b|fitness instructor|gym instructor|group fitness|yoga (instructor|teacher)|pilates instructor|swim(ming)? (teacher|instructor)|sports coach/i, label: "Fitness / Wellness" },
  { test: /\bproject manager|programme manager|project coordinator|scrum master|agile coach|\bpmo\b|delivery manager|change manager/i, label: "Project Management" },
  { test: /\breal estate agent|property manager|estate agent|letting agent|property consultant|leasing consultant/i, label: "Real Estate" },
  { test: /\bpilot\b|co-pilot|first officer|flight attendant|cabin crew|air (hostess|traffic control)|ramp agent/i, label: "Aviation" },
  { test: /\b(miner\b|mining engineer|drill operator|underground miner|\bfifo\b|fly-in fly-out|oil and gas|petroleum engineer|quarry worker|geologist\b|mine site)/i, label: "Mining / Resources" },
  { test: /\btour guide|tour operator|travel agent|travel consultant|tourism officer|adventure guide/i, label: "Tour / Tourism" },
  // Generic (kept last so specific roles win the dedupe ordering)
  { test: /\breservations|booking(s)? (agent|officer|coordinator)/i, label: "Reservations" },
  { test: /\bmanager|management|supervisor|head of|general manager|team lead/i, label: "Management" },
];

export function detectPositions(text: string): string[] {
  const hits = POSITION_RULES.filter((p) => p.test.test(text)).map((p) => p.label);
  // Rules are ordered specific → generic; cap so a busy page doesn't flood the pipeline.
  return hits.length ? [...new Set(hits)].slice(0, 6) : [];
}

// Global venue/organization-type vocabulary shared by every company-name heuristic below:
// domain/URL slug splitting, the "venue line" detector, and the generic-name filters. Covers
// hospitality AND every other industry the engine now supports (healthcare, education, trades,
// agriculture, IT, construction, retail...) so a dental clinic or a farm gets the same quality
// of name extraction a hotel always got.
const VENUE_WORDS =
  "restaurant|cafe|café|bistro|lodge|inn|bar|kitchen|grill|brasserie|dining|eatery|tavern|pub|" +
  "hotel|suites|motel|resort|hostel|" +
  "clinic|dental|hospital|pharmacy|surgery|medical|health|healthcare|vet|veterinary|care|" +
  "farm|orchard|vineyard|winery|dairy|" +
  "university|college|academy|school|institute|" +
  "engineering|construction|builders|electrical|plumbing|" +
  "logistics|transport|freight|warehouse|" +
  "garage|motors|automotive|" +
  "salon|studio|spa|barber|" +
  "law|legal|solicitors|architects|architects|accounting|consulting|advisory|" +
  "recruitment|staffing|talent|" +
  "media|publishing|productions|creative|advertising|" +
  "fitness|gym|yoga|pilates|" +
  "theatre|arena|events|venue|" +
  "mining|resources|petroleum|" +
  "shipping|maritime|ferry|" +
  "charity|foundation|trust|" +
  "council|government|ministry";
const VENUE_TERM_RE = new RegExp(`(${VENUE_WORDS})`, "i");
// Word-bounded variant for testing full lines/sentences (avoids mid-word hits like "inn" inside "dinner").
const VENUE_TERM_WORD_RE = new RegExp(`\\b(?:${VENUE_WORDS})\\b`, "i");

// Strips a trailing website-builder/agency credit clause, however it's phrased —
// "Powered by Wix", "Powered and secured by Wix", "Site by WeWeb", "designed & hosted by Acme" —
// by matching the VERB(+by/with) construction itself rather than an enumerated platform-name
// list. This means it works for any web builder/agency in the world, not just the ones we know.
const BUILDER_CREDIT_TAIL_RE =
  /\s*[-–—|•·/.,:]*\s*(?:proudly\s+)?(?:(?:website|site)\s+by|(?:powered|hosted|secured|built|designed|developed|created|managed|maintained)(?:\s*(?:,|&|and)\s*(?:powered|hosted|secured|built|designed|developed|created|managed|maintained))*\s+(?:by|with))\s+.*$/i;

function stripBuilderCredit(s: string): string {
  return s.replace(BUILDER_CREDIT_TAIL_RE, "").trim();
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

function cleanSegment(clean: string): string | null {
  // Clean up leading/trailing punctuation, dashes, or separators first
  let s = clean.replace(/^[^a-zA-Z0-9]+/, "").trim();
  // Common copyright phrasing is "© 2024 by Company Name" — after the year is stripped
  // upstream, a leading "by" is left dangling. Drop it (a real company name never starts with it).
  s = s.replace(/^by\s+/i, "").trim();

  // Strip a trailing builder/agency credit clause however it's phrased (see BUILDER_CREDIT_TAIL_RE).
  s = stripBuilderCredit(s);
  // Known bare platform names with no verb at all (e.g. "Epilogue Lounge - Wix") — still cut them.
  s = s.replace(/\s*[-–—|•·/.,:]*\s*(?:guesttraction|weweb|squarespace|wix|shopify|wordpress|godaddy|weebly|webflow|jimdo|carrd|framer|mint\s+design|fresh\s+mix\s+digital)\b.*$/i, "").trim();

  // Also split on pipe, bullet points, or dash/hyphen with surrounding spaces unconditionally
  s = s.split(/\s+[-–—|•·/]\s+/)[0];
  s = s.split(/\s*[|•·]\s*/)[0];

  // Remove common suffixes like "all rights reserved", "ltd", etc.
  s = s
    .replace(/\b(all rights reserved|ltd|limited|inc|pty|co|corp|corporation|wdw|staah)\b.*/i, "")
    .replace(/[^a-zA-Z0-9\s&]/g, "") // Keep alphanumeric, spaces, and ampersand
    .replace(/\s+/g, " ")
    .trim();
    
  // Capitalize words nicely
  s = s.replace(/\b\w/g, (c) => c.toUpperCase());
  
  const lower = s.toLowerCase();
  if (s.length > 2 && !/^(wix|shopify|squarespace|godaddy|wordpress|website|design|powered by|privacy|terms|login|admin|admin login|faq|faqs)$/i.test(lower)) {
    return collapseDouble(s);
  }
  return null;
}

// Small set of lowercase connector words allowed inside a brand phrase ("Lake of Tranquility",
// "House of Cards") without breaking the capitalized-word heuristic.
const BRAND_CONNECTOR_WORDS = "of|the|and|for|de|la|le|du|von|van|el|los|las|di|da";

// Generic nav/section labels that are NOT a business name even if they repeat 3+ times
// (every page has "Contact Us", "Home", "About Us" etc. in its nav and headings).
const NAV_PHRASE_RE = /^(home|about|about us|contact|contact us|log in|sign in|sign up|book now|read more|learn more|get started|menu|menus|gallery|our story|follow us|terms of use|terms and conditions|privacy policy|skip to content|find us|book a table|opening hours|more info|click here|day tickets|overnight|lake rules)$/i;

// Title-case a SHOUTY (ALL-CAPS) line so it matches the casing of the same phrase appearing
// elsewhere in mixed case (e.g. a hero heading "LAKE OF TRANQUILITY" vs. body text
// "Lake of Tranquility") — otherwise they're counted as different strings and neither reaches
// the repetition threshold.
function titleCaseShout(line: string): string {
  let first = true;
  const connectors = new Set(BRAND_CONNECTOR_WORDS.split("|"));
  return line.replace(/\b[a-zA-Z]+\b/g, (w) => {
    const lower = w.toLowerCase();
    const isConnector = connectors.has(lower) && !first;
    first = false;
    return isConnector ? lower : w[0].toUpperCase() + w.slice(1).toLowerCase();
  });
}

// Frequency-based: find a short capitalized phrase that repeats 3+ times across the page
// (heading, address block, intro line, etc.) — a strong signal it's the real brand name,
// independent of any single line like a copyright footer.
function findFrequentBrand(lines: string[]): string | null {
  const normalizedLines = lines.map((l) => {
    const letters = l.replace(/[^a-zA-Z]/g, "");
    const isShouty = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    return isShouty ? titleCaseShout(l) : l;
  });
  const brandCounts = new Map<string, number>();
  // Capitalized word(s), optionally joined by a short lowercase connector ("Lake of Tranquility").
  const brandRe = new RegExp(
    `\\b([A-Z][a-zA-Z']*(?:\\s+(?:${BRAND_CONNECTOR_WORDS})\\s+[A-Z][a-zA-Z']*|\\s+[A-Z][a-zA-Z']*){0,3})\\b`,
    "g"
  );
  // Match line-by-line (not on one big joined string) so distinct fragments that only sit next
  // to each other because they were separate lines (e.g. a "Contact Us" nav label immediately
  // above an address block) never get greedily fused into a single bogus candidate.
  for (const l of normalizedLines) {
    let bm: RegExpExecArray | null;
    brandRe.lastIndex = 0;
    while ((bm = brandRe.exec(l)) !== null) {
      const brand = bm[1].trim().replace(/\s+/g, " ");
      if (brand.length >= 4 && brand.length <= 35
        && !NAV_PHRASE_RE.test(brand)
        && !/^(The|And|For|With|Add|Our|All|New|Day|Hot|Big|Free|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Greek|Asian|Italian|French|GFO|ONLINE|RESTAURANT|BOOKINGS|RISE|SHINE|CROWDS|LOVE|THESE|HAPPY|HENS|LAY|EGGS|SIDE|KICKS|BAKERS|CORNER|STARTERS|MAIN|COURSES|SIDES|DESSERTS|AUTUMN|MATCH|FOR THE TABLE)$/i.test(brand)
      ) {
        brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
      }
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
  return bestBrand ? collapseDouble(bestBrand) : null;
}

// Extract the normalized "core words" of the first usable (non-social) URL's domain — e.g.
// "lakeoftranquility.co.uk" -> ["lake", "tranquility"]. Used to sanity-check an AI-guessed
// company name against the site's own address rather than trusting it blindly.
export function domainCoreWords(urls: string[]): string[] {
  const validUrl = urls.find(u => !/\b(facebook|instagram|twitter|x|linkedin|google|youtube|tiktok|apple|android|wix|squarespace|shopify|wordpress)\b/i.test(u));
  if (!validUrl) return [];
  try {
    const urlStr = validUrl.startsWith("http") ? validUrl : "https://" + validUrl;
    const hostname = new URL(urlStr).hostname.replace(/^www\./, "");
    const core = hostname.split(".")[0];
    return core
      .replace(VENUE_TERM_RE, " $1")
      .replace(/[-_]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(of|the|and|for)$/.test(w));
  } catch {
    return [];
  }
}

// Turn the first usable (non-social) URL's domain into a nicely-cased brand name —
// "lakeoftranquility.co.uk" -> "Lake Of Tranquility". Returns "" if no usable URL.
function brandFromUrl(urls: string[]): string {
  const validUrl = urls.find(u => !/\b(facebook|instagram|twitter|x|linkedin|google|youtube|tiktok|apple|android|wix|squarespace|shopify|wordpress)\b/i.test(u));
  if (!validUrl) return "";
  try {
    const urlStr = validUrl.startsWith("http") ? validUrl : "https://" + validUrl;
    const hostname = new URL(urlStr).hostname;
    const parts = hostname.replace(/^www\./, "").split(".");
    if (parts.length < 2) return "";
    let name = parts[0]
      .replace(VENUE_TERM_RE, " $1")
      .replace(/[-_]/g, " ")
      // Split a glued connector word ("lakeoftranquility" -> "lake of tranquility") — only when
      // there's enough letters on both sides to be real words, so short false hits ("wexford",
      // "thecafe") aren't mangled.
      .replace(/([a-z]{3,})(of|and|the)([a-z]{3,})/i, "$1 $2 $3")
      .replace(/\s+/g, " ")
      .trim();
    name = name.replace(/\b\w/g, c => c.toUpperCase());
    if (name && name.length > 2 && !/^(wix|shopify|squarespace|godaddy|wordpress|site|home)$/i.test(name.toLowerCase())) {
      return name;
    }
    return "";
  } catch {
    return "";
  }
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
  for (let ci = 0; ci < lines.length; ci++) {
    const line = lines[ci];
    if (/(?:©|copyright|\(c\))/i.test(line)) {
      // First, split the line by standard footer dividers: | or • or ·
      const segments = line.split(/\s*[|•·]\s*/);

      // Find the segment that contains the copyright symbol/word
      let copyrightSegment = "";
      for (const seg of segments) {
        if (/(?:©|copyright|\(c\))/i.test(seg)) {
          copyrightSegment = seg;
          break;
        }
      }

      if (!copyrightSegment) {
        copyrightSegment = line;
      }

      // Remove copyright symbol, (c), and "copyright" case-insensitively from the isolated segment
      let clean = copyrightSegment.replace(/(copyright|©|\(c\))/ig, "").trim();

      // Remove year ranges or lists (e.g., "2016-2026", "2016 - 2026", "2016, 2018", "2016")
      clean = clean.replace(/\b\d{4}\s*[-–—,]\s*\d{4}\b/g, ""); // e.g. 2016-2026
      clean = clean.replace(/\b\d{4}\b/g, ""); // e.g. 2016

      // Site builders (Wix, Squarespace, GoDaddy, …) stamp a default "© YEAR by <Template Name>"
      // footer that many owners never customize — a dead giveaway is a "Proudly created with /
      // Powered by <builder>" credit line right next to it. When that's present, the copyright
      // name is unreliable; prefer a name that actually repeats elsewhere on the page (heading,
      // address block, intro) over this single, possibly-templated line.
      const nearby = lines.slice(Math.max(0, ci - 1), ci + 3).join(" ");
      const builderCreditNearby = /\b(proudly created with|powered by|made with|built with)\b.{0,25}\b(wix|squarespace|shopify|godaddy|wordpress|weebly|webflow)\b/i.test(nearby);
      if (builderCreditNearby) {
        const strongBrand = findFrequentBrand(lines) || brandFromUrl(urls);
        if (strongBrand) return strongBrand;
      }

      // If the remaining text in this segment is empty or just punctuation/noise,
      // it means the name is likely in one of the adjacent segments (e.g. "Copyright 2026 | Punga Grove")
      let testClean = clean.replace(/[^a-zA-Z0-9]/g, "").trim();
      if (testClean.length <= 1) {
        for (const seg of segments) {
          if (seg === copyrightSegment) continue;
          const candidate = cleanSegment(seg);
          if (candidate) return candidate;
        }
      }

      const candidate = cleanSegment(clean);
      if (candidate) return candidate;
    }
  }

  // 1.5. Heuristic: If we have both emails and urls, and the email domain is generic (e.g. exploretekapo.com)
  //      but a URL domain contains a specific venue term (e.g. tekapomotel.co.nz has "motel"),
  //      prefer the URL domain as the company name!
  const venueTerms = VENUE_TERM_RE;
  if (emails.length && urls.length) {
    const emailDomain = emails[0].split("@")[1] || "";
    const emailCore = emailDomain.split(".")[0];
    if (emailCore && !venueTerms.test(emailCore)) {
      const bestUrl = urls.find(u => {
        if (/\b(facebook|instagram|twitter|x|linkedin|google|youtube|tiktok|apple|android|wix|squarespace|shopify|wordpress)\b/i.test(u)) return false;
        try {
          const urlStr = u.startsWith("http") ? u : "https://" + u;
          const hostname = new URL(urlStr).hostname;
          const core = hostname.replace(/^www\./, "").split(".")[0];
          return venueTerms.test(core);
        } catch {
          return false;
        }
      });
      if (bestUrl) {
        try {
          const urlStr = bestUrl.startsWith("http") ? bestUrl : "https://" + bestUrl;
          const hostname = new URL(urlStr).hostname;
          const core = hostname.replace(/^www\./, "").split(".")[0];
          let name = core
            .replace(VENUE_TERM_RE, " $1")
            .replace(/[-_]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          name = name.replace(/\b\w/g, c => c.toUpperCase());
          if (name && name.length > 2) {
            return name;
          }
        } catch {}
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
          .replace(VENUE_TERM_RE, " $1")
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
            .replace(VENUE_TERM_RE, " $1")
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
  const JUNK_COMPANY_LINES = /^(home|menu|menus|book|book now|cart|contact|contact us|about|about us|welcome|gallery|skip to content|privacy policy|terms of service|terms & conditions|website by|designed by|powered by|wix|shopify|squarespace|godaddy|wordpress|facebook|instagram|twitter|linkedin|day|breakfast|lunch|dinner|starters|main courses|sides|desserts|cheeseboard|toast|admin login|admin|login|faq|faqs)$/i;
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
        let candidate = stripBuilderCredit(prefix.trim().replace(/\s*[-–—,|:].*/g, "").trim());
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
  const strongBrand = findFrequentBrand(lines);
  if (strongBrand) return strongBrand;

  // 6. Prefer a content line that names a venue type, but filter out generic terms and sentences.
  const venueLine = lines.find((l) => {
    if (l.length >= 60 || l.length < 3) return false;
    if (JUNK_COMPANY_LINES.test(l)) return false;
    if (/^https?:\/\//i.test(l) || /^www\./i.test(l)) return false;
    if (/\b(book online|make a reservation|online bookings|restaurant bookings|skip to content|click to|find us)\b/i.test(l)) return false;
    if (DISCLAIMER_RE.test(l)) return false;
    // Must contain a venue/organization-type term (any industry, not just hospitality)
    if (!VENUE_TERM_WORD_RE.test(l)) return false;
    // Avoid full narrative sentences
    if (/\b(our|we|us|visit|welcome|check|open|hours|closed|from|cook|making|some)\b/i.test(l)) return false;
    return true;
  });

  if (venueLine) {
    return collapseDouble(stripBuilderCredit(venueLine.replace(/\s+[-–—|].*$/, "").trim()));
  }

  // 7. Try to guess from URLs if available
  const urlBrand = brandFromUrl(urls);
  if (urlBrand) return urlBrand;

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
    return collapseDouble(stripBuilderCredit(fallbackLine.replace(/\s+[-–—|].*$/, "").trim()));
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
  /\b(auckland|wellington|christchurch|queenstown|hamilton|tauranga|dunedin|rotorua|napier|nelson|sydney|melbourne|brisbane|perth|adelaide|gold coast|cairns|byron bay|new york|los angeles|miami|chicago|san francisco|boston|seattle|toronto|vancouver|montreal|calgary|ottawa|london|manchester|edinburgh|glasgow|liverpool|bristol|birmingham|leeds|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|madrid|barcelona|valencia|seville|sevilla|malaga|málaga|paris|lyon|marseille|bordeaux|nice|toulouse|rome|roma|milan|milano|venice|venezia|florence|firenze|naples|napoli|amsterdam|rotterdam|the hague|den haag|utrecht|eindhoven|lisbon|lisboa|porto|algarve|madeira|dublin|cork|galway|vienna|wien|salzburg|innsbruck|graz|zurich|zürich|geneva|genève|basel|bern|lausanne|athens|thessaloniki|crete|santorini|mykonos|stockholm|gothenburg|göteborg|malmö|copenhagen|københavn|aarhus|oslo|bergen|trondheim|brussels|bruxelles|antwerp|antwerpen|ghent|bruges|brugge|helsinki|tampere|turku|oulu|prague|praha|brno|ostrava|warsaw|warszawa|kraków|wrocław|gdansk|istanbul|ankara|izmir|bursa|antalya|adana|dubai|abu dhabi|sharjah|singapore|tokyo|osaka|kyoto|yokohama|nagoya|fukuoka|seoul|busan|incheon|johannesburg|cape town|durban|pretoria|valletta|nicosia|limassol)\b/i;

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
  // What kind of organization the page is about (clinic, hotel, university, farm…) and
  // whether the user is applying for a JOB or for STUDY (university/school admissions).
  orgType: OrgType;
  intent: Intent;
  // True when the pasted text appears to be a RECRUITMENT AGENCY posting on behalf of a client.
  // The draft should address the actual employer, not the agency.
  isRecruitmentAgency?: boolean;
};

// Detect whether the pasted text is a RECRUITMENT AGENCY posting on behalf of a client.
// This affects company-name extraction (the client is the real employer, not the agency).
const RECRUITMENT_AGENCY_RE =
  /\b(on behalf of (our|a|the) client|our client (is|are) (looking|seeking|hiring)|recruiting on behalf|listed by (hays|adecco|robert half|randstad|manpower|hudson|peoplebank|herd|absolute|frog|origon|exponential|tradestaff|first choice|immediate employment)|staffing agency|recruitment (agency|firm|company)|labour hire|labor hire|temp(orary)? (agency|staffing)|talent (solutions|agency)|we('re| are) acting on behalf|placed by|our specialist (consultant|team)|this (role|position) is (being )?managed by)\b/i;

export function analyze(text: string): Analysis {
  const decoded = decodeHtmlEntities(text);
  const emails = extractEmails(decoded);
  const loc = extractLocation(decoded);
  const urls = extractUrls(decoded);
  const positions = detectPositions(decoded);
  const orgType = detectOrgType(decoded, positions);
  const isRecruitmentAgency = RECRUITMENT_AGENCY_RE.test(decoded) || undefined;
  return {
    emails,
    urls,
    country: detectCountry(decoded),
    positions,
    company: guessCompany(decoded, emails, urls),
    locality: loc.locality,
    address: loc.address,
    phone: extractPhone(decoded) || undefined,
    orgType,
    intent: detectIntent(decoded, orgType),
    isRecruitmentAgency,
  };
}
