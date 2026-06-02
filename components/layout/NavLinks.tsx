"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { RentMenu } from "@/components/layout/RentMenu";

const nav: [string, string][] = [
  ["/listings?deal=sale", "Худалдах"],
  // Түрээс — RentMenu dropdown (доор)
  ["/my-home", "Зарах"],
  ["/agents", "Агентууд"],
  ["/home-loans", "Зээл"],
  ["/ai", "AI"],
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      <NavItem href="/listings?deal=sale" label="Худалдах" active={pathname === "/listings"} />
      <RentMenu />
      {nav.slice(1).map(([href, label]) => (
        <NavItem key={href} href={href} label={label} active={pathname.startsWith(href.split("?")[0])} />
      ))}
    </nav>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-surface-2",
        active ? "text-brand-600" : "text-ink"
      )}
    >
      {label}
    </Link>
  );
}
