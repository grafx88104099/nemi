"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus } from "lucide-react";

import { saveSearch } from "@/lib/actions/saved-searches";

/**
 * Хайлтаа хадгалах. Нэвтрээгүй бол /login руу; буцах зам нь `next`
 * (өгөөгүй бол дарсан мөчийн одоогийн зам + query — шүүлтүүр алдагдахгүй).
 */
export function SaveSearchButton({
  filters,
  label,
  next,
  className,
}: {
  filters: Record<string, string>;
  label: string;
  next?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const res = await saveSearch(filters, label);
      if (res.error === "auth") {
        const target = next ?? window.location.pathname + window.location.search;
        router.push(`/login?next=${encodeURIComponent(target)}`);
        return;
      }
      if (res.ok) setSaved(true);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || saved}
      className={`inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline disabled:opacity-60${className ? ` ${className}` : ""}`}
    >
      <BookmarkPlus className="size-4" /> {saved ? "Хадгалсан ✓" : "Хайлтаа хадгалах"}
    </button>
  );
}
