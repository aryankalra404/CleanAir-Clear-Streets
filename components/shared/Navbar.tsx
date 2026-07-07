"use client";

import Link from "next/link";
import { useT } from "@/lib/languageContext";

export default function Navbar() {
  const t = useT();

  const navItems = [
    { href: "/", label: t("nav_home") },
    { href: "/map", label: t("nav_map") },
  ];

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link href="/" className="brand-lockup" aria-label="CleanAir Command home">
        <span className="brand-mark">CA</span>
        <span>
          <span className="brand-kicker">{t("nav_brand_kicker")}</span>
          <span className="brand-name">{t("nav_brand_name")}</span>
        </span>
      </Link>

      <div className="nav-links" style={{ alignItems: "center" }}>
        {navItems.map((item) => (
          <Link
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/report" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', marginInlineStart: '8px' }}>
          {t("nav_report_button")}
        </Link>
      </div>
    </nav>
  );
}
