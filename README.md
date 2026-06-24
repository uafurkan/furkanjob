# applythatforme

Paste any hotel/restaurant page → the agent finds the business email (or searches the web), writes a
tailored, multilingual visa-sponsorship application, and sends it with your CV **from your own connected
inbox**. A global, multi-tenant SaaS with an iOS 26/27 *liquid glass* interface.

## Highlights

- **Smart engine** — extracts the recipient email **only from the source** (never invented); if missing,
  scrapes the site's contact page + web search. Detects country → correct visa language (NZ AEWV, AU TSS,
  US H-2B, CA LMIA, UK Skilled Worker), positions, and company.
- **Multilingual drafts** — application written in EN/TR/ES/FR/DE/IT/PT. "Auto" detects the business's
  language from the pasted text/country. Claude AI for Pro; a grammatically-correct template otherwise.
- **Your inbox, your control** — Google OAuth with **send-only** scope (`gmail.send`, never read). Tokens
  encrypted at rest. SMTP App Password fallback for dev.
- **Semi-auto / full-auto** — semi-auto (default) shows the draft + recipient for approval; full-auto sends
  immediately when an email is found.
- **Billing** — Stripe Checkout (Apple Pay & Google Pay supported automatically), billing portal, webhook
  sync. Free (monthly limit, template) vs Pro (unlimited + AI). Card data never touches our servers.
- **Liquid glass UI** — one real-refraction signature lens (hero); performant static glass everywhere else;
  iOS-style mobile tab bar; PWA installable; English primary, Turkish toggle.

## Run

```bash
npm install
cp .env.example .env   # fill what you need (all optional keys have safe dev fallbacks)
npm run dev            # http://localhost:3000
```

Out of the box (no keys): demo sign-in, smart-template drafts, JSON storage. Add keys to unlock:
- `GOOGLE_CLIENT_ID/SECRET` → "Connect Gmail" + send from the user's inbox (keep OAuth app in *Testing*
  mode until the domain is live and Google verifies the `gmail.send` scope).
- `ANTHROPIC_API_KEY` → Claude-generated, per-business drafts (Pro).
- `STRIPE_SECRET_KEY` + `STRIPE_PRICE_PRO` + `STRIPE_WEBHOOK_SECRET` → live billing with wallets.

## Architecture

- **Next.js 14 (App Router) + TypeScript**, token-based liquid-glass CSS (`styles/*`).
- **Engine** (`lib/engine/*`): `detect` (emails/urls/country/positions/company/text-language),
  `websearch` (real-email finder), `template` (multilingual), `ai` (Claude), `pipeline`, `mailer`
  (Gmail API + SMTP). Rules in `lib/engine/rules.ts`.
- **Data** (`lib/db.ts`): file-backed JSON repository with a clean interface. Production target is
  Prisma/Postgres — the schema lives at `prisma/schema.prisma`.
- **Auth** (`lib/auth.ts`): NextAuth (Google + demo), encrypted token storage (`lib/crypto.ts`).
- **i18n** (`lib/i18n.ts`, `components/i18n.tsx`): EN default, TR toggle.

## Notes for going live (applythatforme.com)

- Set `NEXT_PUBLIC_BASE_URL` + Google OAuth redirect URI to the domain; submit the `gmail.send` scope for
  Google verification; register the domain in Stripe for Apple Pay.
- Swap the JSON repository for Prisma/Postgres and object storage (S3/R2) for CVs.
