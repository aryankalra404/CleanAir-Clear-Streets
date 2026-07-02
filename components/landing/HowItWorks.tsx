import Link from "next/link";
import { workflowSteps } from "@/components/landing/landingData";

export default function HowItWorks() {
  return (
    <section className="workflow-section">
      <div className="section-container">
        <div className="section-heading">
          <div>
            <p>Response loop</p>
            <h2>From street report to field deployment in one workflow.</h2>
          </div>
          <Link href="/report" className="btn btn-outline">
            Start citizen report
          </Link>
        </div>

        <div className="workflow-grid">
          {workflowSteps.map((item) => (
            <article className="workflow-card" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
