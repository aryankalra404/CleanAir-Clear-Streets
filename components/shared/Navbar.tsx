import Link from "next/link";

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/map", label: "Map" },
  ];

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

      <div className="nav-links" style={{ alignItems: "center" }}>
        {navItems.map((item) => (
          <Link
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/report" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', marginLeft: '8px' }}>
          Report a Hotspot
        </Link>
      </div>
    </nav>
  );
}
