import Link from "next/link";
import { techStack } from "@/components/landing/landingData";

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
  return (
    <section className="snapshot-section">
      <div className="snapshot-container">
        <div>
          <p className="eyebrow">Jury snapshot</p>
          <h2>Built for citizens to report and officials to act.</h2>
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
