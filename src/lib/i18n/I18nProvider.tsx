"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MESSAGES, type Lang, type MessageKey } from "./messages";

type Vars = Record<string, string | number>;
export type TFn = (key: MessageKey, vars?: Vars) => string;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // storage unavailable (private mode etc.) — fall through
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // The static HTML (what crawlers and link previews read) is rendered in English; the
  // visitor's saved or browser language is applied after mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only preference after hydration
    setLangState(detect());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = MESSAGES[lang].docTitle;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback<TFn>(
    (key, vars) => {
      let s = MESSAGES[lang][key];
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
