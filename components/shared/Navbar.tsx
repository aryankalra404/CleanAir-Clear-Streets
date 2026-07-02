import Link from "next/link";

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/report", label: "Report" },
    { href: "/map", label: "Map" },
    { href: "/forecast", label: "Forecast" },
    { href: "/dashboard", label: "Officials", featured: true },
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

      <div className="nav-links">
        {navItems.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className={item.featured ? "nav-officials" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
