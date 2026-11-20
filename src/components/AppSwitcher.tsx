"use client";

import { useEffect, useState } from "react";

const apps = [
  ["Events", "events"], ["Polls", "polls"], ["Giveaways", "giveaways"],
  ["Scholarships", "scholarships"], ["Discounts", "discounts"], ["Ecosystem", "ecosystem"],
] as const;

export function AppSwitcher() {
  const [active, setActive] = useState<string>("events");
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id.replace("app-", ""));
    }, { rootMargin: "-150px 0px -55% 0px", threshold: 0 });
    for (const [, id] of apps) {
      const section = document.getElementById(`app-${id}`);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  return <nav className="app-switcher" aria-label="Explore UniPass apps"><div className="app-switcher-scroll">{apps.map(([label, id]) => <a key={id} href={`#app-${id}`} className={active === id ? "active" : ""} aria-current={active === id ? "location" : undefined} onClick={() => setActive(id)}>{label}</a>)}</div></nav>;
}
