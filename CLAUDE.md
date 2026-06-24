# paply — Product Rules (global, not tied to any individual)

This is a multi-tenant SaaS. Nothing in the product is hardcoded to a specific person; every applicant
fills in their own profile during onboarding and signs in with their own email.

## Email extraction (hard rule)
- Recipient email addresses are **only ever extracted** from the provided source text. They are **never
  generated or guessed** under any circumstance (`info@domain` style guessing is forbidden).
- If the pasted text has no email, the agent may search the web for the business's **real, published**
  address (page/contact scrape + search). That is still extraction, not fabrication.

## Draft rules
- **Subject**: plain text, no `SUBJECT:` prefix.
- **Body**: markdown; warm, professional.
- **No signature block / no "Sincerely"** by default (the sender's mail client adds a signature). A user
  may opt in via their profile (`includeSignature`).
- When the user's profile indicates they need a work visa, the draft **states the sponsorship requirement
  explicitly**, adapted to the detected country (NZ AEWV, AU TSS, US H‑2B, CA LMIA, UK Skilled Worker).
- Languages, target roles, and target countries come from the **user's profile**, not from any default.

## Sending & trust
- Sending uses the **user's own connected inbox** (Google OAuth, scope `gmail.send` only — send, never
  read). SMTP App Password is a fallback.
- Default mode is **semi-auto**: show the draft + recipient, user confirms, then send. Full-auto is opt-in.
- The user's CV (uploaded by them) is attached to every application.
- Security/privacy first: minimal scope, encrypted tokens, clear consent, easy disconnect. No dark
  patterns, no fake urgency — never a "scammy" feel.
