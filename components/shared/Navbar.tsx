"use client";

import Link from "next/link";
import Image from "next/image";
import { useT } from "@/lib/languageContext";

export default function Navbar() {
  const t = useT();

  const navItems = [
    { href: "/", label: t("nav_home") },
    { href: "/map", label: t("nav_map") },
  ];

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link href="/" className="brand-lockup" aria-label="SwachhVayu home">
        <Image src="/logo.png" alt="SwachhVayu Logo" width={40} height={40} className="brand-mark" style={{ objectFit: 'contain', background: 'transparent', boxShadow: 'none' }} />
        <span className="brand-name" style={{ fontSize: '1.2rem', display: 'flex' }}>
          <span style={{ fontWeight: 500 }}>{t("nav_brand_kicker")}</span>
          <span style={{ fontWeight: 850 }}>{t("nav_brand_name")}</span>
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
