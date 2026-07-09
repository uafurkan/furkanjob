/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // @sparticuz/chromium's Chromium binary is loaded from disk at runtime via a path Next's
    // file tracer can't follow statically — without this, the .br binary is silently left out
    // of the Vercel function bundle and the PDF-OCR export 404s/crashes in production only.
    outputFileTracingIncludes: {
      "/api/applications/export/pdf-ocr": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
