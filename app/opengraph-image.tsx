import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "paply — paste a page, send the application";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background:
            "radial-gradient(900px 600px at 78% 18%, rgba(111,168,255,0.30), transparent 60%), linear-gradient(160deg, #0A0C10 0%, #12151C 100%)",
          color: "#F4F7FB",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 36 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: "radial-gradient(circle at 32% 30%, #fff, #8FB7FF 45%, #5A93F0 85%)",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>paply</div>
        </div>
        <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 920 }}>
          Paste a page. Application sent.
        </div>
        <div style={{ fontSize: 34, color: "#AEB7C4", marginTop: 30, maxWidth: 860 }}>
          The agent finds the email, writes a tailored visa-sponsorship application, and sends it with your CV — from your own inbox.
        </div>
      </div>
    ),
    { ...size }
  );
}
