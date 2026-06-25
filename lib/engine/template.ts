// Profile-parametric smart template, now multilingual. Free fallback when AI isn't used.
// Enforces the hard rules: no signature block by default, explicit sponsorship statement, plain subject.
import type { Analysis } from "./detect";
import type { Draft, EngineProfile } from "./types";

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

// Map detected country → most likely correspondence language (for "auto").
export function autoLangForCountry(code: string): AppLang {
  switch (code) {
    case "ES": return "es";
    case "FR": return "fr";
    case "DE": case "AT": return "de";
    case "IT": return "it";
    case "PT": case "BR": return "pt";
    default: return "en"; // NZ/AU/US/CA/UK, multilingual (CH), and unknown
  }
}

export function resolveAppLang(value: string | undefined, countryCode: string): AppLang {
  if (!value || value === "auto") return autoLangForCountry(countryCode);
  return (APP_LANGS.find((l) => l.code === value)?.code) || "en";
}

type Frag = {
  subject: (roles: string, company: string) => string;
  greeting: string;
  intro: (role: string, company: string) => string;
  visa: (visa: string, country: string, reloc: boolean) => string;
  visaHeld: (label: string, country: string) => string;
  languages: (langs: string) => string;
  closing: (company: string) => string;
};

const F: Record<AppLang, Frag> = {
  en: {
    subject: (r, c) => `${r} Application — ${c}`,
    greeting: "Dear Hiring Manager,",
    intro: (r, c) => `I am writing to express my strong interest in ${r} position(s) at ${c}. I am an enthusiastic and reliable candidate with a genuine passion for hospitality, and I would be glad to contribute to your team.`,
    visa: (v, c, reloc) => `I would like to be transparent from the outset: I require ${v} to work in ${c}, and I am applying specifically for roles where the employer is able to provide it.${reloc ? " I am available to relocate and" : " I am"} ready to start as soon as the necessary process is completed.`,
    visaHeld: (label, c) => `I already hold a valid ${label} that authorizes me to work in ${c}, so no sponsorship is required — I am legally able to start immediately, with no visa cost or paperwork for you.`,
    languages: (l) => `Languages: ${l}.`,
    closing: (c) => `Please find my CV attached. I would welcome the opportunity to discuss how I can support ${c}, and I thank you for your time and consideration.`,
  },
  tr: {
    subject: (r, c) => `${r} Başvurusu — ${c}`,
    greeting: "Sayın Yetkili,",
    intro: (r, c) => `${c} bünyesindeki ${r} pozisyon(lar)ına olan güçlü ilgimi belirtmek isterim. Konaklama sektörüne içten bir tutkuyla bağlı, güvenilir ve istekli bir adayım; ekibinize katkı sunmaktan memnuniyet duyarım.`,
    visa: (v, c, reloc) => `Baştan şeffaf olmak isterim: ${c} ülkesinde çalışabilmek için ${v} gerekiyor ve özellikle işverenin bunu sağlayabildiği rollere başvuruyorum.${reloc ? " Taşınmaya açığım ve" : ""} gerekli süreç tamamlanır tamamlanmaz başlamaya hazırım.`,
    visaHeld: (label, c) => `Hâlihazırda ${c} ülkesinde çalışmama izin veren geçerli bir ${label} sahibiyim; bu nedenle sponsorluğa gerek yok — yasal olarak hemen başlayabilirim, sizin için herhangi bir vize masrafı veya işlemi olmadan.`,
    languages: (l) => `Diller: ${l}.`,
    closing: (c) => `CV'mi ekte bulabilirsiniz. ${c} ekibine nasıl katkı sağlayabileceğimi görüşme fırsatından memnuniyet duyarım; zaman ayırdığınız için teşekkür ederim.`,
  },
  es: {
    subject: (r, c) => `Solicitud de ${r} — ${c}`,
    greeting: "Estimado/a responsable de selección:",
    intro: (r, c) => `Le escribo para expresar mi gran interés en el/los puesto(s) de ${r} en ${c}. Soy un candidato entusiasta y fiable, con verdadera pasión por la hostelería, y me encantaría contribuir a su equipo.`,
    visa: (v, c, reloc) => `Quiero ser transparente desde el principio: necesito ${v} para trabajar en ${c}, y me postulo específicamente a puestos en los que el empleador pueda proporcionarlo.${reloc ? " Estoy disponible para reubicarme y" : " Estoy"} listo para empezar en cuanto se complete el proceso necesario.`,
    visaHeld: (label, c) => `Ya dispongo de un/a ${label} válido/a que me autoriza a trabajar en ${c}, por lo que no se requiere ningún patrocinio: puedo incorporarme de inmediato y de forma legal, sin coste ni trámites de visado para usted.`,
    languages: (l) => `Idiomas: ${l}.`,
    closing: (c) => `Adjunto mi CV. Estaría encantado de conversar sobre cómo puedo aportar a ${c}, y le agradezco su tiempo y consideración.`,
  },
  fr: {
    subject: (r, c) => `Candidature ${r} — ${c}`,
    greeting: "Madame, Monsieur,",
    intro: (r, c) => `Je me permets de vous adresser ma candidature pour le(s) poste(s) de ${r} au sein de ${c}. Candidat enthousiaste et fiable, passionné par l'hôtellerie, je serais ravi de contribuer à votre équipe.`,
    visa: (v, c, reloc) => `Je souhaite être transparent dès le départ : j'ai besoin de ${v} pour travailler en ${c}, et je postule spécifiquement aux postes pour lesquels l'employeur peut le fournir.${reloc ? " Je suis disponible pour déménager et" : " Je suis"} prêt à commencer dès que les démarches nécessaires seront terminées.`,
    visaHeld: (label, c) => `Je dispose déjà d'un(e) ${label} en cours de validité m'autorisant à travailler en ${c} ; aucun parrainage n'est donc nécessaire — je peux commencer immédiatement et en toute légalité, sans frais ni démarches de visa pour vous.`,
    languages: (l) => `Langues : ${l}.`,
    closing: (c) => `Vous trouverez mon CV en pièce jointe. Je serais ravi d'échanger sur ma contribution possible à ${c}, et je vous remercie de votre temps et de votre attention.`,
  },
  de: {
    subject: (r, c) => `Bewerbung ${r} — ${c}`,
    greeting: "Sehr geehrte Damen und Herren,",
    intro: (r, c) => `hiermit bewerbe ich mich mit großem Interesse für die Position(en) als ${r} bei ${c}. Als engagierter und zuverlässiger Kandidat mit echter Leidenschaft für die Gastronomie und Hotellerie würde ich Ihr Team gern unterstützen.`,
    visa: (v, c, reloc) => `Ich möchte von Anfang an transparent sein: Für eine Tätigkeit in ${c} benötige ich ${v} und bewerbe mich gezielt auf Stellen, bei denen der Arbeitgeber dies ermöglichen kann.${reloc ? " Ich bin umzugsbereit und" : " Ich bin"} bereit, sofort nach Abschluss der erforderlichen Schritte zu beginnen.`,
    visaHeld: (label, c) => `Ich verfüge bereits über eine/n gültige/n ${label}, die/der mich zur Arbeit in ${c} berechtigt; eine Sponsorschaft ist daher nicht erforderlich — ich kann sofort und rechtlich einwandfrei beginnen, ohne Visakosten oder Aufwand für Sie.`,
    languages: (l) => `Sprachen: ${l}.`,
    closing: (c) => `Meinen Lebenslauf finden Sie im Anhang. Über ein Gespräch, wie ich ${c} unterstützen kann, würde ich mich sehr freuen, und ich danke Ihnen für Ihre Zeit.`,
  },
  it: {
    subject: (r, c) => `Candidatura ${r} — ${c}`,
    greeting: "Gentile Responsabile delle Risorse Umane,",
    intro: (r, c) => `Le scrivo per esprimere il mio vivo interesse per la/le posizione(i) di ${r} presso ${c}. Sono un candidato entusiasta e affidabile, con una genuina passione per l'ospitalità, e sarei lieto di contribuire al vostro team.`,
    visa: (v, c, reloc) => `Desidero essere trasparente fin dall'inizio: per lavorare in ${c} ho bisogno di ${v} e mi candido specificamente per ruoli in cui il datore di lavoro può fornirlo.${reloc ? " Sono disponibile a trasferirmi e" : " Sono"} pronto a iniziare non appena completato l'iter necessario.`,
    visaHeld: (label, c) => `Possiedo già un/una ${label} valido/a che mi autorizza a lavorare in ${c}, quindi non è necessaria alcuna sponsorizzazione: posso iniziare subito e in modo del tutto legale, senza costi o pratiche di visto per voi.`,
    languages: (l) => `Lingue: ${l}.`,
    closing: (c) => `In allegato trova il mio CV. Sarei lieto di discutere come posso contribuire a ${c} e La ringrazio per il tempo e l'attenzione.`,
  },
  pt: {
    subject: (r, c) => `Candidatura ${r} — ${c}`,
    greeting: "Prezado(a) Responsável de Recrutamento,",
    intro: (r, c) => `Escrevo para expressar o meu grande interesse na(s) vaga(s) de ${r} na ${c}. Sou um candidato entusiasta e confiável, com verdadeira paixão pela hotelaria, e teria muito gosto em contribuir para a sua equipa.`,
    visa: (v, c, reloc) => `Quero ser transparente desde o início: preciso de ${v} para trabalhar em ${c} e candidato-me especificamente a funções em que o empregador o possa providenciar.${reloc ? " Estou disponível para me mudar e" : " Estou"} pronto para começar assim que o processo necessário estiver concluído.`,
    visaHeld: (label, c) => `Já possuo um(a) ${label} válido(a) que me autoriza a trabalhar em ${c}, pelo que não é necessário qualquer patrocínio — posso começar de imediato e de forma totalmente legal, sem custos ou burocracia de visto para si.`,
    languages: (l) => `Idiomas: ${l}.`,
    closing: (c) => `Em anexo segue o meu CV. Teria todo o gosto em conversar sobre como posso contribuir para ${c} e agradeço o seu tempo e consideração.`,
  },
};

// Short, polite follow-up for an application that hasn't had a reply.
const FOLLOWUP: Record<AppLang, { subject: (c: string) => string; body: (c: string, greeting: string) => string }> = {
  en: {
    subject: (c) => `Following up — my application to ${c}`,
    body: (c, g) => `${g}\n\nI hope you're well. I recently sent an application to ${c} and wanted to follow up in case it was missed. I remain very interested in joining your team and would be glad to provide anything else you need.\n\nThank you for your time and consideration.`,
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
    body: (c, g) => `${g}\n\nich hoffe, es geht Ihnen gut. Kürzlich habe ich eine Bewerbung an ${c} gesendet und möchte nachfragen, falls sie untergegangen ist. Ich bin weiterhin sehr daran interessiert, Ihr Team zu verstärken, und stelle Ihnen gern weitere Unterlagen zur Verfügung.\n\nVielen Dank für Ihre Zeit.`,
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
  return { subject: fu.subject(company), body: fu.body(company, f.greeting) };
}

function rolesForApplication(analysis: Analysis, profile: EngineProfile): string[] {
  if (analysis.positions.length) return analysis.positions;
  if (profile.targetRoles.length) return profile.targetRoles;
  return ["Hospitality"];
}

export function buildDraft(
  analysis: Analysis,
  profile: EngineProfile,
  lang: AppLang = "en",
  authorization?: { authorized: boolean; visaLabel?: string | null }
): Draft {
  const f = F[lang] || F.en;
  const roles = rolesForApplication(analysis, profile);
  const subject = f.subject(roles.join(" / "), analysis.company);

  const lines: string[] = [f.greeting, "", f.intro(roles.join(" / "), analysis.company), ""];
  if (authorization?.authorized) {
    lines.push(f.visaHeld(authorization.visaLabel || analysis.country.visa, analysis.country.name), "");
  } else if (profile.needsVisaSponsorship) {
    lines.push(f.visa(analysis.country.visa, analysis.country.name, profile.relocation), "");
  }
  if (profile.shortBio) lines.push(profile.shortBio.trim(), "");
  if (profile.languages.length) lines.push(f.languages(profile.languages.join(", ")), "");
  lines.push(f.closing(analysis.company));

  if (profile.includeSignature) {
    lines.push("", profile.fullName);
    if (profile.contactEmail) lines.push(profile.contactEmail);
  }

  return { subject, body: lines.join("\n") };
}
