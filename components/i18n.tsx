"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { translate, normalizeLang, type Lang } from "@/lib/i18n";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string };
const LangCtx = createContext<Ctx | null>(null);

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(normalizeLang(initialLang));
  const setLang = (l: Lang) => {
    setLangState(l);
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
  };
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang]
  );
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT(): Ctx {
  const c = useContext(LangCtx);
  if (!c) return { lang: "en", setLang: () => {}, t: (k) => translate("en", k) };
  return c;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      className={`btn btn-sm btn-ghost ${className}`}
      aria-label="Language"
      onClick={() => setLang(lang === "en" ? "tr" : "en")}
      title={lang === "en" ? "Türkçe'ye geç" : "Switch to English"}
    >
      {lang === "en" ? "EN" : "TR"}
    </button>
  );
}
