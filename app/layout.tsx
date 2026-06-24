import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { getLang } from "@/lib/i18n-server";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "paply";
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: { default: `${APP} — paste a page, send the application`, template: `%s · ${APP}` },
  description:
    "Paste any hotel or restaurant page. The agent finds the email, writes a tailored visa-sponsorship application, and sends it with your CV from your connected inbox.",
  applicationName: APP,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: { title: APP, description: "Paste a page, send the application.", url: BASE, siteName: APP, type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0A0C10",
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
        <div className="app-grain" aria-hidden />
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
