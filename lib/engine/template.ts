// Profile-parametric smart template — multilingual, role-aware, varied.
// Free fallback when AI isn't used. Enforces hard rules: no signature block by default,
// explicit sponsorship statement, plain subject.
import type { Analysis } from "./detect";
import type { Draft, EngineProfile } from "./types";
import { isFormalOrg, PROFESSIONS } from "./professions";

export type AppLang = "en" | "tr" | "es" | "fr" | "de" | "it" | "pt";
export const APP_LANGS: { code: AppLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

export function autoLangForCountry(code: string): AppLang {
  switch (code) {
    case "ES": return "es";
    case "FR": case "BE": return "fr";
    case "DE": case "AT": case "CH": case "CZ": case "PL": return "de";
    case "IT": return "it";
    case "PT": case "BR": return "pt";
    default: return "en";
  }
}

export function resolveAppLang(value: string | undefined, countryCode: string): AppLang {
  if (!value || value === "auto") return autoLangForCountry(countryCode);
  return (APP_LANGS.find((l) => l.code === value)?.code) || "en";
}

// Deterministic but varied selection — same company always gets the same variant
function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Map role strings to profession taxonomy IDs
function classifyRoles(roles: string[]): string[] {
  const ids: string[] = [];
  for (const role of roles) {
    const n = role.toLowerCase();
    for (const p of PROFESSIONS) {
      if (!ids.includes(p.id) && p.keywords.some((k) => n.includes(k))) {
        ids.push(p.id);
      }
    }
  }
  return ids;
}

// Per-profession capability sentence (EN) — what the applicant brings for THIS specific role
const ROLE_CAP_EN: Record<string, string> = {
  // Hospitality
  front_desk: "My front-desk background covers guest check-in and check-out, reservation management, and real-time room allocation — keeping operations smooth during busy periods while maintaining a calm, professional presence.",
  night_audit: "I am comfortable with end-of-day cash and card reconciliation, nightly audit reports, and clear morning handover notes, ensuring records are accurate and ready before the day team arrives.",
  food_service: "My service background covers taking orders, managing table turnover, and coordinating with kitchen staff to deliver attentive, timely service — even during peak hours when every minute counts.",
  kitchen: "I have experience in food preparation, mise-en-place, and maintaining hygiene standards, working efficiently as part of a kitchen brigade under the pace of a busy service.",
  housekeeping: "I have kept guestrooms and communal areas to a consistently high standard, following detailed cleaning and presentation protocols that satisfy both comfort and compliance requirements.",
  barista: "I am trained in espresso extraction, milk texturing, and maintaining consistent quality across high-volume coffee service, keeping the queue moving without compromising the cup.",
  bar: "My bar background includes mixing drinks to spec, responsible service of alcohol, and maintaining an inviting atmosphere that keeps guests comfortable and returning.",
  events: "I have coordinated function setups, liaised with clients on requirements, and delivered smooth service across catered events — from intimate dinners to large conference groups.",
  concierge: "I have assisted guests with local experiences, transport bookings, dining reservations, and last-minute requests, providing prompt and knowledgeable answers that enhance their stay.",
  porter: "I am experienced in welcoming guests, handling luggage with care, and creating a warm first and last impression — details that guests remember long after check-out.",
  reservations: "I have managed booking systems, handled complex reservation changes, and communicated clearly with guests on availability, rates, and special requests.",
  // Healthcare
  nurse: "My nursing experience spans patient assessment, medication administration, and close coordination with multidisciplinary teams in fast-paced clinical environments, where accuracy and calm are equally important.",
  care_worker: "I have supported clients with daily living activities, personal care, and companionship, maintaining dignity, patience, and a person-centred approach throughout every interaction.",
  doctor: "My clinical background covers assessment, diagnosis, and evidence-based treatment planning, communicated clearly to both patients and the broader care team across a range of presentations.",
  dental_support: "I have assisted clinicians across extractions, restorations, and preventive procedures, managed patient records, and maintained a clean, compliant clinical environment.",
  pharmacist: "My pharmacy experience covers accurate dispensing, patient counselling on safe medication use, and maintaining detailed stock and compliance records.",
  allied_health: "My allied health experience includes patient assessment, individualized treatment delivery, and progress documentation that supports seamless multidisciplinary care.",
  vet: "I have supported veterinary clinicians in consultations, surgical procedures, and animal recovery care, always prioritizing patient welfare and clear owner communication.",
  lab_tech: "My laboratory experience covers sample processing, equipment calibration, quality control checks, and accurate result documentation in compliance with laboratory protocols.",
  // Engineering & IT
  software: "My engineering background spans full-stack development, clean code practices, and agile collaboration — I adapt quickly to new codebases, frameworks, and team workflows.",
  it_support: "I have provided first- and second-line IT support, diagnosing hardware and software issues, maintaining system uptime, and translating technical problems into clear resolutions for end users.",
  engineer: "My engineering background includes hands-on project delivery, precise technical documentation, and coordinating with multidisciplinary teams to bring work in on time and to specification.",
  // Trades
  electrician: "I hold relevant electrical qualifications and have completed installations, fault-finding, and routine maintenance across residential and commercial sites, always working to code.",
  plumber: "My plumbing experience covers new installations, drainage work, and fault diagnosis across a range of properties, with strict adherence to relevant codes and safe work practices.",
  carpenter: "My carpentry background covers residential and commercial framing, joinery, and fit-out, reading plans accurately and delivering quality finished work on site.",
  welder: "I am proficient in MIG, TIG, and stick welding, working to close tolerances across structural fabrication and general metalwork projects.",
  mechanic: "My automotive background covers diagnostics, scheduled servicing, and repair of both light and heavy vehicles, with a consistent focus on safety and quality outcomes.",
  construction_trades: "I have worked across a range of trade tasks — painting, plastering, tiling, and fit-out — adapting to the demands of each phase while meeting site safety requirements.",
  construction_labour: "I am experienced in general construction labouring, including site preparation, materials handling, and working safely alongside trade teams to keep projects on schedule.",
  // Agriculture
  farm: "I have worked across planting, crop maintenance, and harvest tasks, adapting to the seasonal pace and working safely in outdoor conditions alongside a farm team.",
  fishing: "I have experience as a deckhand, handling catch, maintaining equipment, and working efficiently within a crew on open-water vessels.",
  // Logistics & transport
  driver: "I hold the relevant licence class, maintain a clean driving record, and am experienced in route planning, safe vehicle operation, and on-time delivery.",
  warehouse: "My warehouse experience covers pick-and-pack, receiving, and inventory management, maintaining accuracy and pace in a high-volume distribution environment.",
  factory: "I have experience on production lines and assembly work, following process standards, meeting output targets, and upholding quality control requirements.",
  // Education
  teacher: "I bring classroom experience with diverse learner groups, structured lesson planning, and a supportive, encouraging approach to helping each student reach their potential.",
  // Retail & office
  retail: "My retail background covers product knowledge, customer assistance, stock management, and delivering a consistently positive in-store experience.",
  admin: "I have managed scheduling, correspondence, document control, and office coordination, helping teams stay organized and ensuring nothing falls through the cracks.",
  accounting: "My accounting background covers day-to-day bookkeeping, bank reconciliations, and producing accurate financial reports under tight reporting deadlines.",
  customer_service: "I am experienced in resolving customer enquiries across phone, email, and chat, consistently meeting quality and response-time targets while keeping interactions positive.",
  // Beauty / fitness
  fitness: "I have delivered fitness programming and coaching to clients across a range of ability levels, adapting sessions to individual goals and tracking meaningful progress.",
};

// For EN: combine top 2 profession capability sentences
function buildRoleCapEN(profIds: string[]): string {
  if (!profIds.length) return "";
  const a = ROLE_CAP_EN[profIds[0]];
  const b = profIds[1] ? ROLE_CAP_EN[profIds[1]] : undefined;
  if (!a) return b || "";
  if (!b) return a;
  return a + "\n\n" + b;
}

// Natural language-line integration (EN only — other languages use bare list which is already correct)
function buildLanguageLineEN(languages: string[], orgType: string): string {
  if (!languages.length) return "";
  const clientCtx =
    orgType === "clinic" || orgType === "hospital" || orgType === "care_home" || orgType === "dental_clinic"
      ? "patients"
      : orgType === "school" || orgType === "university"
      ? "students"
      : orgType === "retail"
      ? "customers"
      : "guests and colleagues";

  const nativeEntry = languages.find((l) => /native/i.test(l));
  const others = languages.filter((l) => !/native/i.test(l));

  if (nativeEntry && others.length >= 1) {
    const nativeName = nativeEntry.replace(/\s*\(.*?\)/g, "").trim();
    const otherList = others.join(" and ");
    return `As a native ${nativeName} speaker with ${otherList}, I am well-placed to communicate clearly with a diverse range of ${clientCtx}.`;
  }
  if (languages.length === 1) {
    return `I communicate in ${languages[0]}.`;
  }
  return `My language skills span ${languages.join(", ")}, which helps me work effectively with ${clientCtx}.`;
}

// ── Country-specific casual greeting ──────────────────────────────────────────
function casualGreeting(countryCode: string, company: string, hash: number): string {
  switch (countryCode) {
    case "NZ":
      // Rotate between plain "Kia Ora," and "Kia Ora [Company] Team,"
      return hash % 3 === 0 ? `Kia Ora ${company} Team,` : "Kia Ora,";
    case "AU":
      return hash % 4 === 0 ? `Dear ${company} Team,` : "Dear Hiring Manager,";
    case "ES": return "Hola,";
    case "FR": return "Bonjour,";
    case "DE": return "Hallo,";
    case "IT": return "Ciao,";
    case "PT": return "Olá,";
    default: return hash % 3 === 0 ? `Dear ${company} Team,` : "Dear Hiring Manager,";
  }
}

// ── EN intro variants (5 options, selected by hash) ───────────────────────────
const EN_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `I am writing to express my strong interest in the ${r} position(s) at ${c}. I am an enthusiastic and reliable candidate with a genuine commitment to my work, and I would be glad to contribute to your team.`,
  (r, c) => `I am excited to apply for the ${r} role(s) at ${c}, where I believe my background and hands-on experience are a strong match for what you need.`,
  (r, c) => `Please consider my application for the ${r} position(s) at ${c}. I am a motivated and dependable candidate, genuinely committed to delivering quality work and supporting the team around me.`,
  (r, c) => `I would love to bring my background to the ${r} role(s) at ${c}. I am reliable, eager to contribute, and ready to make a real difference from day one.`,
  (r, c) => `Having followed the opportunities at ${c}, I am confident that my experience and work ethic are a good fit for the ${r} position(s) you have available.`,
];

// ── EN closing variants (3 options, selected by hash) ────────────────────────
const EN_CLOSINGS: Array<(c: string) => string> = [
  (c) => `Please find my CV attached. I would welcome the opportunity to discuss how I can support ${c}, and I thank you for your time and consideration.`,
  (c) => `My CV is attached for your review. I look forward to the possibility of contributing to ${c} and would be happy to discuss further at your convenience.`,
  (c) => `I have attached my CV for your consideration. I am enthusiastic about the prospect of joining ${c} and would welcome a conversation at a time that suits you.`,
];

// ── Other-language intro variants ─────────────────────────────────────────────
const TR_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `${c} bünyesindeki ${r} pozisyon(lar)ına olan güçlü ilgimi belirtmek isterim. İşine içtenlikle bağlı, güvenilir ve istekli bir adayım; ekibinize katkı sunmaktan memnuniyet duyarım.`,
  (r, c) => `${c}'deki ${r} pozisyon(lar)ı için başvurumu sunmaktan heyecan duyuyorum. Çalışkanlığım ve güvenilirliğimle ekibinize gerçek bir katkı sağlayabileceğimi düşünüyorum.`,
  (r, c) => `${c} ekibinin bir parçası olmak ve ${r} rolünde katkı sunmak için başvuruyorum. İşe olan bağlılığım ve sorumluluk anlayışımla değer katacağımdan eminim.`,
];

const ES_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `Le escribo para expresar mi gran interés en el/los puesto(s) de ${r} en ${c}. Soy un candidato entusiasta y fiable, verdaderamente comprometido con mi trabajo, y me encantaría contribuir a su equipo.`,
  (r, c) => `Me ilusiona presentar mi candidatura para el/los puesto(s) de ${r} en ${c}, donde creo que mi experiencia y dedicación son un buen encaje con lo que necesita su equipo.`,
  (r, c) => `Deseo postularme al puesto de ${r} en ${c}. Soy una persona comprometida, responsable y con ganas de aportar resultados reales desde el primer día.`,
];

const FR_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `Je me permets de vous adresser ma candidature pour le(s) poste(s) de ${r} au sein de ${c}. Candidat enthousiaste et fiable, profondément investi dans mon travail, je serais ravi de contribuer à votre équipe.`,
  (r, c) => `Je suis très motivé à l'idée de rejoindre ${c} en tant que ${r}. Mon sérieux, ma fiabilité et mon envie de bien faire font de moi un candidat que votre équipe peut compter.`,
  (r, c) => `C'est avec enthousiasme que je postule pour le(s) poste(s) de ${r} chez ${c}, convaincu que mon expérience et mon engagement correspondent à vos attentes.`,
];

const DE_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `Hiermit bewerbe ich mich mit großem Interesse für die Position(en) als ${r} bei ${c}. Als engagierter und zuverlässiger Kandidat mit echter Hingabe an meine Arbeit würde ich Ihr Team gern unterstützen.`,
  (r, c) => `Ich freue mich, mich auf die Stelle(n) als ${r} bei ${c} bewerben zu können. Meine Verlässlichkeit, Einsatzbereitschaft und Erfahrung passen gut zu dem, was Ihr Team braucht.`,
  (r, c) => `Mit Begeisterung reiche ich meine Bewerbung für die Position(en) als ${r} bei ${c} ein. Ich bin überzeugt, mit meinem Einsatz und meiner Erfahrung einen echten Mehrwert zu bieten.`,
];

const IT_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `Le scrivo per esprimere il mio vivo interesse per la/le posizione(i) di ${r} presso ${c}. Sono un candidato entusiasta e affidabile, sinceramente dedito al mio lavoro, e sarei lieto di contribuire al vostro team.`,
  (r, c) => `Sono entusiasta di candidarmi per il/i ruolo(i) di ${r} presso ${c}, convinto che la mia esperienza e la mia dedizione rappresentino un ottimo punto di partenza per il vostro team.`,
  (r, c) => `Desidero presentare la mia candidatura per il/i posto(i) di ${r} presso ${c}. Sono una persona affidabile, proattiva e pronta a dare il massimo sin dal primo giorno.`,
];

const PT_INTROS: Array<(r: string, c: string) => string> = [
  (r, c) => `Escrevo para expressar o meu grande interesse na(s) vaga(s) de ${r} na ${c}. Sou um candidato entusiasta e confiável, verdadeiramente dedicado ao meu trabalho, e teria muito gosto em contribuir para a sua equipa.`,
  (r, c) => `Venho candidatar-me com entusiasmo para a(s) posição(ões) de ${r} na ${c}, onde acredito que a minha experiência e empenho se enquadram bem nas vossas necessidades.`,
  (r, c) => `Gostaria de apresentar a minha candidatura para o(s) posto(s) de ${r} na ${c}. Sou uma pessoa comprometida, responsável e pronta a contribuir de forma significativa desde o primeiro dia.`,
];

type Frag = {
  subject: (roles: string, company: string) => string;
  formalGreeting: string;
  intros: Array<(r: string, c: string) => string>;
  visa: (visa: string, country: string, reloc: boolean) => string;
  visaHeld: (label: string, country: string) => string;
  languages: (langs: string) => string;
  closings: Array<(company: string) => string>;
};

const F: Record<AppLang, Frag> = {
  en: {
    subject: (r, c) => `${r} Application — ${c}`,
    formalGreeting: "Dear Hiring Manager,",
    intros: EN_INTROS,
    visa: (v, c, reloc) =>
      `I would like to be transparent from the outset: I require ${v} to work in ${c}, and I am applying specifically for roles where the employer is able to provide it.${reloc ? " I am available to relocate and" : " I am"} ready to start as soon as the necessary process is completed.`,
    visaHeld: (label, c) =>
      `I already hold a valid ${label} that authorises me to work in ${c}, so no sponsorship is required — I am legally able to start immediately, with no visa cost or paperwork for you.`,
    languages: (l) => `Languages: ${l}.`,
    closings: EN_CLOSINGS,
  },
  tr: {
    subject: (r, c) => `${r} Başvurusu — ${c}`,
    formalGreeting: "Sayın Yetkili,",
    intros: TR_INTROS,
    visa: (v, c, reloc) =>
      `Baştan şeffaf olmak isterim: ${c}'de çalışabilmek için ${v} gerekiyor ve özellikle işverenin bunu sağlayabildiği rollere başvuruyorum.${reloc ? " Taşınmaya açığım ve" : ""} gerekli süreç tamamlanır tamamlanmaz başlamaya hazırım.`,
    visaHeld: (label, c) =>
      `Hâlihazırda ${c}'de çalışmama izin veren geçerli bir ${label} sahibiyim; sponsorluğa gerek yok — yasal olarak hemen başlayabilirim, sizin için herhangi bir vize masrafı veya işlemi olmadan.`,
    languages: (l) => `Diller: ${l}.`,
    closings: [
      (c) => `CV'mi ekte bulabilirsiniz. ${c} ekibine nasıl katkı sağlayabileceğimi görüşme fırsatından memnuniyet duyarım; zaman ayırdığınız için teşekkür ederim.`,
      (c) => `Özgeçmişimi ekte sunuyorum. ${c}'e katılma konusunda büyük bir heves taşıyorum ve size uygun bir zamanda görüşmek için hazırım.`,
    ],
  },
  es: {
    subject: (r, c) => `Solicitud de ${r} — ${c}`,
    formalGreeting: "Estimado/a responsable de selección:",
    intros: ES_INTROS,
    visa: (v, c, reloc) =>
      `Quiero ser transparente desde el principio: necesito ${v} para trabajar en ${c}, y me postulo específicamente a puestos en los que el empleador pueda proporcionarlo.${reloc ? " Estoy disponible para reubicarme y" : " Estoy"} listo para empezar en cuanto se complete el proceso necesario.`,
    visaHeld: (label, c) =>
      `Ya dispongo de un/a ${label} válido/a que me autoriza a trabajar en ${c}, por lo que no se requiere ningún patrocinio — puedo incorporarme de inmediato y de forma legal, sin coste ni trámites de visado para usted.`,
    languages: (l) => `Idiomas: ${l}.`,
    closings: [
      (c) => `Adjunto mi CV. Estaría encantado de conversar sobre cómo puedo aportar a ${c}, y le agradezco su tiempo y consideración.`,
      (c) => `He adjuntado mi CV para su revisión. Me encantaría tener la oportunidad de unirme al equipo de ${c} y estaré disponible cuando desee hablar.`,
    ],
  },
  fr: {
    subject: (r, c) => `Candidature ${r} — ${c}`,
    formalGreeting: "Madame, Monsieur,",
    intros: FR_INTROS,
    visa: (v, c, reloc) =>
      `Je souhaite être transparent dès le départ : j'ai besoin de ${v} pour travailler en ${c}, et je postule spécifiquement aux postes pour lesquels l'employeur peut le fournir.${reloc ? " Je suis disponible pour déménager et" : " Je suis"} prêt à commencer dès que les démarches nécessaires seront terminées.`,
    visaHeld: (label, c) =>
      `Je dispose déjà d'un(e) ${label} en cours de validité m'autorisant à travailler en ${c} ; aucun parrainage n'est donc nécessaire — je peux commencer immédiatement et en toute légalité, sans frais ni démarches de visa pour vous.`,
    languages: (l) => `Langues : ${l}.`,
    closings: [
      (c) => `Vous trouverez mon CV en pièce jointe. Je serais ravi d'échanger sur ma contribution possible à ${c}, et je vous remercie de votre temps et de votre attention.`,
      (c) => `Mon CV est joint à ce message. Je serais enthousiaste à l'idée de rejoindre ${c} et reste disponible pour un entretien à votre convenance.`,
    ],
  },
  de: {
    subject: (r, c) => `Bewerbung ${r} — ${c}`,
    formalGreeting: "Sehr geehrte Damen und Herren,",
    intros: DE_INTROS,
    visa: (v, c, reloc) =>
      `Ich möchte von Anfang an transparent sein: Für eine Tätigkeit in ${c} benötige ich ${v} und bewerbe mich gezielt auf Stellen, bei denen der Arbeitgeber dies ermöglichen kann.${reloc ? " Ich bin umzugsbereit und" : " Ich bin"} bereit, sofort nach Abschluss der erforderlichen Schritte zu beginnen.`,
    visaHeld: (label, c) =>
      `Ich verfüge bereits über eine/n gültige/n ${label}, die/der mich zur Arbeit in ${c} berechtigt; eine Sponsorschaft ist daher nicht erforderlich — ich kann sofort und rechtlich einwandfrei beginnen, ohne Visakosten oder Aufwand für Sie.`,
    languages: (l) => `Sprachen: ${l}.`,
    closings: [
      (c) => `Meinen Lebenslauf finden Sie im Anhang. Über ein Gespräch, wie ich ${c} unterstützen kann, würde ich mich sehr freuen, und ich danke Ihnen für Ihre Zeit.`,
      (c) => `Ich habe meinen Lebenslauf beigefügt und freue mich auf die Möglichkeit, meine Bewerbung bei ${c} näher zu erläutern.`,
    ],
  },
  it: {
    subject: (r, c) => `Candidatura ${r} — ${c}`,
    formalGreeting: "Gentile Responsabile delle Risorse Umane,",
    intros: IT_INTROS,
    visa: (v, c, reloc) =>
      `Desidero essere trasparente fin dall'inizio: per lavorare in ${c} ho bisogno di ${v} e mi candido specificamente per ruoli in cui il datore di lavoro può fornirlo.${reloc ? " Sono disponibile a trasferirmi e" : " Sono"} pronto a iniziare non appena completato l'iter necessario.`,
    visaHeld: (label, c) =>
      `Possiedo già un/una ${label} valido/a che mi autorizza a lavorare in ${c}, quindi non è necessaria alcuna sponsorizzazione — posso iniziare subito e in modo del tutto legale, senza costi o pratiche di visto per voi.`,
    languages: (l) => `Lingue: ${l}.`,
    closings: [
      (c) => `In allegato trova il mio CV. Sarei lieto di discutere come posso contribuire a ${c} e La ringrazio per il tempo e l'attenzione.`,
      (c) => `Ho allegato il mio CV e sono entusiasta della possibilità di unirmi a ${c}. Resto a disposizione per un colloquio quando preferite.`,
    ],
  },
  pt: {
    subject: (r, c) => `Candidatura ${r} — ${c}`,
    formalGreeting: "Prezado(a) Responsável de Recrutamento,",
    intros: PT_INTROS,
    visa: (v, c, reloc) =>
      `Quero ser transparente desde o início: preciso de ${v} para trabalhar em ${c} e candidato-me especificamente a funções em que o empregador o possa providenciar.${reloc ? " Estou disponível para me mudar e" : " Estou"} pronto para começar assim que o processo necessário estiver concluído.`,
    visaHeld: (label, c) =>
      `Já possuo um(a) ${label} válido(a) que me autoriza a trabalhar em ${c}, pelo que não é necessário qualquer patrocínio — posso começar de imediato e de forma totalmente legal, sem custos ou burocracia de visto para si.`,
    languages: (l) => `Idiomas: ${l}.`,
    closings: [
      (c) => `Em anexo segue o meu CV. Teria todo o gosto em conversar sobre como posso contribuir para ${c} e agradeço o seu tempo e consideração.`,
      (c) => `Anexei o meu CV para sua análise. Estou entusiasmado com a oportunidade de integrar a equipa de ${c} e fico disponível para uma conversa quando for conveniente.`,
    ],
  },
};

// ── Follow-up email ────────────────────────────────────────────────────────────
const FOLLOWUP: Record<AppLang, { subject: (c: string) => string; body: (c: string, greeting: string) => string }> = {
  en: {
    subject: (c) => `Following up — my application to ${c}`,
    body: (c, g) => `${g}\n\nI hope you are well. I recently sent an application to ${c} and wanted to follow up in case it was missed. I remain very interested in joining your team and would be happy to provide anything else you need.\n\nThank you for your time and consideration.`,
  },
  tr: {
    subject: (c) => `Takip — ${c} başvurum`,
    body: (c, g) => `${g}\n\nUmarım iyisinizdir. Kısa süre önce ${c} için bir başvuru gönderdim ve gözden kaçmış olabilir diye takip etmek istedim. Ekibinize katılmaya hâlâ çok istekliyim; ihtiyacınız olan her şeyi memnuniyetle iletirim.\n\nZaman ayırdığınız için teşekkür ederim.`,
  },
  es: {
    subject: (c) => `Seguimiento — mi candidatura a ${c}`,
    body: (c, g) => `${g}\n\nEspero que se encuentre bien. Hace poco envié una candidatura a ${c} y quería hacer un seguimiento por si no se recibió. Sigo muy interesado en unirme a su equipo y estaré encantado de facilitar cualquier información adicional.\n\nGracias por su tiempo y consideración.`,
  },
  fr: {
    subject: (c) => `Relance — ma candidature chez ${c}`,
    body: (c, g) => `${g}\n\nJ'espère que vous allez bien. J'ai récemment envoyé une candidature à ${c} et je me permets de la relancer au cas où elle serait passée inaperçue. Je reste très intéressé à rejoindre votre équipe et serai ravi de fournir tout complément nécessaire.\n\nMerci de votre temps et de votre attention.`,
  },
  de: {
    subject: (c) => `Nachfrage — meine Bewerbung bei ${c}`,
    body: (c, g) => `${g}\n\nIch hoffe, es geht Ihnen gut. Kürzlich habe ich eine Bewerbung an ${c} gesendet und möchte nachfragen, falls sie untergegangen ist. Ich bin weiterhin sehr daran interessiert, Ihr Team zu verstärken, und stelle Ihnen gern weitere Unterlagen zur Verfügung.\n\nVielen Dank für Ihre Zeit.`,
  },
  it: {
    subject: (c) => `Sollecito — la mia candidatura presso ${c}`,
    body: (c, g) => `${g}\n\nSpero stiate bene. Di recente ho inviato una candidatura a ${c} e volevo ricontattarvi nel caso fosse sfuggita. Resto molto interessato a entrare nel vostro team e sarò lieto di fornire qualsiasi ulteriore informazione.\n\nGrazie per il tempo e l'attenzione.`,
  },
  pt: {
    subject: (c) => `Seguimento — a minha candidatura à ${c}`,
    body: (c, g) => `${g}\n\nEspero que esteja tudo bem. Enviei recentemente uma candidatura à ${c} e queria fazer um seguimento caso tenha passado despercebida. Continuo muito interessado em juntar-me à vossa equipa e terei todo o gosto em fornecer qualquer informação adicional.\n\nObrigado pelo seu tempo e consideração.`,
  },
};

export function buildFollowup(company: string, lang: AppLang = "en"): Draft {
  const f = F[lang] || F.en;
  const fu = FOLLOWUP[lang] || FOLLOWUP.en;
  const greeting = f.formalGreeting;
  return { subject: fu.subject(company), body: fu.body(company, greeting) };
}

const GENERIC_ROLE: Record<AppLang, string> = {
  en: "Open Application", tr: "Genel Başvuru", es: "Candidatura Espontánea",
  fr: "Candidature Spontanée", de: "Initiativbewerbung", it: "Candidatura Spontanea", pt: "Candidatura Espontânea",
};

function rolesForApplication(analysis: Analysis, profile: EngineProfile, lang: AppLang): string[] {
  if (analysis.positions.length) return analysis.positions;
  if (profile.targetRoles.length) return profile.targetRoles;
  return [GENERIC_ROLE[lang] || GENERIC_ROLE.en];
}

export function buildDraft(
  analysis: Analysis,
  profile: EngineProfile,
  lang: AppLang = "en",
  authorization?: { authorized: boolean; visaLabel?: string | null }
): Draft {
  const f = F[lang] || F.en;
  const roles = rolesForApplication(analysis, profile, lang);
  const roleStr = roles.join(" / ");
  const subject = f.subject(roleStr, analysis.company);
  const hash = nameHash(analysis.company);

  // Greeting — casual for informal venues, formal otherwise
  let greeting: string;
  if (isFormalOrg(analysis.orgType || "generic")) {
    greeting = f.formalGreeting;
  } else {
    greeting = casualGreeting(analysis.country.code, analysis.company, hash);
  }

  // Intro — rotate through variants so the fleet of applications reads differently
  const intro = f.intros[hash % f.intros.length](roleStr, analysis.company);

  // Role capability — EN only (derived from profession taxonomy match)
  let roleCap = "";
  if (lang === "en") {
    const profIds = classifyRoles(roles);
    roleCap = buildRoleCapEN(profIds);
  }

  const lines: string[] = [greeting, "", intro, ""];

  if (roleCap) {
    lines.push(roleCap, "");
  }

  if (authorization?.authorized) {
    lines.push(f.visaHeld(authorization.visaLabel || analysis.country.visa, analysis.country.name), "");
  } else if (profile.needsVisaSponsorship) {
    lines.push(f.visa(analysis.country.visa, analysis.country.name, profile.relocation), "");
  }

  if (profile.shortBio) lines.push(profile.shortBio.trim(), "");

  // Language line — natural integration for EN, bare list for others
  if (profile.languages.length) {
    if (lang === "en") {
      lines.push(buildLanguageLineEN(profile.languages, analysis.orgType || "generic"), "");
    } else {
      lines.push(f.languages(profile.languages.join(", ")), "");
    }
  }

  // Closing — rotate through variants
  const closing = f.closings[hash % f.closings.length](analysis.company);
  lines.push(closing);

  if (profile.includeSignature) {
    lines.push("", profile.fullName);
    if (profile.contactEmail) lines.push(profile.contactEmail);
  }

  return { subject, body: lines.join("\n") };
}

// ── Cover letter ───────────────────────────────────────────────────────────────
const COVER: Record<AppLang, { intro: (r: string, c: string) => string; closing: (c: string) => string }> = {
  en: {
    intro: (r, c) => `I am pleased to submit my application for the ${r} position(s) at ${c}. Please accept this letter and my attached CV as a formal expression of interest.`,
    closing: (c) => `I have attached my CV for your review and would welcome the opportunity to discuss my application further at your convenience. Thank you for considering my application to ${c}.`,
  },
  tr: {
    intro: (r, c) => `${c} bünyesindeki ${r} pozisyon(lar)ı için başvurumu sunmaktan memnuniyet duyarım. Bu mektubu ve ekteki CV'mi resmi bir ilgi beyanı olarak kabul etmenizi rica ederim.`,
    closing: (c) => `CV'mi incelemeniz için ekledim; uygun bir zamanda başvurumu detaylandırma fırsatı bulmaktan memnuniyet duyarım. ${c} başvurumu değerlendirdiğiniz için teşekkür ederim.`,
  },
  es: {
    intro: (r, c) => `Me complace presentar mi candidatura para el/los puesto(s) de ${r} en ${c}. Le ruego acepte esta carta y mi CV adjunto como una expresión formal de interés.`,
    closing: (c) => `He adjuntado mi CV para su revisión y estaría encantado de conversar sobre mi candidatura cuando le resulte conveniente. Gracias por considerar mi candidatura a ${c}.`,
  },
  fr: {
    intro: (r, c) => `C'est avec plaisir que je soumets ma candidature pour le(s) poste(s) de ${r} chez ${c}. Je vous prie d'accepter cette lettre et mon CV ci-joint comme une expression formelle d'intérêt.`,
    closing: (c) => `Vous trouverez mon CV ci-joint pour examen ; je serais ravi d'échanger davantage sur ma candidature à votre convenance. Je vous remercie d'examiner ma candidature chez ${c}.`,
  },
  de: {
    intro: (r, c) => `Gerne reiche ich hiermit meine Bewerbung für die Position(en) als ${r} bei ${c} ein. Bitte betrachten Sie dieses Schreiben und meinen beigefügten Lebenslauf als formellen Ausdruck meines Interesses.`,
    closing: (c) => `Meinen Lebenslauf habe ich zur Ansicht beigefügt und würde mich freuen, meine Bewerbung zu gegebener Zeit näher zu besprechen. Vielen Dank, dass Sie meine Bewerbung bei ${c} in Betracht ziehen.`,
  },
  it: {
    intro: (r, c) => `Sono lieto di presentare la mia candidatura per la/le posizione(i) di ${r} presso ${c}. Vi prego di accettare questa lettera e il mio CV allegato come formale espressione di interesse.`,
    closing: (c) => `Ho allegato il mio CV per la vostra valutazione e sarei lieto di discutere ulteriormente la mia candidatura quando vi fosse comodo. Vi ringrazio per aver considerato la mia candidatura presso ${c}.`,
  },
  pt: {
    intro: (r, c) => `Tenho o prazer de submeter a minha candidatura para a(s) vaga(s) de ${r} na ${c}. Peço que aceite esta carta e o meu CV em anexo como uma expressão formal de interesse.`,
    closing: (c) => `Anexei o meu CV para sua análise e teria todo o gosto em discutir a minha candidatura com mais detalhe quando lhe for conveniente. Obrigado por considerar a minha candidatura à ${c}.`,
  },
};

export function buildCoverLetter(
  analysis: Analysis,
  profile: EngineProfile,
  lang: AppLang = "en",
  authorization?: { authorized: boolean; visaLabel?: string | null }
): string {
  const f = F[lang] || F.en;
  const cv = COVER[lang] || COVER.en;
  const roles = rolesForApplication(analysis, profile, lang);
  const roleLine = roles.join(" / ");
  const hash = nameHash(analysis.company);

  let greeting: string;
  if (isFormalOrg(analysis.orgType || "generic")) {
    greeting = f.formalGreeting;
  } else {
    greeting = casualGreeting(analysis.country.code, analysis.company, hash);
  }

  const lines: string[] = [greeting, "", cv.intro(roleLine, analysis.company), ""];

  if (authorization?.authorized) {
    lines.push(f.visaHeld(authorization.visaLabel || analysis.country.visa, analysis.country.name), "");
  } else if (profile.needsVisaSponsorship) {
    lines.push(f.visa(analysis.country.visa, analysis.country.name, profile.relocation), "");
  }

  if (profile.shortBio) lines.push(profile.shortBio.trim(), "");

  if (profile.languages.length) {
    if (lang === "en") {
      lines.push(buildLanguageLineEN(profile.languages, analysis.orgType || "generic"), "");
    } else {
      lines.push(f.languages(profile.languages.join(", ")), "");
    }
  }

  lines.push(cv.closing(analysis.company));
  return lines.join("\n");
}
