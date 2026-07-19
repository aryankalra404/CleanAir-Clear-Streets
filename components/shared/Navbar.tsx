"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/languageContext";
import LanguageSelector from "@/components/shared/LanguageSelector";

export default function Navbar() {
  const t = useT();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);
  const hasOpenedMenuRef = useRef(false);

  const navItems = [
    { href: "/", label: t("nav_home") },
    { href: "/map", label: t("nav_map") },
  ];

  useEffect(() => {
    if (!isMenuOpen) {
      if (hasOpenedMenuRef.current) {
        menuButtonRef.current?.focus();
      }
      return;
    }

    hasOpenedMenuRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstMenuLinkRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const nav = menuButtonRef.current?.closest("nav");
      const focusableElements = Array.from(
        nav?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
      ).filter((element) => element.offsetParent !== null);
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable?.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 820) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isMenuOpen]);

  return (
    <>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/" className="brand-lockup" aria-label="SwachhVayu home" onClick={() => setIsMenuOpen(false)}>
          <Image src="/logo.png" alt="" width={40} height={40} className="brand-mark" style={{ objectFit: "contain", background: "transparent", boxShadow: "none" }} />
          <span className="brand-name" style={{ fontSize: "1.2rem", display: "flex" }}>
            <span style={{ fontWeight: 500 }}>{t("nav_brand_kicker")}</span>
            <span style={{ fontWeight: 850 }}>{t("nav_brand_name")}</span>
          </span>
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className={`hamburger-btn ${isMenuOpen ? "is-open" : ""}`}
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-primary-navigation"
        >
          <span className="hamburger-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div id="mobile-primary-navigation" className={`nav-links ${isMenuOpen ? "open" : ""}`}>
          {navItems.map((item, index) => (
            <Link
              ref={index === 0 ? firstMenuLinkRef : undefined}
              href={item.href}
              key={item.href}
              onClick={() => setIsMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/report" className="btn btn-primary" onClick={() => setIsMenuOpen(false)} style={{ padding: "8px 16px", fontSize: "0.85rem", marginInlineStart: "8px" }}>
            {t("nav_report_button")}
          </Link>
          <div className="nav-language">
            <span className="nav-language-label">Language</span>
            <LanguageSelector onSelect={() => setIsMenuOpen(false)} />
          </div>
        </div>
      </nav>
      {isMenuOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
}
