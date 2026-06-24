// Profile-parametric smart template (free fallback when no AI key / not Pro).
// Enforces CLAUDE.md rules: no signature block, explicit sponsorship statement, plain subject.
import type { Analysis } from "./detect";
import type { Draft, EngineProfile } from "./types";

function rolesForApplication(analysis: Analysis, profile: EngineProfile): string[] {
  // Prefer roles detected on the page; fall back to the applicant's target roles.
  if (analysis.positions.length) return analysis.positions;
  if (profile.targetRoles.length) return profile.targetRoles;
  return ["Hospitality"];
}

export function buildSubject(analysis: Analysis, profile: EngineProfile): string {
  const role = rolesForApplication(analysis, profile).join(" / ");
  return `${role} Application — ${analysis.company}`;
}

export function buildBody(analysis: Analysis, profile: EngineProfile): string {
  const roles = rolesForApplication(analysis, profile);
  const role = roles.join(" and ");
  const company = analysis.company;
  const langs = profile.languages.join(", ");

  const lines: string[] = [];
  lines.push("Dear Hiring Manager,");
  lines.push("");
  lines.push(
    `I am writing to express my strong interest in ${role} position(s) at ${company}. ` +
      `I am an enthusiastic and reliable candidate with a genuine passion for hospitality, ` +
      `and I would be glad to contribute to your team.`
  );
  lines.push("");

  if (profile.needsVisaSponsorship) {
    const visa = analysis.country.visa;
    const reloc = profile.relocation ? " I am available to relocate and" : " I am";
    lines.push(
      `I would like to be transparent from the outset: I require ${visa} to work in ${analysis.country.name}, ` +
        `and I am applying specifically for roles where the employer is able to provide it.${reloc} ` +
        `ready to start as soon as the necessary process is completed.`
    );
    lines.push("");
  }

  if (profile.shortBio) {
    lines.push(profile.shortBio.trim());
    lines.push("");
  }

  if (langs) {
    lines.push(`Languages: ${langs}.`);
    lines.push("");
  }

  lines.push(
    `Please find my CV attached. I would welcome the opportunity to discuss how I can support ${company}, ` +
      `and I thank you for your time and consideration.`
  );

  // NO signature block (Gmail signature is added automatically) unless the profile opts in.
  if (profile.includeSignature) {
    lines.push("");
    lines.push(profile.fullName);
    if (profile.contactEmail) lines.push(profile.contactEmail);
  }

  return lines.join("\n");
}

export function buildDraft(analysis: Analysis, profile: EngineProfile): Draft {
  return { subject: buildSubject(analysis, profile), body: buildBody(analysis, profile) };
}
