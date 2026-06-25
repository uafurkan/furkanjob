import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";

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
  date: string;
}): Promise<Buffer> {
  const plain = stripMarkdown(params.body);
  const bodyParagraphs = plain.split(/\n+/).filter((s) => s.trim().length > 0);

  const sp = (size: number) => size * 2; // docx uses half-points
  const gap = () => new Paragraph({ children: [] });

  const doc = new Document({
    creator: "paply",
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: params.applicantName, bold: true, size: sp(13) })],
          }),
          new Paragraph({
            children: [new TextRun({ text: params.applicantEmail, size: sp(11), color: "555555" })],
          }),
          gap(),
          new Paragraph({
            children: [new TextRun({ text: params.date, size: sp(11), color: "555555" })],
          }),
          gap(),
          new Paragraph({
            children: [new TextRun({ text: params.company, bold: true, size: sp(11) })],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Hiring Team", size: sp(11) })],
          }),
          gap(),
          ...bodyParagraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p, size: sp(11) })],
                spacing: { after: 160 },
              })
          ),
          gap(),
          new Paragraph({
            children: [new TextRun({ text: "Sincerely,", size: sp(11) })],
          }),
          new Paragraph({
            children: [new TextRun({ text: params.applicantName, size: sp(11) })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
