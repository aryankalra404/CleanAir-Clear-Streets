"use client";

import Link from "next/link";
import { techStack } from "@/components/landing/landingData";
import { useT } from "@/lib/languageContext";

const routeCards = [
  {
    href: "/map",
    access: "Public",
    tone: "public",
    title: "Live hotspot map",
    text: "Read-only visibility into verified smoke, dust, and fire zones.",
  },
  {
    href: "/dashboard",
    access: "Officials",
    tone: "officials",
    title: "Command Center",
    text: "Verify hotspots, prioritize severity, and dispatch response teams.",
  },
  {
    href: "/forecast",
    access: "Command Center",
    tone: "planning",
    title: "Forecast planning",
    text: "Predict PM spikes and convert them into preemptive alerts.",
  },
];

export default function JurySnapshot() {
  const t = useT();

  return (
    <section className="snapshot-section">
      <div className="snapshot-container">
        <div>
          <p className="eyebrow">{t("jury_snapshot_eyebrow")}</p>
          <h2>{t("jury_snapshot_title")}</h2>
          <div className="tech-stack">
            {techStack.map((tech) => (
              <span key={tech}>{tech}</span>
            ))}
          </div>
        </div>

        <div className="route-cards">
          {routeCards.map((card) => (
            <Link href={card.href} className="route-card" key={card.href}>
              <span className={`route-access ${card.tone}`}>{card.access}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
