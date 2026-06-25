"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";

type Status = "queued" | "analyzing" | "drafted" | "sending" | "sent" | "failed" | "skipped";

type Item = {
  id: number;
  input: string;
  status: Status;
  company?: string;
  country?: string;
  emailSource?: string;
  to: string;
  subject: string;
  body: string;
  language?: string;
  positions?: string[];
  overLimit?: boolean;
  error?: string;
  expanded?: boolean;
};

const MAX_ITEMS = 20;

// Split the textarea into items: separated by a line of dashes, or — if there are none —
// one URL per line, otherwise the whole text is a single item.
function parseItems(raw: string): string[] {
  const byDash = raw.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (byDash.length > 1) return byDash.slice(0, MAX_ITEMS);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const allUrls = lines.length > 1 && lines.every((l) => /^(https?:\/\/|www\.)\S+$/i.test(l));
  if (allUrls) return lines.slice(0, MAX_ITEMS);
  const single = raw.trim();
  return single ? [single] : [];
}

export default function BulkApply() {
  const { t } = useT();
  const [raw, setRaw] = useState("");
  const [auto, setAuto] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  function update(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function analyzeItem(it: Item): Promise<Item> {
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: it.input, language }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "error");
      return {
        ...it,
        status: d.emailSource === "none" ? "skipped" : "drafted",
        company: d.company, country: d.country, emailSource: d.emailSource,
        to: (d.emails || []).join(", "), subject: d.subject, body: d.body,
        language: d.language, positions: d.positions, overLimit: d.overLimit,
        error: d.emailSource === "none" ? t("bulk.noEmail") : undefined,
      };
    } catch (e: any) {
      return { ...it, status: "failed", error: e.message };
    }
  }

  async function sendItem(it: Item): Promise<Item> {
    if (!it.to.trim()) return { ...it, status: "skipped", error: t("bulk.noEmail") };
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: it.to, subject: it.subject, body: it.body,
          company: it.company, country: it.country, positions: it.positions,
          emailSource: it.emailSource, draftSource: "template", language: it.language,
        }),
      });
      const d = await r.json();
      if (r.status === 402) return { ...it, status: "failed", error: t("new.limitReached") };
      if (!r.ok) throw new Error(d.error || "error");
      return { ...it, status: "sent", error: undefined };
    } catch (e: any) {
      return { ...it, status: "failed", error: e.message };
    }
  }

  async function run() {
    const parsed = parseItems(raw);
    if (!parsed.length) return;
    const queued: Item[] = parsed.map((input, i) => ({ id: i, input, status: "queued", to: "", subject: "", body: "" }));
    setItems(queued);
    setRunning(true);
    stopRef.current = false;
    for (const base of queued) {
      if (stopRef.current) {
        update(base.id, { status: "skipped", error: t("bulk.stopped") });
        continue;
      }
      update(base.id, { status: "analyzing" });
      let it = await analyzeItem(base);
      setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
      if (!stopRef.current && auto && it.status === "drafted" && !it.overLimit && it.to.trim()) {
        update(it.id, { status: "sending" });
        it = await sendItem(it);
        setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)));
      }
    }
    setRunning(false);
    stopRef.current = false;
  }

  function stop() {
    stopRef.current = true;
  }

  async function sendOne(id: number) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    update(id, { status: "sending" });
    const res = await sendItem(it);
    setItems((prev) => prev.map((x) => (x.id === id ? res : x)));
  }

  const statusClass: Record<Status, string> = {
    queued: "", analyzing: "", drafted: "chip-accent", sending: "",
    sent: "chip-ok", failed: "chip-warn", skipped: "chip-warn",
  };
  const counts = {
    total: items.length,
    sent: items.filter((i) => i.status === "sent").length,
    done: items.filter((i) => ["sent", "failed", "skipped"].includes(i.status)).length,
  };

  return (
    <div className="stack gap-6">
      <header className="page-head">
        <div className="row gap-3" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>{t("bulk.title")}</h1>
            <p className="text-secondary">{t("bulk.sub")}</p>
          </div>
          <Link href="/app/new" className="btn btn-sm btn-ghost">{t("bulk.single")} →</Link>
        </div>
      </header>

      <section className="glass card stack gap-4">
        <label className="field">
          <span className="field-label">{t("bulk.input")}</span>
          <textarea className="textarea" style={{ minHeight: 180 }} placeholder={t("bulk.placeholder")} value={raw} onChange={(e) => setRaw(e.target.value)} disabled={running} />
          <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{t("bulk.hint")}</span>
        </label>

        <div className="row gap-6 wrap">
          <div className="stack gap-2">
            <span className="field-label">{t("new.mode")}</span>
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={!auto} className={`seg${!auto ? " active" : ""}`} onClick={() => setAuto(false)} disabled={running}>{t("new.semi")}</button>
              <button role="tab" aria-selected={auto} className={`seg${auto ? " active" : ""}`} onClick={() => setAuto(true)} disabled={running}>{t("new.full")}</button>
            </div>
          </div>
        </div>
        <span className="text-secondary" style={{ fontSize: "var(--text-12)" }}>{auto ? t("bulk.autoNote") : t("bulk.semiNote")}</span>

        <div className="row gap-3 wrap">
          <button className="btn btn-primary" data-loading={running} onClick={run} disabled={running || !raw.trim()}>
            {running ? `${counts.done}/${counts.total}` : t("bulk.run")}
          </button>
          {running && (
            <button className="btn btn-danger btn-sm" onClick={stop}>{t("bulk.stop")}</button>
          )}
          {!running && items.length > 0 && (
            <span className="chip chip-ok">{t("bulk.sentCount").replace("{n}", String(counts.sent))}</span>
          )}
        </div>
      </section>

      {items.length > 0 && (
        <div className="stack gap-3">
          {items.map((it) => (
            <div key={it.id} className="glass card stack gap-2">
              <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                <b>{it.company || `#${it.id + 1}`}</b>
                {it.country && <span className="chip">{it.country}</span>}
                <span className={`chip ${statusClass[it.status]}`}>{t(`bulk.status.${it.status}`)}</span>
                {(it.status === "drafted" || it.status === "skipped") && (
                  <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => update(it.id, { expanded: !it.expanded })}>
                    {it.expanded ? t("bulk.collapse") : t("bulk.review")}
                  </button>
                )}
              </div>
              {!it.expanded && it.subject && <span className="text-secondary" style={{ fontSize: "var(--text-13)" }}>{it.subject}</span>}
              {it.error && <span className="chip-warn" style={{ fontSize: "var(--text-12)" }}>{it.error}</span>}

              {it.expanded && (
                <div className="stack gap-3">
                  <label className="field">
                    <span className="field-label">{t("new.to")}</span>
                    <input className="input" value={it.to} onChange={(e) => update(it.id, { to: e.target.value })} placeholder="name@business.com" />
                  </label>
                  <label className="field">
                    <span className="field-label">{t("new.subject")}</span>
                    <input className="input" value={it.subject} onChange={(e) => update(it.id, { subject: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">{t("new.body")}</span>
                    <textarea className="textarea" style={{ minHeight: 160 }} value={it.body} onChange={(e) => update(it.id, { body: e.target.value })} />
                  </label>
                  <div className="row gap-3">
                    <button className="btn btn-primary btn-sm" data-loading={it.status === "sending"} onClick={() => sendOne(it.id)} disabled={it.status === "sending" || it.overLimit || !it.to.trim()}>
                      {t("new.send")}
                    </button>
                    {it.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
                  </div>
                </div>
              )}

              {!it.expanded && it.status === "drafted" && (
                <div className="row gap-3">
                  <button className="btn btn-primary btn-sm" data-loading={false} onClick={() => sendOne(it.id)} disabled={it.overLimit || !it.to.trim()}>
                    {t("new.send")}
                  </button>
                  {it.overLimit && <Link href="/app/billing" className="btn btn-sm">{t("new.limitPro")}</Link>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
