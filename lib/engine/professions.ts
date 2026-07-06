// Global profession & organization intelligence — the single source of truth that lifts the
// engine out of hospitality-only thinking. Three concerns live here:
//
//   1. PROFESSIONS — a cross-industry role taxonomy (healthcare, engineering, IT, trades,
//      agriculture, education, logistics, retail, office, beauty, childcare, security, …).
//      Each category knows its work kind (seasonal/skilled/healthcare/general), whether the
//      profession is regulated (needs local registration/licensure), and which organization
//      types plausibly employ it — so "Night Auditor" never goes to a dental clinic and
//      "Dentist" never goes to a motel.
//
//   2. detectOrgType — what kind of organization is this page about? (hotel, restaurant,
//      clinic, hospital, university, farm, factory, …). Deterministic; the AI layer can
//      override with its own read.
//
//   3. VISA_PATHS / visaFor — country × work-kind × intent visa wording. A farm hand and a
//      dentist need DIFFERENT visas in the same country (US: H-2A/H-2B vs H-1B), and a
//      university applicant needs a student visa, not sponsorship. Pragmatic product model,
//      not legal advice — drafts state it transparently and the user can always edit.

export type OrgType =
  | "hotel" | "restaurant" | "cafe" | "bar"
  | "farm"
  | "clinic" | "dental_clinic" | "hospital" | "pharmacy" | "care_home"
  | "university" | "school" | "childcare_centre"
  | "construction" | "factory" | "warehouse" | "logistics" | "garage"
  | "retail" | "salon" | "it_company" | "office"
  | "ngo" | "government" | "media" | "professional_services" | "recruitment_agency"
  | "fitness" | "event_venue" | "shipping" | "mining"
  | "generic";

export type WorkKind = "seasonal" | "skilled" | "healthcare" | "general";
export type Intent = "job" | "study";

export type Profession = {
  id: string;
  kind: WorkKind;
  regulated?: boolean;   // needs local registration/licensure in most destination countries
  orgs?: OrgType[];      // org types where this role plausibly exists; undefined = anywhere
  keywords: string[];    // lowercase; matched as substrings of a normalized role string
};

const HOSPITALITY: OrgType[] = ["hotel", "restaurant", "cafe", "bar", "farm"];
const MEDICAL: OrgType[] = ["clinic", "dental_clinic", "hospital", "pharmacy", "care_home"];

export const PROFESSIONS: Profession[] = [
  // ---- Hospitality ----
  { id: "front_desk", kind: "general", orgs: ["hotel"], keywords: ["front desk", "reception", "receptionist", "front office", "guest service", "guest relations", "check-in", "check in", "guest experience"] },
  { id: "night_audit", kind: "general", orgs: ["hotel"], keywords: ["night audit", "night auditor", "night shift", "night manager"] },
  { id: "housekeeping", kind: "general", orgs: ["hotel", "hospital", "care_home"], keywords: ["housekeep", "room attendant", "chambermaid", "turndown", "laundry"] },
  { id: "concierge", kind: "general", orgs: ["hotel"], keywords: ["concierge"] },
  { id: "reservations", kind: "general", orgs: ["hotel", "restaurant"], keywords: ["reservation", "booking"] },
  { id: "porter", kind: "general", orgs: ["hotel"], keywords: ["porter", "bellhop", "bellboy", "valet", "doorman", "luggage"] },
  { id: "food_service", kind: "general", orgs: [...HOSPITALITY, "hospital", "care_home", "university", "school"], keywords: ["waiter", "waitress", "server", "serving", "food service", "f&b", "food and beverage", "food & beverage", "dining room", "table service", "front of house", "foh", "busser", "runner", "host", "hostess"] },
  { id: "kitchen", kind: "general", orgs: [...HOSPITALITY, "hospital", "care_home", "university", "school"], keywords: ["kitchen", "chef", "cook", "kitchen hand", "commis", "sous chef", "prep cook", "dishwasher", "kitchen porter", "line cook", "culinary", "baker", "pastry", "butcher"] },
  { id: "barista", kind: "general", orgs: ["cafe", "restaurant", "hotel", "bar"], keywords: ["barista", "coffee"] },
  { id: "bar", kind: "general", orgs: ["bar", "restaurant", "hotel"], keywords: ["bartender", "bar staff", "bar back", "barback", "cocktail", "mixologist", "bar attendant", "sommelier"] },
  { id: "events", kind: "general", orgs: ["hotel", "restaurant", "office"], keywords: ["event", "banquet", "function", "catering", "conference"] },

  // ---- Healthcare (regulated unless assistant-level) ----
  { id: "dentist", kind: "healthcare", regulated: true, orgs: ["dental_clinic", "clinic", "hospital"], keywords: ["dentist", "dental surgeon", "orthodontist", "periodontist", "endodontist", "prosthodontist", "oral surgeon"] },
  { id: "dental_support", kind: "healthcare", orgs: ["dental_clinic", "clinic", "hospital"], keywords: ["dental assistant", "dental nurse", "dental hygienist", "dental technician", "dental receptionist", "oral health therapist"] },
  { id: "doctor", kind: "healthcare", regulated: true, orgs: ["clinic", "hospital", "care_home"], keywords: ["doctor", "physician", "general practitioner", "medical officer", "surgeon", "psychiatrist", "pediatrician", "paediatrician", "cardiologist", "dermatologist", "anesthesiologist", "anaesthetist", "radiologist", "gp"] },
  { id: "nurse", kind: "healthcare", regulated: true, orgs: ["clinic", "hospital", "care_home", "dental_clinic", "school"], keywords: ["nurse", "nursing", "midwife", "midwifery", "registered nurse", "enrolled nurse"] },
  { id: "care_worker", kind: "healthcare", orgs: ["care_home", "hospital", "clinic"], keywords: ["caregiver", "care giver", "care worker", "support worker", "aged care", "elderly care", "carer", "personal care assistant", "disability support", "healthcare assistant", "hca"] },
  { id: "pharmacist", kind: "healthcare", regulated: true, orgs: ["pharmacy", "hospital", "clinic"], keywords: ["pharmacist", "pharmacy technician", "pharmacy assistant", "dispenser"] },
  { id: "allied_health", kind: "healthcare", regulated: true, orgs: ["clinic", "hospital", "care_home"], keywords: ["physiotherap", "physical therapist", "occupational therapist", "chiropract", "osteopath", "speech therapist", "psychologist", "dietitian", "nutritionist", "radiographer", "sonographer", "paramedic", "optometrist"] },
  { id: "vet", kind: "healthcare", regulated: true, orgs: ["clinic", "farm"], keywords: ["veterinar", "vet nurse", "animal care", "animal health"] },
  { id: "lab_tech", kind: "healthcare", orgs: ["clinic", "hospital", "university", "factory"], keywords: ["laboratory technician", "lab technician", "laboratory scientist", "laboratory assistant", "phlebotom"] },

  // ---- Engineering & IT ----
  { id: "software", kind: "skilled", orgs: ["it_company", "office", "university"], keywords: ["software engineer", "software developer", "web developer", "frontend", "front-end", "backend", "back-end", "full stack", "fullstack", "full-stack", "mobile developer", "devops", "data scientist", "data engineer", "data analyst", "machine learning", "ai engineer", "qa engineer", "test engineer", "programmer", "cybersecurity", "security analyst"] },
  { id: "it_support", kind: "skilled", orgs: ["it_company", "office", "university", "school", "hospital"], keywords: ["it support", "help desk", "helpdesk", "system administrator", "sysadmin", "network engineer", "network administrator", "it technician"] },
  { id: "engineer", kind: "skilled", regulated: true, orgs: ["construction", "factory", "office", "it_company", "university", "garage"], keywords: ["mechanical engineer", "electrical engineer", "civil engineer", "structural engineer", "chemical engineer", "process engineer", "mechatronic", "aerospace engineer", "automotive engineer", "marine engineer", "mining engineer", "geotechnical", "environmental engineer", "industrial engineer", "engineering technician", "engineering graduate", "project engineer", "site engineer"] },

  // ---- Trades & construction (many regulated: electrician, plumber, gasfitter) ----
  { id: "electrician", kind: "skilled", regulated: true, orgs: ["construction", "factory", "office"], keywords: ["electrician", "electrical apprentice", "electrical technician", "sparky"] },
  { id: "plumber", kind: "skilled", regulated: true, orgs: ["construction"], keywords: ["plumber", "plumbing", "gasfitter", "drainlayer"] },
  { id: "carpenter", kind: "skilled", orgs: ["construction"], keywords: ["carpenter", "carpentry", "joiner", "builder", "framer", "formwork", "cabinet maker"] },
  { id: "welder", kind: "skilled", orgs: ["construction", "factory", "garage"], keywords: ["welder", "welding", "fabricator", "boilermaker", "metal worker"] },
  { id: "mechanic", kind: "skilled", orgs: ["garage", "farm", "factory", "logistics"], keywords: ["mechanic", "automotive technician", "auto electrician", "panel beater", "diesel technician", "heavy diesel"] },
  { id: "construction_trades", kind: "skilled", orgs: ["construction"], keywords: ["painter", "decorator", "plasterer", "tiler", "roofer", "glazier", "bricklayer", "blocklayer", "scaffolder", "hvac", "refrigeration", "air conditioning"] },
  { id: "construction_labour", kind: "general", orgs: ["construction", "farm"], keywords: ["labourer", "laborer", "construction worker", "site worker", "demolition", "groundworker", "landscap", "gardener", "groundskeeper"] },

  // ---- Agriculture / seasonal ----
  { id: "farm", kind: "seasonal", orgs: ["farm"], keywords: ["farm worker", "farm hand", "farmhand", "farm assistant", "dairy farm", "dairy assistant", "milking", "tractor", "harvest", "picking", "picker", "pruner", "pruning", "orchard", "vineyard", "winery", "cellar hand", "cellar door", "horticultur", "nursery worker", "greenhouse", "packhouse", "shearer", "stockman", "beekeep", "aquaculture", "fruit pick", "seasonal worker", "crop", "grower", "field work", "agricultural"] },
  { id: "fishing", kind: "seasonal", orgs: ["farm", "generic"], keywords: ["fisherman", "deckhand", "fishing crew", "skipper"] },

  // ---- Transport, logistics, manufacturing ----
  { id: "driver", kind: "general", orgs: ["logistics", "warehouse", "construction", "farm", "retail"], keywords: ["truck driver", "delivery driver", "courier", "bus driver", "forklift", "hgv", "lgv", "heavy vehicle", "machine operator", "excavator", "digger operator", "crane operator"] },
  { id: "warehouse", kind: "general", orgs: ["warehouse", "logistics", "factory", "retail"], keywords: ["warehouse", "order picker", "packer", "packing", "storeperson", "store person", "stock controller", "stock hand", "inventory", "dispatch", "loader"] },
  { id: "factory", kind: "general", orgs: ["factory", "warehouse"], keywords: ["factory worker", "factory hand", "factory operator", "production worker", "production operator", "production line", "assembly line", "process worker", "manufacturing"] },

  // ---- Education & academia ----
  { id: "teacher", kind: "skilled", regulated: true, orgs: ["school", "university"], keywords: ["teacher", "teaching assistant", "tutor", "lecturer", "professor", "instructor", "educator", "early childhood teacher", "kindergarten", "esl teacher", "tefl", "academic", "researcher", "postdoc", "research fellow"] },

  // ---- Retail, office, service ----
  { id: "retail", kind: "general", orgs: ["retail"], keywords: ["retail assistant", "retail associate", "shop assistant", "sales assistant", "sales associate", "sales representative", "sales rep", "cashier", "checkout", "merchandis", "store manager", "store assistant", "shopkeeper"] },
  { id: "admin", kind: "general", orgs: ["office", "clinic", "hospital", "university", "school", "construction", "it_company", "logistics"], keywords: ["administrat", "office assistant", "office manager", "secretary", "personal assistant", "data entry", "clerk", "clerical"] },
  { id: "accounting", kind: "skilled", orgs: ["office", "it_company"], keywords: ["accountant", "accounting", "bookkeep", "payroll", "finance officer", "finance assistant", "finance manager", "auditor"] },
  { id: "customer_service", kind: "general", orgs: ["office", "retail", "it_company", "logistics"], keywords: ["customer service", "customer support", "customer care", "call centre", "call center", "contact centre", "contact center"] },
  { id: "marketing", kind: "skilled", orgs: ["office", "it_company", "retail"], keywords: ["marketing", "social media manager", "social media coordinator", "content creator", "content writer", "copywriter", "graphic design", "brand manager", "seo"] },

  // ---- Beauty, childcare, security, cleaning ----
  { id: "beauty", kind: "general", orgs: ["salon", "hotel"], keywords: ["hairdresser", "hair stylist", "barber", "beautician", "beauty therapist", "nail technician", "esthetician", "spa therapist", "makeup artist", "massage therapist"] },
  { id: "childcare", kind: "general", orgs: ["school", "generic"], keywords: ["nanny", "au pair", "childcare", "child care", "babysit", "daycare", "creche", "early learning"] },
  { id: "security", kind: "general", orgs: ["office", "retail", "warehouse", "hotel", "bar", "construction", "hospital"], keywords: ["security guard", "security officer", "security staff", "crowd control", "bouncer"] },
  { id: "cleaning", kind: "general", keywords: ["cleaner", "cleaning", "janitor", "custodian"] },

  // ---- Management (fits anywhere) ----
  { id: "management", kind: "skilled", keywords: ["manager", "management", "supervisor", "head of", "general manager", "duty manager", "team lead", "team leader", "director", "coordinator"] },

  // ---- Professional Services ----
  { id: "legal", kind: "skilled", regulated: true, orgs: ["professional_services", "government", "office"], keywords: ["lawyer", "solicitor", "barrister", "attorney", "legal counsel", "in-house counsel", "paralegal", "legal assistant", "legal secretary", "conveyancer", "notary", "litigation"] },
  { id: "architecture", kind: "skilled", regulated: true, orgs: ["professional_services", "construction", "office"], keywords: ["architect", "architectural designer", "urban planner", "town planner", "interior designer", "interior architect", "landscape architect", "drafter", "draftsman", "drafting technician"] },
  { id: "social_work", kind: "skilled", regulated: true, orgs: ["ngo", "government", "care_home", "school", "hospital"], keywords: ["social worker", "community worker", "community support", "youth worker", "family support worker", "community development", "welfare officer", "case manager", "family violence", "community outreach", "support coordinator"] },
  { id: "journalism", kind: "skilled", orgs: ["media", "office", "ngo", "government"], keywords: ["journalist", "reporter", "editor", "sub-editor", "news writer", "photojournalist", "photographer", "videographer", "video editor", "film maker", "broadcast", "producer", "presenter", "content producer", "digital producer"] },
  { id: "finance_pro", kind: "skilled", regulated: true, orgs: ["professional_services", "office", "it_company", "government"], keywords: ["financial advisor", "financial planner", "financial analyst", "investment analyst", "portfolio manager", "fund manager", "banker", "mortgage broker", "insurance broker", "financial controller", "treasury", "actuar", "risk analyst", "compliance officer", "aml analyst"] },
  { id: "hr_recruiter", kind: "skilled", orgs: ["office", "it_company", "recruitment_agency", "government", "hospital", "university"], keywords: ["human resources", "hr manager", "hr coordinator", "hr advisor", "hr business partner", "recruiter", "talent acquisition", "talent manager", "people & culture", "people and culture", "workforce planning", "learning and development", "training coordinator", "employment relations", "industrial relations"] },

  // ---- Fitness & Wellness ----
  { id: "fitness_trainer", kind: "general", orgs: ["fitness", "hotel", "school", "care_home"], keywords: ["personal trainer", "fitness instructor", "gym instructor", "group fitness", "yoga instructor", "yoga teacher", "pilates instructor", "swim teacher", "swimming instructor", "sports coach", "athletic trainer", "recreation officer"] },

  // ---- Project & Programme Management ----
  { id: "project_management", kind: "skilled", orgs: ["office", "construction", "it_company", "government", "logistics", "professional_services", "ngo"], keywords: ["project manager", "programme manager", "program manager", "project coordinator", "project officer", "scrum master", "agile coach", "pmo", "project lead", "change manager", "delivery manager", "implementation manager"] },

  // ---- Real Estate & Property ----
  { id: "real_estate", kind: "skilled", regulated: true, orgs: ["professional_services", "office"], keywords: ["real estate agent", "property manager", "property consultant", "estate agent", "letting agent", "property sales", "property management", "leasing consultant", "body corporate"] },

  // ---- Aviation ----
  { id: "aviation", kind: "skilled", orgs: ["shipping", "generic"], keywords: ["pilot", "co-pilot", "first officer", "flight attendant", "cabin crew", "air hostess", "aviation", "air traffic control", "ground crew", "ramp agent", "baggage handler", "airport operations"] },

  // ---- Maritime & Shipping ----
  { id: "maritime", kind: "skilled", orgs: ["shipping", "farm"], keywords: ["seafarer", "sailor", "captain", "ship officer", "chief officer", "maritime", "deckhand", "maritime engineer", "seaman", "first mate", "bosun", "marine engineer", "vessel operations"] },

  // ---- Mining & Resources ----
  { id: "mining_worker", kind: "skilled", orgs: ["mining", "factory"], keywords: ["miner", "mining engineer", "drill operator", "blasting technician", "underground miner", "fifo", "fly-in fly-out", "resources sector", "oil and gas", "petroleum", "rig", "quarry worker", "geologist", "mine supervisor", "processing operator"] },

  // ---- Tourism & Guiding ----
  { id: "tour_guide", kind: "general", orgs: ["hotel", "generic", "ngo"], keywords: ["tour guide", "tour operator", "travel agent", "travel coordinator", "travel consultant", "tourism officer", "eco-tourism", "adventure guide", "cultural guide", "visitor services"] },
];

export function categoriesOfRole(role: string): Profession[] {
  const r = ` ${role.toLowerCase().replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ")} `;
  return PROFESSIONS.filter((p) => p.keywords.some((k) => r.includes(k)));
}

export function isRegulatedRole(role: string): boolean {
  return categoriesOfRole(role).some((p) => p.regulated);
}

export function regulatedRoles(roles: string[]): string[] {
  return (roles || []).filter((r) => isRegulatedRole(r));
}

// Dominant work kind for a set of roles. healthcare > seasonal > skilled > general —
// healthcare drives visa+registration wording; seasonal beats skilled because a farm hand
// applying to a vineyard needs the seasonal path even if they also list a skilled role.
export function workKindForRoles(roles: string[]): WorkKind {
  const kinds = new Set((roles || []).flatMap((r) => categoriesOfRole(r).map((p) => p.kind)));
  if (kinds.has("healthcare")) return "healthcare";
  if (kinds.has("seasonal")) return "seasonal";
  if (kinds.has("skilled")) return "skilled";
  return "general";
}

// ---------- Organization type detection ----------
// Ordered: more specific signals first (a hospital page also matches "clinic"; a dental clinic
// also matches "clinic"; a university page may mention its campus "cafe").
const ORG_RULES: { org: OrgType; test: RegExp }[] = [
  { org: "dental_clinic", test: /\b(dental (clinic|practice|centre|center|care|surgery|studio)|dentist|orthodontic|denture)\b/i },
  { org: "hospital", test: /\b(hospital|medical cent(re|er)|emergency department|surgical|inpatient|outpatient clinic)\b/i },
  { org: "pharmacy", test: /\b(pharmacy|chemist|apotheke|farmacia)\b/i },
  { org: "care_home", test: /\b(care home|nursing home|aged care|rest home|retirement (village|home)|assisted living|residential care)\b/i },
  { org: "clinic", test: /\b(clinic|general practice|gp practice|physiotherapy|chiropractic|veterinary|medical practice|health cent(re|er))\b/i },
  { org: "university", test: /\b(university|universität|université|universidad|università|universiteit|college of|polytechnic|institute of technology|faculty of|campus|undergraduate|postgraduate|bachelor|master'?s degree|phd|doctoral|tuition fees?|semester|academic year|international students?|admissions?)\b/i },
  { org: "school", test: /\b(primary school|secondary school|high school|elementary school|kindergarten|grammar school|language school|montessori)\b/i },
  { org: "farm", test: /\b(farm|orchard|vineyard|winery|dairy|harvest|horticulture|packhouse|agricultural|grower|nursery \(plants\)|greenhouse|apiary)\b/i },
  { org: "hotel", test: /\b(hotel|motel|lodge|inn\b|resort|b&b|bed and breakfast|accommodation|guesthouse|hostel|apartments?\b.{0,30}\b(stay|guest|book)|holiday park)\b/i },
  { org: "construction", test: /\b(construction|building compan|civil works|earthworks|roofing|scaffolding|renovation|infrastructure project)\b/i },
  { org: "garage", test: /\b(auto repair|mechanic|panel beat|automotive workshop|car service|tyre|tire shop|smash repair)\b/i },
  { org: "factory", test: /\b(factory|manufacturing|production (plant|facility)|assembly line|processing plant|mill\b|foundry)\b/i },
  { org: "warehouse", test: /\b(warehouse|distribution cent(re|er)|fulfilment|fulfillment)\b/i },
  { org: "logistics", test: /\b(logistics|freight|shipping compan|transport compan|courier|trucking|haulage)\b/i },
  { org: "it_company", test: /\b(software (company|house|agency)|tech (company|startup)|saas\b|web (agency|development compan)|it services)\b/i },
  { org: "salon", test: /\b(hair salon|barber ?shop|beauty (salon|clinic|studio)|nail (salon|studio|bar)|day spa|spa\b.{0,20}(treatment|massage))\b/i },
  { org: "retail", test: /\b(retail|supermarket|grocery|department store|boutique|shop online|our stores)\b/i },
  { org: "restaurant", test: /\b(restaurant|bistro|eatery|brasserie|trattoria|steakhouse|pizzeria|sushi|fine dining|our menu|dinner menu|lunch menu)\b/i },
  { org: "cafe", test: /\b(cafe|café|coffee (house|shop|roaster)|espresso|brunch)\b/i },
  { org: "bar", test: /\b(cocktail bar|wine bar|pub\b|taproom|brewery|nightclub)\b/i },
  // ---- Extended org types ----
  { org: "mining", test: /\b(mine\b|mining (company|operations?|industry)|quarry|open.?cut|underground mine|mineral processing|coal mining|gold mine|\bfifo\b|fly-in fly-out|oil (and|&) gas|petroleum|drilling rig)\b/i },
  { org: "shipping", test: /\b(cruise (ship|line)|ferry (company|operator|service)|shipping compan|cargo ship|maritime (company|services?)|vessel operator|seafaring)\b/i },
  { org: "event_venue", test: /\b(event venue|event space|wedding (venue|hall|reception)|concert hall|theatre\b|theater\b|arena\b|stadium\b|convention cent(re|er)|performing arts|entertainment venue)\b/i },
  { org: "childcare_centre", test: /\b(childcare cent(re|er)|daycare cent(re|er)|day care centre|early learning cent(re|er)|creche\b|early childhood (education|centre)|kohanga reo)\b/i },
  { org: "recruitment_agency", test: /\b(recruitment agency|staffing agency|staffing firm|labour hire|labor hire|temp (agency|firm)|talent (agency|solutions)|headhunter|executive search|listed by (hays|adecco|robert half|randstad|manpower|hudson|seek|recruit)|recruiting on behalf|on behalf of (our client|a client)|our client (is |are )?(a |an |seeking|looking))\b/i },
  { org: "ngo", test: /\b(non.?profit|nonprofit|not.for.profit|charitable (trust|organisation|organization|foundation)|charity\b|ngo\b|ngos\b|aid organisation|volunteer organisation|iwi\b|community organisation|community trust|social enterprise|community foundation)\b/i },
  { org: "government", test: /\b(government department|ministry of|district council|city council|regional council|county council|public service|crown (agency|entity)|local authority|government (agency|organisation)|police (department|force)|defence force|emergency services|municipality|state (government|agency)|federal (agency|department))\b/i },
  { org: "media", test: /\b(newspaper|media (company|group|agency|house)|television station|radio station|magazine (publisher|group)|news (agency|company|media)|production (company|house)|advertising (agency|firm)|pr (agency|firm)|creative (agency|studio)|film (studio|company|production)|digital (agency|studio)|publishing house|broadcast)\b/i },
  { org: "professional_services", test: /\b(law firm|legal (firm|practice|office)|solicitors\b|barristers\b|accounting firm|chartered accountants?|management (consulting|consultants?)|consulting (firm|company)|architecture (firm|studio)|architectural (practice|firm)|audit firm|advisory (firm|company)|financial (services firm|advisory)|wealth management)\b/i },
  { org: "fitness", test: /\b(gym\b|fitness (cent(re|er)|studio|club|facility)|health club|yoga (studio|centre)|pilates (studio|centre)|crossfit\b|leisure cent(re|er)|recreation cent(re|er)|sports (centre|center|club)|aquatic cent(re|er)|swimming (pool|club))\b/i },
];

export function detectOrgType(text: string, positions: string[] = []): OrgType {
  for (const r of ORG_RULES) {
    if (r.test.test(text)) return r.org;
  }
  // Fall back to the advertised roles: whichever org types they point at most.
  const votes = new Map<OrgType, number>();
  for (const pos of positions) {
    for (const p of categoriesOfRole(pos)) {
      for (const o of p.orgs || []) votes.set(o, (votes.get(o) || 0) + 1);
    }
  }
  let best: OrgType = "generic";
  let bestN = 0;
  for (const [o, n] of votes) if (n > bestN) { best = o; bestN = n; }
  return best;
}

export const VALID_ORG_TYPES: OrgType[] = ORG_RULES.map((r) => r.org).concat(["office", "generic"]);

// Does this org type plausibly employ this profession category?
export function orgAcceptsProfession(org: OrgType, prof: Profession): boolean {
  if (!prof.orgs || org === "generic") return true;
  return prof.orgs.includes(org);
}

// Formal-register organizations: never open with a casual local greeting ("Kia Ora"/"Hola") —
// a dental clinic, hospital, law office, or university admissions office expects formal address.
const FORMAL_ORGS: OrgType[] = ["clinic", "dental_clinic", "hospital", "pharmacy", "care_home", "university", "school", "office", "it_company", "construction", "factory", "logistics", "government", "ngo", "professional_services", "media", "shipping", "mining", "recruitment_agency"];
export function isFormalOrg(org: OrgType): boolean {
  return FORMAL_ORGS.includes(org);
}

// ---------- Study-intent detection (deterministic fallback; AI read wins) ----------
const STUDY_SIGNALS = /\b(admissions?|enrol(l)?(ment)?|apply to study|study with us|tuition fees?|undergraduate|postgraduate|bachelor of|master of|master'?s program|phd|doctoral|degree programs?|study programs?|international students?|semester dates|entry requirements|application deadline.{0,40}(course|program|degree)|student visa)\b/i;
const JOB_SIGNALS = /\b(vacanc|hiring|job opening|position available|join our team|careers? at|we('| a)re looking for|employment opportunit|staff wanted|now recruiting|job description|salary|per hour|hourly rate)\b/i;

export function detectIntent(text: string, orgType: OrgType): Intent {
  if ((orgType === "university" || orgType === "school") && STUDY_SIGNALS.test(text) && !JOB_SIGNALS.test(text)) {
    return "study";
  }
  return "job";
}

// ---------- Visa paths: country × work kind × intent ----------
// The skilled path defaults to the CountryRule.visa already defined in detect.ts; entries here
// override or add the seasonal / healthcare / study paths. Wording is what the DRAFT states —
// transparent, adapted, editable by the user.
type VisaPathSet = Partial<Record<WorkKind, string>> & { study?: string };

const VISA_PATHS: Record<string, VisaPathSet> = {
  NZ: {
    skilled: "Accredited Employer Work Visa (AEWV) sponsorship",
    seasonal: "Recognised Seasonal Employer (RSE) or Working Holiday scheme sponsorship",
    healthcare: "Accredited Employer Work Visa (AEWV) sponsorship, alongside New Zealand professional registration",
    study: "a New Zealand student visa",
  },
  AU: {
    skilled: "Skills in Demand (subclass 482) visa sponsorship",
    seasonal: "PALM scheme / seasonal work visa sponsorship",
    healthcare: "employer-sponsored work visa (subclass 482), alongside AHPRA / Australian professional registration",
    study: "an Australian student visa (subclass 500)",
  },
  US: {
    skilled: "H-1B or comparable employer-sponsored work visa",
    seasonal: "H-2A / H-2B seasonal work visa sponsorship",
    healthcare: "an employer-sponsored work visa (e.g. H-1B), alongside US state licensure",
    study: "an F-1 student visa",
  },
  CA: {
    skilled: "LMIA-based work permit sponsorship",
    seasonal: "Seasonal Agricultural Worker Program / LMIA-based work permit sponsorship",
    healthcare: "LMIA-based work permit sponsorship, alongside provincial licensure/registration",
    study: "a Canadian study permit",
  },
  UK: {
    skilled: "Skilled Worker visa sponsorship",
    seasonal: "Seasonal Worker visa sponsorship",
    healthcare: "Health and Care Worker visa sponsorship, alongside UK professional registration",
    study: "a UK Student visa",
  },
  IE: { seasonal: "an Irish seasonal/general Employment Permit", healthcare: "an Irish Employment Permit, alongside Irish professional registration (e.g. NMBI/CORU/Dental Council)", study: "an Irish study visa (Stamp 2)" },
  DE: { seasonal: "a German seasonal work permit", healthcare: "a German work visa, alongside professional recognition (Approbation/Anerkennung)", study: "a German national visa for study purposes" },
  ES: { seasonal: "a Spanish seasonal work authorization", healthcare: "a Spanish work/residence authorization, alongside title homologation", study: "a Spanish student visa" },
  FR: { seasonal: "a French seasonal worker permit (travailleur saisonnier)", healthcare: "a French work visa, alongside French professional registration", study: "a French student visa (VLS-TS étudiant)" },
  IT: { seasonal: "an Italian seasonal work permit (decreto flussi)", healthcare: "an Italian work visa, alongside qualification recognition", study: "an Italian student visa" },
  NL: { seasonal: "a Dutch seasonal work permit", healthcare: "a Dutch work permit (GVVA), alongside BIG registration", study: "a Dutch student residence permit" },
  PT: { seasonal: "a Portuguese seasonal work visa", healthcare: "a Portuguese work visa, alongside Ordem registration", study: "a Portuguese student visa" },
  AT: { seasonal: "an Austrian seasonal work permit", study: "an Austrian student residence permit" },
  CH: { seasonal: "a Swiss short-term work permit", study: "a Swiss student residence permit" },
  GR: { seasonal: "a Greek seasonal work permit", study: "a Greek student visa" },
  SE: { study: "a Swedish student residence permit" },
  DK: { study: "a Danish student residence permit" },
  NO: { seasonal: "a Norwegian seasonal work permit", study: "a Norwegian student residence permit" },
  BE: { study: "a Belgian student visa" },
  FI: { seasonal: "a Finnish seasonal work certificate", study: "a Finnish student residence permit" },
  CZ: { study: "a Czech student long-term visa" },
  PL: { seasonal: "a Polish seasonal work permit", study: "a Polish national student visa" },
  // ---- Middle East / Asia-Pacific ----
  AE: {
    skilled: "UAE employment visa / work permit sponsorship",
    healthcare: "UAE employment visa sponsorship, alongside DHA / HAAD / MOH professional registration",
    study: "a UAE student visa",
  },
  SG: {
    skilled: "Employment Pass (EP) or S Pass sponsorship",
    healthcare: "Employment Pass sponsorship, alongside Singapore professional registration (SMC / SNB / SDC)",
    study: "a Singapore Student's Pass",
  },
  JP: {
    skilled: "Japanese employer-sponsored work visa (specified skilled worker / 特定技能)",
    healthcare: "Japanese employer-sponsored work visa, alongside relevant professional registration",
    study: "a Japanese student visa (留学)",
  },
  KR: {
    skilled: "Korean employer-sponsored work visa (E-series)",
    study: "a Korean student visa (D-2)",
  },
  TR: {
    skilled: "Turkish work permit (çalışma izni) sponsorship",
    study: "a Turkish student residence permit",
  },
  // ---- Mediterranean ----
  MT: {
    skilled: "Maltese Single Permit (work + residence) sponsorship",
    study: "a Maltese student visa",
  },
  CY: {
    skilled: "Cypriot work permit (Category E) sponsorship",
    study: "a Cypriot student visa",
  },
  // ---- Africa ----
  ZA: {
    skilled: "South African critical skills / general work visa sponsorship",
    healthcare: "South African work visa, alongside HPCSA / SANC professional registration",
    study: "a South African study visa",
  },
};

// Resolve the visa wording the draft should use. `fallbackSkilled` is the country's default
// (from detect.ts COUNTRY_RULES) so every registered country keeps working even without an
// entry above. Unknown country + study still gets a sensible generic.
export function visaFor(countryCode: string, kind: WorkKind, intent: Intent, fallbackSkilled: string): string {
  const paths = VISA_PATHS[countryCode.toUpperCase()] || {};
  if (intent === "study") return paths.study || "a student visa / study permit";
  if (kind === "seasonal") return paths.seasonal || paths.skilled || fallbackSkilled;
  if (kind === "healthcare") return paths.healthcare || paths.skilled || fallbackSkilled;
  return paths.skilled || fallbackSkilled;
}

// Typical registration bodies for regulated professions — surfaced as a heads-up note in the
// fit panel, NEVER invented into the listing. Purely informational product knowledge.
const REGISTRATION_BODIES: Record<string, Record<string, string>> = {
  dentist: { AU: "Dental Board of Australia (AHPRA)", NZ: "Dental Council of New Zealand", UK: "General Dental Council (GDC)", US: "state dental board licensure", CA: "provincial dental regulatory authority", IE: "Dental Council of Ireland", DE: "Approbation (dental)", "": "the national dental council/board" },
  doctor: { AU: "Medical Board of Australia (AHPRA)", NZ: "Medical Council of New Zealand", UK: "General Medical Council (GMC)", US: "USMLE + state medical licensure", CA: "provincial College of Physicians", IE: "Irish Medical Council", DE: "Approbation", "": "the national medical council/board" },
  nurse: { AU: "Nursing and Midwifery Board (AHPRA)", NZ: "Nursing Council of New Zealand", UK: "Nursing and Midwifery Council (NMC)", US: "NCLEX + state board of nursing", CA: "provincial nursing regulatory body", IE: "NMBI", DE: "Anerkennung (nursing)", "": "the national nursing council/board" },
  pharmacist: { AU: "Pharmacy Board of Australia (AHPRA)", NZ: "Pharmacy Council of New Zealand", UK: "General Pharmaceutical Council (GPhC)", US: "state board of pharmacy", CA: "provincial college of pharmacists", "": "the national pharmacy council/board" },
  allied_health: { AU: "AHPRA (relevant board)", UK: "HCPC", "": "the relevant national registration body" },
  teacher: { AU: "state teacher registration", NZ: "Teaching Council of Aotearoa New Zealand", UK: "QTS (Qualified Teacher Status)", "": "local teacher registration/certification" },
  electrician: { AU: "state electrical licence", NZ: "EWRB registration", UK: "competent person scheme registration", "": "a local electrical licence" },
  plumber: { AU: "state plumbing licence", NZ: "PGDB registration", "": "a local plumbing licence" },
  engineer: { AU: "Engineers Australia (CPEng)", NZ: "Engineering New Zealand (PEng)", UK: "Engineering Council (CEng)", "": "local chartered/professional engineer registration for sign-off roles" },
  vet: { AU: "state veterinary registration (Veterinary Practitioners Board)", NZ: "Veterinary Council of New Zealand", UK: "RCVS", "": "the national veterinary council" },
  legal: { AU: "state/territory legal practitioner admission board", NZ: "New Zealand Law Society (NZLS)", UK: "Solicitors Regulation Authority (SRA) / Bar Council", US: "state bar association (bar exam)", CA: "provincial law society", IE: "Law Society of Ireland / Bar of Ireland", "": "the national legal regulatory body" },
  architecture: { AU: "Architects Accreditation Council of Australia (AACA)", NZ: "New Zealand Registered Architects Board (NZRAB)", UK: "Architects Registration Board (ARB)", US: "state architectural licensing board (NCARB)", "": "the national architects registration board" },
  social_work: { AU: "Australian Association of Social Workers (AASW)", NZ: "Social Workers Registration Board (SWRB)", UK: "Social Work England / Social Care Wales / NISCC", "": "the national social work registration body" },
  real_estate: { AU: "state real estate licence", NZ: "Real Estate Authority (REA) – full licence", UK: "Property Ombudsman membership / NAEA", "": "local real estate / property management licence" },
  finance_pro: { AU: "ASIC Australian Financial Services Licence (AFS)", NZ: "Financial Markets Authority (FMA) registration", UK: "FCA authorisation", "": "the national financial services regulatory registration" },
};

// One-line registration heads-up for the strongest regulated category among the given roles,
// or null when nothing is regulated. E.g. "Dentist roles in Australia typically also require
// registration with the Dental Board of Australia (AHPRA)."
export function registrationNote(roles: string[], countryCode: string, countryName: string): string | null {
  for (const role of roles || []) {
    for (const p of categoriesOfRole(role)) {
      if (!p.regulated) continue;
      const bodies = REGISTRATION_BODIES[p.id];
      if (!bodies) continue;
      const body = bodies[countryCode.toUpperCase()] || bodies[""];
      if (body) return `${role} roles in ${countryName} typically also require registration with ${body}.`;
    }
  }
  return null;
}
