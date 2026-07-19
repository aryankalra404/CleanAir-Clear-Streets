import Navbar from "@/components/shared/Navbar";
import GoogleHotspotMap from "@/components/map/GoogleHotspotMap";

export default function MapPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container map-page-nav-container" style={{ zIndex: 100 }}>
        <Navbar />
      </div>
      <div className="app-page-container app-page-content map-page-content">
        <GoogleHotspotMap />
      </div>
    </main>
  );
}
