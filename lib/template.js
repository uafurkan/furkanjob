// Legacy single-user draft builder — kept for backward compatibility only.
// The multi-tenant engine uses lib/engine/template.ts instead.

const APPLICANT = {
  name: "Applicant",
  email: "",
  languages: "English",
};

function buildSubject({ company, positions }) {
  const role = positions.join(" / ");
  return `${role} Application — ${company}`;
}

function buildBody({ company, positions, country }) {
  const role = positions.join(" and ");
  const visa = country.visa;
  return `Dear Hiring Manager,

I am writing to express my strong interest in ${role} position(s) at ${company}. I am an enthusiastic and reliable candidate with a genuine passion for hospitality, and I would be glad to contribute to your team.

I would like to be transparent from the outset: I require ${visa} to work in ${country.name}, and I am applying specifically for roles where the employer is able to provide it. I am fully committed, available to relocate, and ready to start as soon as the necessary process is completed.

Please find my CV attached. I would welcome the opportunity to discuss how I can support ${company}, and I thank you for your time and consideration.`;
}

function buildDraft(analysis) {
  return {
    subject: buildSubject(analysis),
    body: buildBody(analysis),
  };
}

module.exports = { buildDraft, APPLICANT };
