// Domain entities (mirror prisma/schema.prisma, kept as the production migration target).

export type Plan = "free" | "pro" | "team";

export type User = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  plan: Plan;
  stripeCustomerId?: string | null;
  createdAt: string;
};

export type EmailAccount = {
  id: string;
  userId: string;
  provider: "google" | "smtp";
  address: string;
  accessToken?: string | null; // encrypted at rest
  refreshToken?: string | null; // encrypted at rest
  expiresAt?: number | null;
  scope?: string | null;
  status: "connected" | "needs_reauth" | "error";
  isDefault: boolean;
  createdAt: string;
};

export type Profile = {
  id: string;
  userId: string;
  fullName: string;
  contactEmail?: string | null;
  phone?: string | null;
  languages: string[];
  targetRoles: string[];
  needsVisaSponsorship: boolean;
  targetCountries: string[];
  shortBio?: string | null;
  availability?: string | null;
  relocation: boolean;
  tone: string;
  includeSignature: boolean;
  applicationLanguage: string; // "auto" | en | tr | es | fr | de | it | pt
  defaultCvId?: string | null;
  // Held-visa intelligence
  hasVisa: boolean;
  visaType?: string | null;       // a VISA_TYPES id (eu_work | schengen | es_work | … | custom)
  visaLabel?: string | null;      // human label, e.g. "Spain work and residence permit"
  visaCountries: string[];        // ISO alpha-2 codes the visa authorizes work in
  completedAt?: string | null;
  updatedAt: string;
};

export type Document = {
  id: string;
  userId: string;
  type: "visa" | "certificate" | "diploma" | "experience" | "other";
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
};

export type Cv = {
  id: string;
  userId: string;
  filename: string;
  storageKey: string;
  mime: string;
  size: number;
  isDefault: boolean;
  createdAt: string;
};

export type Application = {
  id: string;
  userId: string;
  company?: string | null;
  country?: string | null;
  positions: string[];
  recipients: string[];
  emailSource: "text" | "page-scrape" | "web-search" | "manual" | "none";
  draftSource: "template" | "ai";
  subject: string;
  body: string;
  status: "draft" | "sent" | "failed";
  providerMsgId?: string | null;
  error?: string | null;
  createdAt: string;
  sentAt?: string | null;
};

export type Usage = {
  id: string;
  userId: string;
  period: string; // YYYY-MM
  applicationsSent: number;
};

export type Subscription = {
  id: string;
  userId: string;
  stripeSubId?: string | null;
  plan: Plan;
  status: string;
  currentPeriodEnd?: string | null;
};

export type DBShape = {
  users: User[];
  emailAccounts: EmailAccount[];
  profiles: Profile[];
  cvs: Cv[];
  applications: Application[];
  usage: Usage[];
  subscriptions: Subscription[];
};
