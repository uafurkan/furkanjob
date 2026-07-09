// Deep visa intelligence — deterministic, profession-aware, country-specific.
//
// Given the applicant's profile, target roles, and detected destination country,
// this module selects the BEST visa pathway + stream and produces:
//   1. Enhanced draft wording (replaces the generic "AEWV sponsorship" sentence)
//   2. Shortage list / Green List pathway notes
//   3. Working Holiday eligibility hints
//   4. Panel notes for the UI fit card
//
// Covers: NZ, AU, UK, CA, US, DE, IE, FR, ES, IT, NL, PT, AT, CH, BE, DK, NO, SE, FI,
//         PL, CZ, GR, MT, CY, AE, SG, JP, KR, TR, ZA + generic fallback.
//
// Works WITHOUT AI. AI can read the output and refine further in aiAssessFit.

import { categoriesOfRole, type WorkKind } from "./professions";
import type { EngineProfile } from "./types";
import type { Intent } from "./professions";

// ---------- Types ----------

export type PathwayConfidence = "likely" | "possible" | "check";

export type VisaPathway = {
  id: string;
  name: string;
  wording: string;       // text fragment for the draft body
  description: string;   // 1-line explanation shown in the panel
  confidence: PathwayConfidence;
  priority: number;      // 1 = highest/recommended
  notes: string[];       // additional advisory notes
};

export type VisaIntelligence = {
  recommended: VisaPathway;
  alternatives: VisaPathway[];
  onSkillShortageList: boolean;
  shortageListName: string | null;         // e.g. "NZ Green List (Tier 1)"
  shortageStream: string | null;           // e.g. "Straight to Residence pathway"
  shortageNote: string | null;             // full sentence for the panel
  workingHolidayEligible: boolean;
  workingHolidayNote: string | null;
  wording: string;                         // final string for the draft (enhanced)
  panelNotes: string[];                    // advisory notes for the fit panel UI
};

// ---------- Shortage / Skill-demand lists by country ----------
// Mapped to our profession taxonomy IDs. These represent the occupations where the
// destination country actively seeks skilled migrants, often offering better visa streams.

type ShortageInfo = {
  listName: string;
  stream: string;       // the specific visa stream / pathway this list enables
  tier?: 1 | 2;        // for NZ Green List (1=Straight to Residence, 2=Work to Residence)
  note?: string;        // extra advisory (e.g. registration requirement)
};

const SHORTAGE: Record<string, Record<string, ShortageInfo>> = {
  NZ: {
    // Tier 1 — Straight to Residence pathway
    doctor:        { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1 },
    nurse:         { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Registered Nurse; requires Nursing Council of NZ registration." },
    allied_health: { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Includes physiotherapists, occupational therapists, speech-language therapists, radiation therapists, and sonographers." },
    pharmacist:    { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires Pharmacy Council of NZ registration." },
    dentist:       { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires Dental Council of NZ registration." },
    social_work:   { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires SWRB registration." },
    engineer:      { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Civil, mechanical, structural, electrical, chemical engineers — many specialties listed." },
    electrician:   { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires EWRB electrical licence." },
    plumber:       { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires PGDB licensing." },
    software:      { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "ICT developers, analysts, architects." },
    it_support:    { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Senior ICT/system administrator roles." },
    lab_tech:      { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Medical Laboratory Scientist (with NZIMLS certification)." },
    vet:           { listName: "NZ Green List (Tier 1)", stream: "Straight to Residence pathway", tier: 1, note: "Requires Veterinary Council of NZ registration." },
    // Tier 2 — Work to Residence pathway
    care_worker:   { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2, note: "Aged care and disability support workers." },
    kitchen:       { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2, note: "Qualified chefs (Level 4 or equivalent experience)." },
    teacher:       { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2, note: "Early childhood and primary teachers; secondary teachers (especially STEM) may qualify for Tier 1." },
    carpenter:     { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2 },
    welder:        { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2 },
    construction_trades: { listName: "NZ Green List (Tier 2)", stream: "Work to Residence pathway", tier: 2, note: "Includes plasters, roofers, HVAC technicians, and other licensed trades." },
  },

  AU: {
    // MLTSSL → Skills in Demand 482 Medium-term stream (4 years) + 186 ENS pathway
    doctor:        { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "AHPRA registration required; 186 ENS Direct Entry also available for experienced practitioners." },
    nurse:         { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "AHPRA/NMBA registration required." },
    allied_health: { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "Includes physiotherapists, OTs, speech pathologists, radiographers, and more." },
    pharmacist:    { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "AHPRA registration required." },
    dentist:       { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "AHPRA/Dental Board registration required." },
    social_work:   { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "AASW membership strongly recommended." },
    software:      { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)" },
    engineer:      { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "Engineers Australia skills assessment may be required." },
    electrician:   { listName: "AU MLTSSL", stream: "Skills in Demand 482 (short/medium-term)", note: "State electrical licence required; some states have reciprocal recognition." },
    plumber:       { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "State/territory plumbing licence required." },
    teacher:       { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "State teacher registration required (each state has its own board)." },
    accounting:    { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "CPA/CA ANZ or IPA membership generally required." },
    vet:           { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)", note: "Veterinary Practitioners Board registration by state." },
    lab_tech:      { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)" },
    // STSOL → short-term stream (2 years)
    kitchen:       { listName: "AU STSOL / CSOL", stream: "Skills in Demand 482 (short-term, 2 years)", note: "Qualified chef/cook roles; employer sponsorship required." },
    care_worker:   { listName: "AU STSOL / CSOL", stream: "Skills in Demand 482 (short-term, 2 years)", note: "Aged / disability care; some states also have PNP pathways." },
    mechanic:      { listName: "AU STSOL / CSOL", stream: "Skills in Demand 482 (short-term, 2 years)", note: "Automotive technician roles." },
    carpenter:     { listName: "AU STSOL / CSOL", stream: "Skills in Demand 482 (short-term, 2 years)" },
    it_support:    { listName: "AU MLTSSL", stream: "Skills in Demand 482 (medium-term, 4 years)" },
  },

  UK: {
    // Health and Care Worker visa (sub-type of Skilled Worker — faster, cheaper fee waiver)
    doctor:        { listName: "UK Health & Care Worker visa", stream: "Health and Care Worker visa", note: "GMC registration required; fast-tracked applications." },
    nurse:         { listName: "UK Health & Care Worker visa", stream: "Health and Care Worker visa", note: "NMC registration required; employer must be CQC-registered." },
    allied_health: { listName: "UK Health & Care Worker visa", stream: "Health and Care Worker visa", note: "HCPC registration required for most roles." },
    care_worker:   { listName: "UK Health & Care Worker visa", stream: "Health and Care Worker visa", note: "Employer must be CQC-registered; salary threshold is lower for this route." },
    pharmacist:    { listName: "UK Skilled Worker (shortage)", stream: "Skilled Worker visa", note: "GPhC registration required." },
    dental_support:{ listName: "UK Health & Care Worker visa", stream: "Health and Care Worker visa", note: "Dental nurses and therapists; GDC registration required." },
    // Skilled Worker on Shortage Occupation List / Immigration Salary List
    software:      { listName: "UK Immigration Salary List", stream: "Skilled Worker visa (lower salary threshold)", note: "Many IT roles are on the shortage list, reducing the salary minimum." },
    engineer:      { listName: "UK Immigration Salary List", stream: "Skilled Worker visa (lower salary threshold)" },
    teacher:       { listName: "UK Immigration Salary List", stream: "Skilled Worker visa (lower salary threshold)", note: "Secondary school STEM and special educational needs teachers are in high demand." },
    kitchen:       { listName: "UK Immigration Salary List", stream: "Skilled Worker visa (lower salary threshold)", note: "Chef roles (e.g. chef de partie and above)." },
    social_work:   { listName: "UK Immigration Salary List", stream: "Skilled Worker visa (lower salary threshold)", note: "SWE / SSSC / NISCC registration required by country." },
    construction_trades: { listName: "UK Immigration Salary List", stream: "Skilled Worker visa", note: "Various construction trades are listed." },
  },

  CA: {
    // Express Entry — Federal Skilled Worker (FSW) / Canadian Experience Class (CEC)
    doctor:        { listName: "CA Express Entry (NOC TEER 0-1)", stream: "Express Entry – Federal Skilled Worker", note: "Provincial medical licensing required in each province." },
    nurse:         { listName: "CA Express Entry (NOC TEER 1-2)", stream: "Express Entry / Provincial Nominee Program", note: "Provincial nursing college registration required." },
    allied_health: { listName: "CA Express Entry (NOC TEER 1-2)", stream: "Express Entry – Federal Skilled Worker" },
    pharmacist:    { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "Provincial pharmacy regulatory authority registration required." },
    dentist:       { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "NDEB assessment + provincial regulatory authority registration required." },
    software:      { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "Many provinces also have Tech draws under PNP." },
    engineer:      { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "P.Eng. licensure required for sign-off roles (by provincial association)." },
    accounting:    { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "CPA designation or equivalent." },
    teacher:       { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "Provincial teaching certificate required." },
    social_work:   { listName: "CA Express Entry (NOC TEER 1)", stream: "Express Entry – Federal Skilled Worker", note: "RSW / RCSW provincial registration." },
    management:    { listName: "CA Express Entry (NOC TEER 0)", stream: "Express Entry – Federal Skilled Worker" },
    // Federal Skilled Trades
    electrician:   { listName: "CA Federal Skilled Trades (NOC TEER 2)", stream: "Express Entry – Federal Skilled Trades", note: "Red Seal certificate (IP) strongly valued; provincial licence required." },
    plumber:       { listName: "CA Federal Skilled Trades (NOC TEER 2)", stream: "Express Entry – Federal Skilled Trades", note: "Red Seal certificate; provincial master plumber licence for independent work." },
    carpenter:     { listName: "CA Federal Skilled Trades (NOC TEER 2)", stream: "Express Entry – Federal Skilled Trades" },
    welder:        { listName: "CA Federal Skilled Trades (NOC TEER 2)", stream: "Express Entry – Federal Skilled Trades" },
    mechanic:      { listName: "CA Federal Skilled Trades (NOC TEER 2)", stream: "Express Entry – Federal Skilled Trades" },
    // LMIA pathway (not Express Entry, but viable for in-demand roles)
    care_worker:   { listName: "CA NOC TEER 3 / LMIA", stream: "LMIA-based work permit", note: "Home Support Worker / Caregiver pilot stream may offer a direct-to-PR pathway." },
    kitchen:       { listName: "CA NOC TEER 2-3 / LMIA", stream: "LMIA-based work permit", note: "Cook / Chef (Red Seal) can qualify for Federal Skilled Trades." },
    lab_tech:      { listName: "CA Express Entry (NOC TEER 2)", stream: "Express Entry – Federal Skilled Worker" },
    it_support:    { listName: "CA Express Entry (NOC TEER 1-2)", stream: "Express Entry – Federal Skilled Worker" },
  },

  US: {
    // H-1B (specialty occupation — cap/lottery — needs bachelor's+)
    software:      { listName: "US H-1B specialty occupation", stream: "H-1B employer-sponsored visa (subject to annual cap)", note: "Bachelor's degree (or equivalent) in a related field required. Cap-exempt if employer is a university, non-profit, or government entity." },
    engineer:      { listName: "US H-1B specialty occupation", stream: "H-1B employer-sponsored visa", note: "P.E. licence may be required for some engineering sign-off roles." },
    doctor:        { listName: "US J-1 / H-1B / O-1", stream: "J-1 clinical exchange or H-1B (after residency)", note: "USMLE + state medical licence required. Many IMGs enter via J-1 clinical exchange; H-1B available post-residency." },
    nurse:         { listName: "US EB-3 / H-1B1 (limited) / TN (CA/MX)", stream: "EB-3 immigrant visa (employer-sponsored)", note: "RN with NCLEX pass required; VisaScreen certificate needed. Most common route is EB-3 immigrant visa due to H-1B being unavailable for most nursing roles." },
    allied_health: { listName: "US H-1B / J-1 / TN (CA/MX)", stream: "H-1B or TN (Canadians/Mexicans)", note: "Physical therapist, OT, speech pathologist often qualify for H-1B or TN. NBCOT / state licence required." },
    accounting:    { listName: "US H-1B specialty occupation", stream: "H-1B employer-sponsored visa", note: "CPA licence preferred; degree in accounting or finance required." },
    teacher:       { listName: "US J-1 exchange / H-1B", stream: "J-1 exchange visitor or H-1B", note: "J-1 is popular for international teacher exchange programs. State teaching certificate required for public schools." },
    // Seasonal — H-2A (agricultural) / H-2B (non-agricultural)
    farm:          { listName: "US H-2A agricultural", stream: "H-2A Temporary Agricultural Workers visa", note: "Employer must demonstrate no available domestic workers and gain DOL certification." },
    construction_labour: { listName: "US H-2B non-agricultural", stream: "H-2B Temporary Non-agricultural Workers visa", note: "Subject to 66,000 annual cap. Employer must file a Temporary Labor Certification." },
    food_service:  { listName: "US H-2B non-agricultural", stream: "H-2B Temporary Non-agricultural Workers visa", note: "Seasonal or peak-load need must be demonstrated." },
    housekeeping:  { listName: "US H-2B non-agricultural", stream: "H-2B Temporary Non-agricultural Workers visa" },
    // O-1 extraordinary ability
    journalism:    { listName: "US O-1 extraordinary ability", stream: "O-1A/O-1B visa (extraordinary ability/achievement)", note: "Must demonstrate national/international recognition; very high bar." },
    // TN (Canadians and Mexicans only — USMCA)
    it_support:    { listName: "US H-1B specialty occupation", stream: "H-1B employer-sponsored visa" },
  },

  DE: {
    doctor:        { listName: "DE Anerkennungspartnerschaft / Blue Card", stream: "EU Blue Card or Recognition Partnership Visa", note: "Approbation required; Recognition Partnership allows you to work while the full recognition process is underway." },
    nurse:         { listName: "DE skilled worker in demand", stream: "Skilled Worker Visa (Fachkräfte)", note: "Recognition of your nursing qualification (Anerkennung) required; Partnership Visa available for applicants whose recognition is in progress." },
    allied_health: { listName: "DE skilled worker in demand", stream: "Skilled Worker Visa / Recognition Partnership Visa", note: "Each allied health profession has its own Anerkennung process." },
    engineer:      { listName: "DE EU Blue Card eligible", stream: "EU Blue Card (salary €43,992+ or €34,056 for shortage)", note: "Engineers are designated shortage professionals — the lower salary threshold applies." },
    software:      { listName: "DE EU Blue Card eligible", stream: "EU Blue Card (shortage profession)", note: "IT specialists can also qualify via the Chancenkarte (Opportunity Card) to job-search in Germany." },
    electrician:   { listName: "DE skilled trades in demand", stream: "Skilled Worker Visa (vocational)", note: "German or equivalent EU vocational qualification required; Anerkennung for non-EU credentials." },
    teacher:       { listName: "DE skilled worker in demand", stream: "Skilled Worker Visa", note: "State-level (Bundesland) recognition required; international teacher shortage is severe." },
    kitchen:       { listName: "DE shortage occupation (vocational)", stream: "Skilled Worker Visa (vocational)", note: "Cook qualification recognised under the German vocational system (Ausbildung-equivalent)." },
    care_worker:   { listName: "DE Triple Win / shortage", stream: "Skilled Worker Visa (vocational or recognition)", note: "Germany's Triple Win programme actively recruits care workers from partner countries including the Philippines, Vietnam, Tunisia, and others." },
  },

  IE: {
    doctor:        { listName: "IE Critical Skills Employment Permit", stream: "Critical Skills Employment Permit", note: "IMC registration required; ineligible list does not apply." },
    nurse:         { listName: "IE Critical Skills / General Employment Permit", stream: "Critical Skills Employment Permit", note: "NMBI registration required." },
    allied_health: { listName: "IE Critical Skills Employment Permit", stream: "Critical Skills Employment Permit", note: "CORU registration required for regulated allied health professions." },
    software:      { listName: "IE Critical Skills Employment Permit", stream: "Critical Skills Employment Permit", note: "Highly sought-after in Ireland's tech sector (Dublin is a major European tech hub)." },
    engineer:      { listName: "IE Critical Skills Employment Permit", stream: "Critical Skills Employment Permit" },
    accounting:    { listName: "IE General Employment Permit", stream: "General Employment Permit" },
    teacher:       { listName: "IE General Employment Permit", stream: "General Employment Permit", note: "Teaching Council of Ireland registration required." },
    care_worker:   { listName: "IE General Employment Permit", stream: "General Employment Permit", note: "CORU registration required for some care roles." },
    kitchen:       { listName: "IE General Employment Permit", stream: "General Employment Permit", note: "Chef roles are on the eligible occupations list." },
  },

  FR: {
    doctor:        { listName: "FR talent passé / métier en tension", stream: "Passeport Talent (skilled worker)", note: "Ordre des médecins registration required; foreign qualifications must be recognized." },
    nurse:         { listName: "FR métier en tension", stream: "Carte de séjour temporaire — métier en tension", note: "High demand; Ordre national des infirmiers registration." },
    engineer:      { listName: "FR Passeport Talent", stream: "Passeport Talent (qualified professional)", note: "Salary must be ≥ 1.5× minimum wage." },
    software:      { listName: "FR French Tech Visa / Passeport Talent", stream: "Passeport Talent (French Tech Visa for tech roles)", note: "French Tech Visa is particularly accessible for employees of certified La French Tech companies." },
    allied_health: { listName: "FR métier en tension", stream: "Work visa — métier en tension", note: "Conseil professionnel registration required by profession." },
    care_worker:   { listName: "FR métier en tension", stream: "Work visa — métier en tension", note: "Aide-soignant and aide à domicile roles are in high demand." },
    kitchen:       { listName: "FR métier en tension", stream: "Work visa — métier en tension", note: "Chef de cuisine and pâtissier roles are listed." },
    teacher:       { listName: "FR Passeport Talent", stream: "Passeport Talent (researcher/educator)", note: "University posts; for school teachers, French teaching qualification or TAPIF assistant program." },
  },

  ES: {
    doctor:        { listName: "ES professional visa / Blue Card", stream: "EU Blue Card or Non-lucrative + professional", note: "Homologación of degree by Ministry of Health; Colegio médico membership required." },
    nurse:         { listName: "ES professional visa", stream: "Highly qualified professional visa", note: "Degree homologación required; shortage in many regions." },
    engineer:      { listName: "ES EU Blue Card", stream: "EU Blue Card", note: "Salary ≥ €34,056/year; colegio de ingenieros membership for regulated roles." },
    software:      { listName: "ES Startup/Digital Nomad / EU Blue Card", stream: "EU Blue Card or Digital Nomad Visa (remote)", note: "Spain's new Digital Nomad Visa suits remote workers; EU Blue Card for in-country employment." },
    kitchen:       { listName: "ES shortage occupation", stream: "Contingente / temporary work authorisation", note: "Cook and chef roles appear in seasonal quotas and shortage lists." },
    care_worker:   { listName: "ES shortage occupation", stream: "Temporary / long-term work authorisation", note: "Spain has significant demand for cuidadores and auxiliary nursing staff." },
  },

  IT: {
    doctor:        { listName: "IT nulla osta / click day / Blue Card", stream: "EU Blue Card or Decreto Flussi (quota-based)", note: "Ordine dei medici registration and qualification recognition required." },
    nurse:         { listName: "IT decreto flussi / shortage", stream: "Decreto Flussi (nursing quota)", note: "Italy actively recruits nurses; Collegio infermieri registration required." },
    engineer:      { listName: "IT EU Blue Card", stream: "EU Blue Card", note: "Albo degli ingegneri membership for regulated roles." },
    software:      { listName: "IT EU Blue Card / startup", stream: "EU Blue Card or Italy Startup Visa (founders)", note: "EU Blue Card available for salary ≥ €34,056/year." },
    care_worker:   { listName: "IT decreto flussi", stream: "Decreto Flussi (domestic care / badante)", note: "Italy has a dedicated family worker (badante) channel within the annual quotas." },
    kitchen:       { listName: "IT decreto flussi", stream: "Decreto Flussi (seasonal/hospitality)", note: "Chef and cook roles are frequently included in Italy's annual quotas." },
  },

  NL: {
    doctor:        { listName: "NL highly skilled migrant / Blue Card", stream: "Highly Skilled Migrant permit (kennismigrant)", note: "BIG register entry required; IND recognition of medical qualification." },
    nurse:         { listName: "NL shortage / BIG register", stream: "Regular work permit (TWV) + BIG registration", note: "BIG registration required; hospital groups sponsor nurses actively." },
    software:      { listName: "NL kennismigrant", stream: "Highly Skilled Migrant permit (kennismigrant)", note: "Salary threshold: €5,331/month (2025) for employees < 30; €7,245 for 30+." },
    engineer:      { listName: "NL kennismigrant / Blue Card", stream: "Highly Skilled Migrant or EU Blue Card" },
    allied_health: { listName: "NL shortage / BIG register", stream: "Regular work permit (TWV) + BIG registration" },
    teacher:       { listName: "NL shortage occupation", stream: "Regular work permit (TWV)", note: "Teacher shortages are acute; DUO (Dienst Uitvoering Onderwijs) recognition of foreign qualifications." },
    care_worker:   { listName: "NL shortage occupation", stream: "Regular work permit (TWV)", note: "Demand is high across elderly care, disability care, and mental health sectors." },
  },

  PT: {
    doctor:        { listName: "PT shortage / Ordem dos Médicos", stream: "Residence visa for highly qualified / subordinate work", note: "Ordem dos Médicos recognition required; Portugal has actively recruited doctors from Brazil and CPLP countries." },
    nurse:         { listName: "PT shortage / Ordem dos Enfermeiros", stream: "Residence visa for work", note: "Ordem dos Enfermeiros registration required." },
    engineer:      { listName: "PT shortage / Ordem dos Engenheiros", stream: "EU Blue Card or work visa", note: "Ordem dos Engenheiros membership for regulated roles." },
    software:      { listName: "PT D3 Tech Visa / Blue Card", stream: "Tech Visa or EU Blue Card", note: "Portugal's Tech Visa is designed for highly skilled technology professionals." },
    care_worker:   { listName: "PT shortage occupation", stream: "Work visa / subordinate work permit", note: "Demand in elderly care; agreements with several CPLP (Portuguese-speaking) countries facilitate placement." },
  },

  BE: {
    doctor:        { listName: "BE single permit / EU Blue Card", stream: "Single Permit or EU Blue Card", note: "INAMI/RIZIV recognition required; each region (Wallonia, Flanders, Brussels) has its own process." },
    nurse:         { listName: "BE shortage / INAMI", stream: "Single Permit for shortage occupation", note: "INAMI/RIZIV recognition; high demand in Brussels and Wallonia." },
    software:      { listName: "BE EU Blue Card / single permit", stream: "EU Blue Card (salary ≥ €43,992)", note: "Belgium also offers a professional card for self-employed skilled workers." },
    engineer:      { listName: "BE EU Blue Card", stream: "EU Blue Card" },
    care_worker:   { listName: "BE shortage occupation", stream: "Single Permit for shortage occupation" },
    kitchen:       { listName: "BE single permit", stream: "Single Permit for shortage occupation", note: "Chef roles are frequently listed in Brussels's and Wallonia's shortage lists." },
  },

  AT: {
    doctor:        { listName: "AT Red-White-Red Card (shortage)", stream: "Red-White-Red Card (qualified worker in shortage)", note: "ÖÄK (Austrian Medical Chamber) recognition required." },
    nurse:         { listName: "AT shortage / RWR Card", stream: "Red-White-Red Card", note: "Gesundheitsberuferegister registration; Germany's Triple Win partner agreements also cover Austria in some cases." },
    engineer:      { listName: "AT RWR Card / EU Blue Card", stream: "Red-White-Red Card or EU Blue Card" },
    software:      { listName: "AT RWR Card / EU Blue Card", stream: "Red-White-Red Card or EU Blue Card" },
    care_worker:   { listName: "AT shortage occupation", stream: "Red-White-Red Card (shortage)", note: "Pflege (care) is a declared shortage area in Austria." },
  },

  CH: {
    doctor:        { listName: "CH highly qualified professional", stream: "Swiss work permit (L / B) for qualified professionals", note: "FMH / cantonal health department recognition; EU/EFTA citizens have priority." },
    nurse:         { listName: "CH shortage / SBK-ASI", stream: "Swiss work permit for shortage occupation", note: "SBK-ASI (Swiss Nurses' Association) recognition; EU/EFTA citizens have priority by law." },
    engineer:      { listName: "CH highly qualified professional", stream: "Swiss work permit L / B" },
    software:      { listName: "CH highly qualified professional", stream: "Swiss work permit L / B", note: "For non-EU/EFTA, a federal quota applies and the employer must demonstrate no suitable EU/EFTA candidate exists." },
    teacher:       { listName: "CH cantonal requirement", stream: "Swiss work permit L / B", note: "Teaching recognition is cantonal; shortage for STEM and language teachers." },
  },

  SE: {
    doctor:        { listName: "SE shortage / Socialstyrelsen", stream: "Work permit for shortage occupation", note: "Socialstyrelsen (National Board of Health and Welfare) licence required." },
    nurse:         { listName: "SE shortage / Socialstyrelsen", stream: "Work permit for shortage occupation" },
    engineer:      { listName: "SE work permit", stream: "Swedish work permit (job offer required)" },
    software:      { listName: "SE work permit", stream: "Swedish work permit" },
    care_worker:   { listName: "SE shortage occupation", stream: "Swedish work permit for shortage occupation" },
    teacher:       { listName: "SE shortage / Skolverket", stream: "Swedish work permit", note: "Lärarlegitimation (teacher licence) required; very high demand." },
  },

  NO: {
    doctor:        { listName: "NO shortage / Helsedirektoratet", stream: "Skilled worker visa for shortage occupation", note: "SAK (Norwegian Medical Association) authorisation required." },
    nurse:         { listName: "NO shortage / Helsedirektoratet", stream: "Skilled worker visa for shortage occupation" },
    engineer:      { listName: "NO work permit (specialist)", stream: "Skilled worker visa" },
    software:      { listName: "NO work permit (specialist)", stream: "Skilled worker visa" },
    teacher:       { listName: "NO shortage occupation", stream: "Skilled worker visa", note: "NOKUT recognition of foreign qualifications; Utdanningsdirektoratet teacher authorisation." },
    care_worker:   { listName: "NO shortage occupation", stream: "Skilled worker visa for shortage occupation" },
    kitchen:       { listName: "NO work permit (specialist)", stream: "Skilled worker visa" },
  },

  DK: {
    doctor:        { listName: "DK shortage / fast-track scheme", stream: "Fast-track scheme (Beløbsordning) or shortage occupation", note: "Danish Patient Safety Authority authorisation required." },
    nurse:         { listName: "DK shortage occupation", stream: "Work permit for shortage occupation" },
    software:      { listName: "DK Pay Limit Scheme / fast-track", stream: "Pay Limit Scheme (salary ≥ DKK 448,000/year) or Fast-track" },
    engineer:      { listName: "DK Pay Limit / fast-track", stream: "Pay Limit Scheme or Fast-track Scheme" },
    care_worker:   { listName: "DK shortage occupation", stream: "Work permit for shortage occupation" },
  },

  FI: {
    doctor:        { listName: "FI shortage / Valvira", stream: "Residence permit for shortage occupation", note: "Valvira (National Supervisory Authority for Welfare and Health) licence required." },
    nurse:         { listName: "FI shortage / Valvira", stream: "Residence permit for shortage occupation" },
    software:      { listName: "FI specialist / startup", stream: "Specialist work permit" },
    engineer:      { listName: "FI specialist", stream: "Specialist work permit" },
    teacher:       { listName: "FI shortage", stream: "Residence permit for shortage occupation", note: "OPH (Finnish National Agency for Education) recognition required." },
    care_worker:   { listName: "FI shortage occupation", stream: "Residence permit for shortage occupation" },
  },

  PL: {
    doctor:        { listName: "PL shortage / NIL", stream: "Work permit for shortage occupation", note: "Naczelna Izba Lekarska recognition; high demand especially in rural areas." },
    nurse:         { listName: "PL shortage / NIPiP", stream: "Work permit for shortage occupation" },
    engineer:      { listName: "PL work permit", stream: "Work permit for qualified professionals" },
    software:      { listName: "PL work permit", stream: "Work permit for qualified professionals" },
    care_worker:   { listName: "PL shortage occupation", stream: "Work permit for shortage occupation" },
  },

  CZ: {
    doctor:        { listName: "CZ shortage / ČLK", stream: "Employee card for shortage occupation", note: "ČLK (Czech Medical Chamber) recognition required." },
    nurse:         { listName: "CZ shortage", stream: "Employee card for shortage occupation" },
    engineer:      { listName: "CZ employee card / Blue Card", stream: "Employee card or EU Blue Card" },
    software:      { listName: "CZ employee card / Blue Card", stream: "Employee card or EU Blue Card" },
    care_worker:   { listName: "CZ shortage occupation", stream: "Employee card for shortage occupation" },
  },

  GR: {
    doctor:        { listName: "GR shortage / ΙΣΑ", stream: "National Visa D + work permit", note: "Ιατρικός Σύλλογος (medical council) recognition required." },
    nurse:         { listName: "GR shortage", stream: "National Visa D + work permit" },
    engineer:      { listName: "GR EU Blue Card / work permit", stream: "EU Blue Card or work permit" },
    software:      { listName: "GR EU Blue Card / Digital Nomad Visa", stream: "EU Blue Card or Digital Nomad Visa (remote work)" },
    care_worker:   { listName: "GR shortage occupation", stream: "National Visa D + work permit", note: "Significant demand for care workers given Greece's ageing population." },
  },

  MT: {
    doctor:        { listName: "MT Single Permit / shortage", stream: "Single Permit (work + residence)", note: "Medical Council of Malta registration required." },
    nurse:         { listName: "MT Single Permit / shortage", stream: "Single Permit for shortage occupation" },
    software:      { listName: "MT Single Permit / startup", stream: "Single Permit" },
    care_worker:   { listName: "MT shortage occupation", stream: "Single Permit for shortage occupation" },
  },

  CY: {
    doctor:        { listName: "CY work permit / shortage", stream: "Category E work permit", note: "Cyprus Medical Council registration required." },
    nurse:         { listName: "CY shortage", stream: "Category E work permit" },
    software:      { listName: "CY work permit", stream: "Category E work permit" },
    engineer:      { listName: "CY work permit", stream: "Category E work permit" },
  },

  AE: {
    doctor:        { listName: "AE employment visa / DHA/MOH", stream: "Employment visa + DHA/HAAD/MOH licence", note: "Each emirate has its own health authority (DHA for Dubai, HAAD/DOH for Abu Dhabi, MOH for other emirates)." },
    nurse:         { listName: "AE employment visa / DHA", stream: "Employment visa + health authority licence" },
    engineer:      { listName: "AE employment visa", stream: "UAE employment visa", note: "Engineers may need Chartered Engineering status or local municipality approval for regulated roles." },
    software:      { listName: "AE employment visa / Freelance Permit", stream: "Employment visa or Freelance Permit (TECOM/DMCC)", note: "Free zone Freelance Permits (e.g. via TECOM) suit independent contractors." },
    teacher:       { listName: "AE employment visa / KHDA", stream: "Employment visa + KHDA/ADEK recognition", note: "KHDA (Dubai) or ADEK (Abu Dhabi) teacher recognition required for private schools." },
    allied_health: { listName: "AE employment visa / DHA", stream: "Employment visa + health authority licence" },
    management:    { listName: "AE employment visa / Golden Visa", stream: "Employment visa or UAE Golden Visa (5-year)", note: "Senior management may qualify for UAE Golden Visa (executive category)." },
    finance_pro:   { listName: "AE employment visa / DFSA", stream: "Employment visa", note: "DFSA (Dubai Financial Services Authority) registration for regulated financial roles in DIFC." },
  },

  SG: {
    doctor:        { listName: "SG Employment Pass / SMC", stream: "Employment Pass (EP) + SMC Full Registration", note: "Singapore Medical Council full registration required; competitive sponsorship process." },
    nurse:         { listName: "SG Employment Pass (EP) or S Pass / SNB", stream: "Employment Pass or S Pass", note: "Singapore Nursing Board (SNB) registration required." },
    engineer:      { listName: "SG Employment Pass (EP)", stream: "Employment Pass (EP) — min S$5,000/month", note: "PEB registration for licensed engineers in Singapore." },
    software:      { listName: "SG Tech.Pass / Employment Pass", stream: "Employment Pass (EP) or Tech.Pass", note: "Tech.Pass is for established tech leaders; EP for regular software roles." },
    teacher:       { listName: "SG Employment Pass (EP)", stream: "Employment Pass (EP)", note: "MOE (Ministry of Education) recognition for school teaching positions." },
    finance_pro:   { listName: "SG MAS regulated / EP", stream: "Employment Pass (EP)", note: "MAS (Monetary Authority of Singapore) licensing required for regulated financial services roles." },
    accounting:    { listName: "SG Employment Pass (EP)", stream: "Employment Pass (EP)" },
    allied_health: { listName: "SG Employment Pass (EP) / AHP registration", stream: "Employment Pass + AHPC registration", note: "Allied Health Professions Council (AHPC) registration required." },
  },

  JP: {
    doctor:        { listName: "JP highly skilled professional", stream: "Highly Skilled Professional (HSP) visa or Medical Service visa", note: "National medical licence required (国家試験); very high language (Japanese) requirement." },
    nurse:         { listName: "JP EPA / specified skilled worker", stream: "Specified Skilled Worker (特定技能) or EPA nurse", note: "Japan accepts nurses under the Economic Partnership Agreements (EPA) with Indonesia, Philippines, and Vietnam. Specified Skilled Worker Category 2 also applies." },
    engineer:      { listName: "JP Engineer / HSP visa", stream: "Engineer / Specialist in Humanities / International Services visa", note: "N3 Japanese proficiency increasingly expected but not always mandatory." },
    software:      { listName: "JP Engineer / HSP / J-Skip", stream: "J-Skip (Highly Skilled Specialist) or Engineer visa", note: "J-Skip fast-track introduced in 2023 for exceptional software/data professionals." },
    kitchen:       { listName: "JP specified skilled worker (食品産業)", stream: "Specified Skilled Worker Category 1 (food services sector)", note: "Requires passing the specified skills evaluation exam or equivalent experience in Japan." },
    care_worker:   { listName: "JP specified skilled worker (介護)", stream: "Specified Skilled Worker Category 1 or 2 (care sector)", note: "Kaigo (care) is one of the 12 specified industries; Japanese N4 level required." },
    farm:          { listName: "JP specified skilled worker (農業)", stream: "Specified Skilled Worker Category 1 (agriculture)", note: "Agriculture is one of the 12 specified industries; skills test required." },
    hotel:         { listName: "JP specified skilled worker (宿泊)", stream: "Specified Skilled Worker Category 1 (accommodation)", note: "Lodging industry is a specified sector; Japanese ability strongly preferred." },
  },

  KR: {
    doctor:        { listName: "KR E-series work visa", stream: "E-1 Professor / E-5 Professional visa", note: "Korea Health Personnel Licensing Examination Board (KHPLEX) recognition required." },
    nurse:         { listName: "KR E-5 professional", stream: "E-5 Professional Employment visa", note: "Korean Nursing Board recognition required." },
    engineer:      { listName: "KR E-7 special occupation", stream: "E-7 Specially Designated Activities visa", note: "Ministry of Justice designation; relevant degree + experience required." },
    software:      { listName: "KR D-8 startup / E-7 special", stream: "E-7 Specially Designated Activities or D-8 (startup)", note: "Korea has growing demand for software engineers; K-startup visa available for entrepreneurs." },
    teacher:       { listName: "KR E-2 native English teacher / E-1 professor", stream: "E-2 (English conversation instructor) or E-1 (professor)", note: "E-2 requires a degree from an English-speaking country and a clean criminal record." },
  },

  TR: {
    // Turkey is a destination country — inbound migration is less common but exists
    doctor:        { listName: "TR work permit / Tabip Odası", stream: "Work permit (çalışma izni)", note: "Turkish Medical Association (TTB) and Ministry of Health recognition required." },
    engineer:      { listName: "TR work permit", stream: "Work permit (çalışma izni)", note: "Chamber of Engineers membership for regulated roles." },
    software:      { listName: "TR Technology Development Zones / work permit", stream: "Work permit or Teknokent employment", note: "Working in Technology Development Zones (Teknokent) offers tax incentives." },
    teacher:       { listName: "TR work permit / MEB", stream: "Work permit", note: "Ministry of National Education (MEB) recognition for school teaching." },
  },

  ZA: {
    doctor:        { listName: "ZA Critical Skills Visa / HPCSA", stream: "Critical Skills Visa", note: "HPCSA (Health Professions Council of SA) registration required; occupational specific dispensation (OSD) for public sector." },
    nurse:         { listName: "ZA Critical Skills Visa / SANC", stream: "Critical Skills Visa", note: "SANC (South African Nursing Council) registration required." },
    engineer:      { listName: "ZA Critical Skills Visa / ECSA", stream: "Critical Skills Visa", note: "ECSA (Engineering Council of South Africa) registration." },
    software:      { listName: "ZA Critical Skills Visa", stream: "Critical Skills Visa", note: "ICT roles are on the Department of Home Affairs Critical Skills list." },
    teacher:       { listName: "ZA Critical Skills Visa / SACE", stream: "Critical Skills Visa", note: "SACE (South African Council for Educators) registration required." },
    care_worker:   { listName: "ZA General Work Visa", stream: "General Work Visa", note: "SACSSP registration for social auxiliary work." },
    allied_health: { listName: "ZA Critical Skills Visa / HPCSA", stream: "Critical Skills Visa" },
  },
};

// ---------- Working Holiday Visa eligibility ----------
// Maps destination country → list of source country codes whose nationals MAY hold a WHV.
// These are conservative — only well-documented bilateral agreements are included.
// Max age is typically 30 (some countries allow 35 for certain nationalities).

type WhvInfo = {
  name: string;       // visa name
  maxAge: number;     // typical maximum age
  duration: string;   // typical permitted stay
  note?: string;
};

type WhvAgreement = {
  visa: WhvInfo;
  nationalities: string[]; // ISO-3166-1 alpha-2 source country codes
};

const WHV: Record<string, WhvAgreement[]> = {
  NZ: [
    {
      visa: { name: "NZ Working Holiday Visa", maxAge: 30, duration: "up to 12 months" },
      nationalities: [
        "GB", "IE", "CA", "US", "DE", "FR", "IT", "ES", "NL", "BE", "SE", "DK", "NO", "FI",
        "AT", "CH", "JP", "KR", "SG", "HK", "TW", "CN", "AR", "BR", "CL", "MX", "TR",
        "ZA", "IN", "MY", "TH", "ID", "PH", "VN", "PL", "CZ", "HU", "RO", "MT", "CY",
        "HR", "SK", "SI", "EE", "LV", "LT", "PT", "GR", "BG",
      ],
    },
  ],
  AU: [
    {
      // Working Holiday (subclass 417) — the main one; must be 18-30 (or 35 for some countries)
      visa: { name: "AU Working Holiday Visa (subclass 417)", maxAge: 30, duration: "up to 12 months (extendable to 2-3 years with regional work)" },
      nationalities: [
        "GB", "IE", "CA", "FR", "DE", "IT", "NL", "BE", "SE", "DK", "NO", "FI", "AT",
        "JP", "KR", "HK", "TW", "MT", "CY", "EE", "LU",
      ],
    },
    {
      // Work and Holiday (subclass 462) — different countries, additional requirements (e.g. letter from home government)
      visa: { name: "AU Work and Holiday Visa (subclass 462)", maxAge: 30, duration: "up to 12 months", note: "May require a letter from your home government and 2 years of tertiary education." },
      nationalities: [
        "US", "AR", "CL", "TR", "TH", "ID", "MY", "VN", "IN", "ES", "PT", "PL", "CZ",
        "HU", "SK", "HR", "SI", "GR", "BG", "RO", "LV", "LT", "EE",
      ],
    },
  ],
  UK: [
    {
      // Youth Mobility Scheme — very restricted to a few countries
      visa: { name: "UK Youth Mobility Scheme", maxAge: 30, duration: "up to 2 years" },
      nationalities: ["AU", "NZ", "CA", "JP", "KR", "HK", "TW", "MO"],
    },
  ],
  CA: [
    {
      visa: { name: "CA International Experience Canada (IEC) – Working Holiday", maxAge: 35, duration: "up to 12-24 months" },
      nationalities: [
        "AU", "NZ", "GB", "IE", "FR", "DE", "IT", "ES", "NL", "BE", "SE", "DK", "NO",
        "FI", "AT", "CH", "JP", "KR", "HK", "TW", "AR", "CL", "MX", "CR", "CY", "EE",
        "LV", "LT", "SK", "HU", "PL", "CZ", "HR", "SI", "MT",
      ],
    },
  ],
  DE: [
    {
      visa: { name: "DE Working Holiday Visa (bilateral)", maxAge: 30, duration: "up to 12 months", note: "Germany has bilateral working holiday agreements with a number of countries." },
      nationalities: ["AU", "NZ", "CA", "JP", "KR", "HK", "TW", "AR", "CL", "MX"],
    },
  ],
  IE: [
    {
      visa: { name: "IE Working Holiday / Working Holiday Authorisation", maxAge: 30, duration: "up to 12 months" },
      nationalities: ["AU", "NZ", "CA", "JP", "KR", "HK", "TW", "AR", "US"],
    },
  ],
  FR: [
    {
      visa: { name: "FR Working Holiday Visa (Vacances-Travail)", maxAge: 30, duration: "up to 12 months" },
      nationalities: ["AU", "NZ", "CA", "JP", "KR", "HK", "TW", "AR", "MX", "CL"],
    },
  ],
  JP: [
    {
      visa: { name: "JP Working Holiday Visa", maxAge: 30, duration: "up to 12 months" },
      nationalities: ["AU", "NZ", "CA", "GB", "IE", "FR", "DE", "DK", "NO", "PT", "PL", "SK", "HU", "AT", "AR"],
    },
  ],
};

// ---------- CV signal extraction ----------
// Rough heuristics on the applicant's CV text to inform visa stream selection.

export type CvSignals = {
  hasDegreeMention: boolean;
  hasMasterOrHigher: boolean;
  hasRelevantCertification: boolean;
  estimatedYearsExperience: number | null; // null = could not determine
};

export function extractCvSignals(cvText: string | null | undefined): CvSignals {
  if (!cvText || cvText.trim().length < 50) {
    return { hasDegreeMention: false, hasMasterOrHigher: false, hasRelevantCertification: false, estimatedYearsExperience: null };
  }
  const t = cvText.toLowerCase();

  const hasDegreeMention = /\b(bachelor|bsc|b\.sc|b\.a\.|ba\b|degree|diploma|beng|b\.eng|llb|mbbs|bds|bcom|b\.com|bba|b\.ba|btech|b\.tech|graduate|undergraduate)\b/.test(t);
  const hasMasterOrHigher = /\b(master|msc|m\.sc|mba|meng|m\.eng|llm|phd|ph\.d|doctorate|d\.phil|mphil|postgrad|postdoctorate|postdoc|dds|dmd|md\b|mbbs)\b/.test(t);
  const hasRelevantCertification = /\b(certif|licence|license|registered|cpa|ca\b|cpa\b|pmp|cfa|acca|cisco|comptia|aws certified|azure certified|prince2|red seal|journeyman|trade certif|hltaid|first aid cert|nvq|cqc|ahpra|nmc|gmc|gdc|ewrb|pgdb|swrb|nmbi|sanc|hpcsa)\b/.test(t);

  // Estimate experience from year spans mentioned in the CV
  // Look for patterns like "2015-2022" or "2015 – 2022" or "2015–2022"
  const yearPairs = [...cvText.matchAll(/\b(20\d{2}|19\d{2})\s*[-–—to]+\s*(20\d{2}|present|current|now|date)\b/gi)];
  let estimatedYearsExperience: number | null = null;
  if (yearPairs.length >= 1) {
    // Sum up all span years
    let totalYears = 0;
    const currentYear = new Date().getFullYear();
    for (const m of yearPairs) {
      const start = parseInt(m[1], 10);
      const endStr = m[2].toLowerCase();
      const end = /present|current|now|date/.test(endStr) ? currentYear : parseInt(m[2], 10);
      if (start > 1950 && end >= start && end <= currentYear + 1) {
        totalYears += end - start;
      }
    }
    // Cap at 40 (sanity) and only trust if at least one pair found
    estimatedYearsExperience = Math.min(40, totalYears);
  }

  return { hasDegreeMention, hasMasterOrHigher, hasRelevantCertification, estimatedYearsExperience };
}

// ---------- Main: assess visa options ----------

export function assessVisaOptions(opts: {
  applyFor: string[];
  workKind: WorkKind;
  countryCode: string;
  countryName: string;
  fallbackWording: string;   // from visa.ts visaFor()
  intent: Intent;
  profile: EngineProfile;
}): VisaIntelligence {
  const { applyFor, workKind, countryCode, countryName, fallbackWording, intent, profile } = opts;
  const cc = countryCode.toUpperCase();

  // Already authorized — no sponsorship needed. Skip all intelligence; keep wording clean.
  if (profile.hasVisa) {
    return {
      recommended: { id: "covered", name: "Existing work authorization", wording: fallbackWording, description: "Applicant already holds valid work authorization.", confidence: "likely", priority: 1, notes: [] },
      alternatives: [],
      onSkillShortageList: false,
      shortageListName: null,
      shortageStream: null,
      shortageNote: null,
      workingHolidayEligible: false,
      workingHolidayNote: null,
      wording: fallbackWording,
      panelNotes: [],
    };
  }

  // Study intent — simplified note
  if (intent === "study") {
    return {
      recommended: { id: "student", name: "Student visa", wording: fallbackWording, description: "Student visa for the study program.", confidence: "likely", priority: 1, notes: [] },
      alternatives: [],
      onSkillShortageList: false,
      shortageListName: null,
      shortageStream: null,
      shortageNote: null,
      workingHolidayEligible: false,
      workingHolidayNote: null,
      wording: fallbackWording,
      panelNotes: [],
    };
  }

  const cv = extractCvSignals(profile.cvText);
  const countryShortage = SHORTAGE[cc] || {};

  // --- 1. Shortage / skill-demand list check ---
  let shortageMatch: (ShortageInfo & { profId: string }) | null = null;
  for (const role of applyFor) {
    for (const prof of categoriesOfRole(role)) {
      const entry = countryShortage[prof.id];
      if (entry) {
        shortageMatch = { ...entry, profId: prof.id };
        break;
      }
    }
    if (shortageMatch) break;
  }

  // --- 2. Working Holiday eligibility ---
  const whvAgreements = WHV[cc] || [];
  const sourceCountry = (profile.currentCountry || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  let whvMatch: (WhvInfo & { nationalities: string[] }) | null = null;
  if (sourceCountry && !profile.hasVisa) {
    for (const agreement of whvAgreements) {
      if (agreement.nationalities.includes(sourceCountry)) {
        whvMatch = { ...agreement.visa, nationalities: agreement.nationalities };
        break;
      }
    }
  }

  // --- 3. Build pathways ---
  const pathways: VisaPathway[] = [];
  const panelNotes: string[] = [];

  // Primary sponsored pathway
  let primaryWording = fallbackWording;
  let primaryName = `${countryName} work visa / sponsorship`;
  let primaryDesc = `Standard employer-sponsored work visa for ${countryName}.`;
  const primaryNotes: string[] = [];

  if (shortageMatch) {
    const tier1 = shortageMatch.tier === 1;
    if (cc === "NZ") {
      if (tier1) {
        primaryName = `AEWV – ${shortageMatch.listName}`;
        primaryWording = `Accredited Employer Work Visa (AEWV) sponsorship, noting that this role appears on the New Zealand Green List (Tier 1) which may open a Straight to Residence pathway`;
        primaryDesc = `Your role may qualify for the AEWV Straight to Residence pathway — the fastest route to NZ permanent residence.`;
      } else {
        primaryName = `AEWV – ${shortageMatch.listName}`;
        primaryWording = `Accredited Employer Work Visa (AEWV) sponsorship, noting this role is on the New Zealand Green List (Tier 2 — Work to Residence pathway)`;
        primaryDesc = `Your role is on the NZ Green List Tier 2, enabling a Work to Residence pathway after 2 years of skilled employment.`;
      }
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    } else if (cc === "AU") {
      primaryWording = `Skills in Demand (subclass 482) visa sponsorship (${shortageMatch.stream})`;
      primaryDesc = `Your role qualifies for the ${shortageMatch.stream} under Australia's Skills in Demand visa.`;
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    } else if (cc === "UK") {
      primaryWording = `${shortageMatch.stream} sponsorship`;
      primaryDesc = `Your role is on the UK shortage list, which may reduce salary thresholds and speed up processing.`;
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    } else if (cc === "CA") {
      primaryWording = `${shortageMatch.stream} sponsorship`;
      primaryDesc = shortageMatch.stream;
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    } else if (cc === "US") {
      primaryWording = `${shortageMatch.stream} sponsorship`;
      primaryDesc = shortageMatch.stream;
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    } else {
      // Generic enhanced wording for other countries
      primaryWording = `${shortageMatch.stream} sponsorship`;
      primaryDesc = `${shortageMatch.listName}: ${shortageMatch.stream}.`;
      if (shortageMatch.note) primaryNotes.push(shortageMatch.note);
    }
  }

  // EU Blue Card for EU destinations (if degree + skilled)
  const isEuDest = ["DE", "FR", "ES", "IT", "NL", "PT", "BE", "AT", "SE", "DK", "NO", "FI", "PL", "CZ", "GR", "MT", "CY"].includes(cc);
  if (isEuDest && workKind === "skilled" && cv.hasDegreeMention && !shortageMatch) {
    primaryNotes.push("With a relevant degree, you may also qualify for the EU Blue Card (higher-skilled migrant pathway with accelerated EU-wide mobility rights).");
  }

  // H-1B lottery notice for US skilled
  if (cc === "US" && workKind === "skilled" && !["farm", "fishing"].includes(applyFor[0])) {
    const isCapExempt = applyFor.some(r => categoriesOfRole(r).some(p => ["teacher", "lab_tech"].includes(p.id)));
    if (!isCapExempt) {
      primaryNotes.push("Note: H-1B is subject to an annual lottery cap. Employers filing on behalf of cap-exempt organizations (universities, non-profits, government entities) can bypass the lottery.");
    }
  }

  pathways.push({
    id: "sponsored",
    name: primaryName,
    wording: primaryWording,
    description: primaryDesc,
    confidence: shortageMatch ? "likely" : "possible",
    priority: 1,
    notes: primaryNotes,
  });

  // Working holiday as an alternative (or bridging) pathway
  let whvEligible = false;
  let whvNote: string | null = null;
  if (whvMatch && !profile.hasVisa) {
    whvEligible = true;
    const age = whvMatch.maxAge;
    whvNote = `If you hold a passport from your current country of residence and are under ${age}, you may be eligible for the ${whvMatch.name} (${whvMatch.duration}). This can be a quicker initial entry point while you secure employer-sponsored sponsorship.`;
    if (whvMatch.note) whvNote += ` ${whvMatch.note}`;
    panelNotes.push(whvNote);
    pathways.push({
      id: "whv",
      name: whvMatch.name,
      wording: `or initially via the ${whvMatch.name} if age-eligible`,
      description: `Working Holiday as a bridging pathway (${whvMatch.duration}).`,
      confidence: "possible",
      priority: 2,
      notes: [whvMatch.note || `Maximum age: ${age}.`],
    });
  }

  // Experience / degree-based notes
  if (cv.hasMasterOrHigher && (cc === "DE" || cc === "NL" || cc === "SE")) {
    panelNotes.push(`Your postgraduate degree may qualify you for an expedited work permit stream in ${countryName}.`);
  }
  if (cv.estimatedYearsExperience !== null && cv.estimatedYearsExperience >= 5 && cc === "CA") {
    panelNotes.push("With 5+ years of experience, you may score competitively in Canada's Express Entry Comprehensive Ranking System (CRS).");
  }

  // Shortage list panel note
  let shortageListName: string | null = null;
  let shortageStream: string | null = null;
  let shortageNote: string | null = null;
  if (shortageMatch) {
    shortageListName = shortageMatch.listName;
    shortageStream = shortageMatch.stream;
    const roleLabel = applyFor[0] || "Your role";
    shortageNote = `${roleLabel} appears on the ${shortageMatch.listName} — qualifying applicants for the ${shortageMatch.stream}.`;
    if (shortageMatch.note) shortageNote += ` ${shortageMatch.note}`;
    panelNotes.unshift(shortageNote);
  }

  // Regulated professions reminder
  const hasRegulatedRole = applyFor.some(r => categoriesOfRole(r).some(p => p.regulated));
  if (hasRegulatedRole) {
    panelNotes.push(`Note: Regulated professions in ${countryName} typically also require local professional registration/licensure before commencing work — this is separate from the work visa itself.`);
  }

  // Seasonal work note for relevant work kinds
  if (workKind === "seasonal") {
    const seasonalSchemes: Record<string, string> = {
      NZ: "Recognised Seasonal Employer (RSE) scheme",
      AU: "Pacific Australia Labour Mobility (PALM) scheme",
      UK: "Seasonal Worker visa",
      US: "H-2A or H-2B visa",
      CA: "Seasonal Agricultural Worker Program (SAWP)",
      DE: "German seasonal work permit",
      FR: "Travailleur saisonnier permit",
      ES: "Contingente seasonal work authorization",
      IT: "Decreto Flussi seasonal quota",
      NL: "Dutch seasonal work permit",
      PT: "Portuguese seasonal work visa",
      NO: "Norwegian seasonal work permit",
    };
    const scheme = seasonalSchemes[cc];
    if (scheme) panelNotes.push(`Seasonal agricultural/hospitality work in ${countryName} is typically covered by the ${scheme}.`);
  }

  const recommended = pathways[0];
  const alternatives = pathways.slice(1);

  return {
    recommended,
    alternatives,
    onSkillShortageList: !!shortageMatch,
    shortageListName,
    shortageStream,
    shortageNote,
    workingHolidayEligible: whvEligible,
    workingHolidayNote: whvNote,
    wording: primaryWording,
    panelNotes,
  };
}
