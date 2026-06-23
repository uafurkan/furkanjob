// Akıllı başvuru taslağı: ülke + pozisyon + şirkete göre subject ve body üretir.

const APPLICANT = {
  name: "Furkan Hülako",
  email: "furkanhulakojob@gmail.com",
  phone: "", // istersen doldur
  languages: "Turkish (native), English (B2), Spanish (A2)",
};

function buildSubject({ company, positions, country }) {
  const role = positions.join(" / ");
  return `${role} Application (Visa Sponsorship) — ${company}`;
}

function buildBody({ company, positions, country }) {
  const role = positions.join(" and ");
  const visa = country.visa;
  return `Dear Hiring Manager,

I am writing to apply for ${role} position(s) at ${company}. I am an enthusiastic and reliable candidate with a strong interest in hospitality, and I would be glad to contribute to your team.

I would like to be transparent from the outset: I currently require ${visa} to work in ${country.name}, and I am applying specifically for roles where the employer is able to provide it. I am fully committed, available to relocate, and ready to start as soon as the necessary process is completed.

Languages: ${APPLICANT.languages}.

Please find my CV attached. I would welcome the opportunity to discuss how I can support ${company}. Thank you for your time and consideration.

Kind regards,
${APPLICANT.name}
${APPLICANT.email}${APPLICANT.phone ? "\n" + APPLICANT.phone : ""}`;
}

function buildDraft(analysis) {
  return {
    subject: buildSubject(analysis),
    body: buildBody(analysis),
  };
}

module.exports = { buildDraft, APPLICANT };
