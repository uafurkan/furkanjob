// Deterministic draft quality scorer — no AI needed.
// Checks the draft against known best-practice rules and returns a 0-100 score.

export type QualityCheck = {
  id: string;
  label: string;
  pass: boolean;
  weight: number;
};

export type DraftQualityResult = {
  score: number;          // 0-100
  label: "great" | "good" | "fair" | "weak";
  checks: QualityCheck[];
};

export function scoreDraftQuality(opts: {
  body: string;
  subject: string;
  company: string;
  positions: string[];
  needsVisa: boolean;
}): DraftQualityResult {
  const { body, subject, company, positions, needsVisa } = opts;
  const fullText = `${subject}\n${body}`.toLowerCase();

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  const checks: QualityCheck[] = [
    {
      id: "company",
      label: "Company name mentioned",
      pass: !company || fullText.includes(company.toLowerCase()),
      weight: 20,
    },
    {
      id: "role",
      label: "Target role mentioned",
      pass: positions.length === 0 || positions.some((p) => fullText.includes(p.toLowerCase())),
      weight: 20,
    },
    {
      id: "length",
      label: "Good length (120–400 words)",
      pass: wordCount >= 120 && wordCount <= 400,
      weight: 25,
    },
    {
      id: "opener",
      label: "No generic opener",
      pass: !/^\s*I am writing to (apply|express|enquire|inform)/i.test(body.trim()),
      weight: 15,
    },
    {
      id: "visa",
      label: "Visa/sponsorship mentioned",
      pass: !needsVisa || /visa|sponsor|work rights|authorization|authorisation|permit|aewv|tss|h-2b|lmia|skilled worker/i.test(fullText),
      weight: 20,
    },
  ];

  const score = checks.reduce((acc, c) => acc + (c.pass ? c.weight : 0), 0);

  const label: DraftQualityResult["label"] =
    score >= 90 ? "great" :
    score >= 70 ? "good" :
    score >= 45 ? "fair" : "weak";

  return { score, label, checks };
}
