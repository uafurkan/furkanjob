import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { getLang } from "@/lib/i18n-server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "paply";
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: { default: `${APP} — AI job application agent for visa-sponsored jobs abroad`, template: `%s · ${APP}` },
  description:
    "Paste any hotel, restaurant or business page. paply finds the real contact email, writes a tailored visa-sponsorship job application (NZ AEWV, AU, UK, US, CA, EU), and sends it with your CV from your own inbox.",
  keywords: [
    "visa sponsorship jobs",
    "hospitality jobs abroad",
    "work visa job application",
    "AI job application",
    "cover letter generator",
    "hotel jobs with visa sponsorship",
    "restaurant jobs abroad",
    "AEWV jobs New Zealand",
    "skilled worker visa jobs UK",
    "job application email",
  ],
  applicationName: APP,
  manifest: "/manifest.webmanifest",
  authors: [{ name: "Veor", url: BASE }],
  creator: "Veor",
  publisher: "Veor",
  referrer: "origin-when-cross-origin",
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/icons/paply-square-512.png", sizes: "512x512", type: "image/png" }],
  },
  openGraph: {
    title: `${APP} — paste a page, send the application`,
    description:
      "The agent finds the email, writes a tailored visa-sponsorship application, and sends it with your CV — from your own inbox.",
    url: BASE,
    siteName: APP,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP} — paste a page, send the application`,
    description:
      "AI agent for visa-sponsored job applications: finds the email, writes the application, sends it with your CV.",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport: Viewport = {
  // Single, media-less theme-color: updated iOS Chrome (and Safari/Android) tint the
  // top/bottom browser bars to this. Media-scoped tags are ignored by iOS Chrome, so we
  // use one plain value (our void background is the same in light & dark anyway).
  themeColor: "#0A0C10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang();
  return (
    <html lang={lang}>
      <body>
        <div className="app-backdrop" aria-hidden />
        <div className="app-aurora" aria-hidden />
        <div className="app-grain" aria-hidden />
        <Providers initialLang={lang}>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
