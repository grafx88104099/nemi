"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Search, Building2, Home, Calculator, Calendar, Heart, Bell } from "lucide-react";

import { cn } from "@/lib/utils";

const searchLinks = [
  { href: "/listings?deal=rent&type=Орон+сууц", icon: Building2, label: "Орон сууц түрээс" },
  { href: "/listings?deal=rent&type=Хаус", icon: Home, label: "Хаус түрээс" },
  { href: "/listings?deal=rent", icon: Search, label: "Бүх түрээсийн зар" },
];

const toolLinks = [
  { href: "/rent/afford", icon: Calculator, label: "Хэдийг чадахаа тооцоол" },
  { href: "/tours", icon: Calendar, label: "Миний үзлэгүүд" },
  { href: "/favorites", icon: Heart, label: "Хадгалсан зар" },
  { href: "/saved-searches", icon: Bell, label: "Хайлтын сэрэмжлүүлэг" },
];

export function RentMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
      >
        Түрээс
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 w-[34rem] overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-lg">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">Түрээс хайх</h4>
              <div className="space-y-0.5">
                {searchLinks.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink hover:bg-surface-2">
                    <l.icon className="size-4 text-brand-600" /> {l.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">Түрээслэгчийн хэрэгсэл</h4>
              <div className="space-y-0.5">
                {toolLinks.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink hover:bg-surface-2">
                    <l.icon className="size-4 text-brand-600" /> {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
