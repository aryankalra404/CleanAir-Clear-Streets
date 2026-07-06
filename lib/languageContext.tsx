"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

async function loadEN(): Promise<Record<string, string>> {
  const mod = await import("../locales/en.json");
  return mod.default as Record<string, string>;
}

async function fetchTranslations(target: string, values: string[]): Promise<string[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: values, target }),
  });
  if (!res.ok) throw new Error("Translation API failed");
  const data = await res.json() as { translations: string[] };
  return data.translations;
}

function storageKey(lang: string) { return `translations_${lang}`; }

interface LanguageContextValue {
  locale: string;
  setLocale: (lang: string) => void;
  t: (key: string) => string;
  loading: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
  loading: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState("en");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const enRef = useRef<Record<string, string>>({});

  // Load English base on mount
  useEffect(() => {
    loadEN().then((en) => {
      enRef.current = en;
      // Restore persisted language
      const saved = typeof window !== "undefined" ? localStorage.getItem("preferred_locale") || "en" : "en";
      if (saved !== "en") {
        setLocaleState(saved);
        loadLocale(saved, en);
      } else {
        setTranslations(en);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLocale = useCallback(async (lang: string, en: Record<string, string>) => {
    if (lang === "en") {
      setTranslations(en);
      return;
    }
    const cached = localStorage.getItem(storageKey(lang));
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Object.keys(parsed).length === Object.keys(en).length) {
          setTranslations(parsed);
          return;
        }
      } catch {}
    }
    // Fetch from Google Translate
    setLoading(true);
    try {
      const keys = Object.keys(en);
      const values = Object.values(en);
      const translated = await fetchTranslations(lang, values);
      const map: Record<string, string> = {};
      keys.forEach((k, i) => { map[k] = translated[i] ?? values[i]; });
      localStorage.setItem(storageKey(lang), JSON.stringify(map));
      setTranslations(map);
    } catch {
      // Fallback to English on error
      setTranslations(en);
    } finally {
      setLoading(false);
    }
  }, []);

  const setLocale = useCallback((lang: string) => {
    setLocaleState(lang);
    localStorage.setItem("preferred_locale", lang);
    // Update dir for RTL languages
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
    loadLocale(lang, enRef.current);
  }, [loadLocale]);

  const t = useCallback((key: string): string => {
    return translations[key] ?? enRef.current[key] ?? key;
  }, [translations]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Shorthand hook — drop-in for useTranslations() return value
export function useT() {
  const { t } = useContext(LanguageContext);
  return t;
}
