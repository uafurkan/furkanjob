import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://paply.me";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/app/", "/admin/", "/api/", "/onboarding"] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
