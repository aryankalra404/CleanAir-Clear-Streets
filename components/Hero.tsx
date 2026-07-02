import HeroSection from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import JurySnapshot from "@/components/landing/JurySnapshot";
import Navbar from "@/components/landing/Navbar";

export default function Hero() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-grid-bg" />
        <div className="landing-container">
          <Navbar />
          <HeroSection />
        </div>
      </section>
      <HowItWorks />
      <JurySnapshot />
    </main>
  );
}
