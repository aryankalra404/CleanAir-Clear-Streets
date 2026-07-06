"use client";

import { useLanguage } from "@/lib/languageContext";

const LANGUAGES = [
  { code: "en", name: "EN" },
  { code: "hi", name: "हिन्दी" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "kn", name: "ಕನ್ನಡ" },
  { code: "ml", name: "മലയാളം" },
  { code: "mr", name: "मराठी" },
  { code: "bn", name: "বাংলা" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "ur", name: "اردو" },
  { code: "or", name: "ଓଡ଼ିଆ" },
  { code: "as", name: "অসমীয়া" },
];

export default function LanguageSelector() {
  const { locale, setLocale, loading } = useLanguage();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
      <label htmlFor="language-selector" style={{ fontSize: "0.8rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
        LANG //
      </label>
      <div className="bracket-wrapper" style={{ position: "relative", display: "inline-block" }}>
        <div style={{ position: "absolute", insetBlockStart: -2, insetInlineStart: -2, width: 6, height: 6, borderBlockStart: "1px solid var(--muted)", borderInlineStart: "1px solid var(--muted)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", insetBlockEnd: -2, insetInlineEnd: -2, width: 6, height: 6, borderBlockEnd: "1px solid var(--muted)", borderInlineEnd: "1px solid var(--muted)", pointerEvents: "none" }} />
        <select
          id="language-selector"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          style={{
            background: "#050607",
            color: "var(--foreground)",
            border: "1px solid transparent",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.8rem",
            padding: "4px 8px",
            outline: "none",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
