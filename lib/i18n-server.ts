import { cookies } from "next/headers";
import { normalizeLang, translate, type Lang } from "./i18n";

export function getLang(): Lang {
  return normalizeLang(cookies().get("lang")?.value);
}

// Server-side translator bound to the current request's language.
export function getT() {
  const lang = getLang();
  return { lang, t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
