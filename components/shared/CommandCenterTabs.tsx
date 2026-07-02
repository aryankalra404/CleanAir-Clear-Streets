import Link from "next/link";

type CommandCenterTabsProps = {
  active: "incidents" | "forecast";
};

const tabs = [
  {
    href: "/dashboard",
    id: "incidents",
    label: "Live incidents",
    description: "Detect, verify, and dispatch",
  },
  {
    href: "/forecast",
    id: "forecast",
    label: "24-hour forecast",
    description: "Predict spikes and stage teams",
  },
] as const;

export default function CommandCenterTabs({ active }: CommandCenterTabsProps) {
  return (
    <div className="command-tabs" aria-label="Command Center views">
      {tabs.map((tab) => (
        <Link
          aria-current={active === tab.id ? "page" : undefined}
          className={active === tab.id ? "command-tab active" : "command-tab"}
          href={tab.href}
          key={tab.id}
        >
          <span>{tab.label}</span>
          <small>{tab.description}</small>
        </Link>
      ))}
    </div>
  );
}
