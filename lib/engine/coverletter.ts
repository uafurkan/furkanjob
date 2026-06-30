import { Document, Packer, Paragraph, TextRun } from "docx";

type Lang = "en" | "tr" | "es" | "fr" | "de" | "it" | "pt";

const L10N: Record<Lang, { hiringTeam: string; sincerely: string; formatDate: (d: Date) => string }> = {
  en: {
    hiringTeam: "Hiring Team",
    sincerely: "Sincerely,",
    formatDate: (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  },
  tr: {
    hiringTeam: "İşe Alım Ekibi",
    sincerely: "Saygılarımla,",
    formatDate: (d) => d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }),
  },
  es: {
    hiringTeam: "Equipo de Selección",
    sincerely: "Atentamente,",
    formatDate: (d) => d.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }),
  },
  fr: {
    hiringTeam: "Équipe de Recrutement",
    sincerely: "Cordialement,",
    formatDate: (d) => d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }),
  },
  de: {
    hiringTeam: "Personalabteilung",
    sincerely: "Mit freundlichen Grüßen,",
    formatDate: (d) => d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }),
  },
  it: {
    hiringTeam: "Ufficio Selezione",
    sincerely: "Cordiali saluti,",
    formatDate: (d) => d.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }),
  },
  pt: {
    hiringTeam: "Equipe de Recrutamento",
    sincerely: "Atenciosamente,",
    formatDate: (d) => d.toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" }),
  },
};

function resolveLang(lang: string | undefined): Lang {
  return (lang && lang in L10N ? lang : "en") as Lang;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

export async function buildCoverLetterDocx(params: {
  applicantName: string;
  applicantEmail: string;
  company: string;
  body: string;
  language?: string;
}): Promise<Buffer> {
  const lang = resolveLang(params.language);
  const loc = L10N[lang];
  const date = loc.formatDate(new Date());

  const plain = stripMarkdown(params.body);
  const bodyParagraphs = plain.split(/\n+/).filter((s) => s.trim().length > 0);

  const sp = (size: number) => size * 2; // docx uses half-points
  const gap = () => new Paragraph({ children: [] });

  const doc = new Document({
    creator: "paply",
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: params.applicantName, bold: true, size: sp(13) })] }),
          new Paragraph({ children: [new TextRun({ text: params.applicantEmail, size: sp(11), color: "555555" })] }),
          gap(),
          new Paragraph({ children: [new TextRun({ text: date, size: sp(11), color: "555555" })] }),
          gap(),
          new Paragraph({ children: [new TextRun({ text: params.company, bold: true, size: sp(11) })] }),
          new Paragraph({ children: [new TextRun({ text: loc.hiringTeam, size: sp(11) })] }),
          gap(),
          ...bodyParagraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p, size: sp(11) })],
                spacing: { after: 160 },
              })
          ),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
