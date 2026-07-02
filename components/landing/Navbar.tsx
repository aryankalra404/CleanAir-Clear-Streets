import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link href="/" className="brand-lockup" aria-label="CleanAir Command home">
        <span className="brand-mark">CA</span>
        <span>
          <span className="brand-kicker">CleanAir</span>
          <span className="brand-name">Command</span>
        </span>
      </Link>

      <div className="nav-links">
        <Link href="/map">Live map</Link>
        <Link href="/forecast">Forecast</Link>
        <Link href="/dashboard" className="nav-officials">
          Officials
        </Link>
      </div>
    </nav>
  );
}
