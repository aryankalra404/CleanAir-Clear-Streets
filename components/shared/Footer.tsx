"use client";

import Link from "next/link";
import { useT } from "@/lib/languageContext";
import Image from "next/image";

export default function Footer() {
  const t = useT();

  return (
    <footer className="gov-footer">
      <div className="footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" className="brand-lockup" aria-label="SwachhVayu home" style={{ marginBottom: '16px' }}>
              <Image src="/logo.png" alt="SwachhVayu Logo" width={40} height={40} className="brand-mark" style={{ objectFit: 'contain', background: 'transparent', boxShadow: 'none' }} />
              <span className="brand-name" style={{ fontSize: '1.2rem', display: 'flex', color: 'white' }}>
                <span style={{ fontWeight: 500 }}>{t("nav_brand_kicker")}</span>
                <span style={{ fontWeight: 850 }}>{t("nav_brand_name")}</span>
              </span>
            </Link>
            <h2>{t("jury_snapshot_title")}</h2>
            <p className="gov-affiliation">
              An official initiative by the Ministry of Environment, Forest and Climate Change.
            </p>
          </div>
          
          <div className="footer-links">
            <div className="footer-nav-column">
              <h3>Resources</h3>
              <Link href="/map">Live Map</Link>
              <Link href="/report">Report Hotspot</Link>
              <Link href="/dashboard">Command Center</Link>
            </div>
            <div className="footer-nav-column">
              <h3>Policies</h3>
              <Link href="#">Privacy Policy</Link>
              <Link href="#">Terms of Service</Link>
              <Link href="#">Accessibility</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} SwachhVayu Initiative. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
