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
  title: { default: `${APP} — paste a page, send the application`, template: `%s · ${APP}` },
  description:
    "Paste any hotel or restaurant page. The agent finds the email, writes a tailored visa-sponsorship application, and sends it with your CV from your connected inbox.",
  applicationName: APP,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/icons/paply-mono-120.png", sizes: "120x120", type: "image/png" }],
  },
  openGraph: { title: APP, description: "Paste a page, send the application.", url: BASE, siteName: APP, type: "website" },
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
