import HeroSection from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import Navbar from "@/components/shared/Navbar";

export default function Hero() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-grid-bg" />
        <div className="landing-container" style={{ zIndex: 100 }}>
          <Navbar />
          <HeroSection />
        </div>
      </section>
      <HowItWorks />
    </main>
  );
}
