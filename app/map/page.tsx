import Navbar from "@/components/shared/Navbar";
import GoogleHotspotMap from "@/components/map/GoogleHotspotMap";

export default function MapPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <GoogleHotspotMap />
      </div>
    </main>
  );
}
