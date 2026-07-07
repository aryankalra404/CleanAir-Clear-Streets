import HeroSection from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import Footer from "@/components/shared/Footer";
import Navbar from "@/components/shared/Navbar";

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
      <Footer />
    </main>
  );
}
