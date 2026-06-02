"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus } from "lucide-react";

import { saveSearch } from "@/lib/actions/saved-searches";

export function SaveSearchButton({
  filters,
  label,
}: {
  filters: Record<string, string>;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const res = await saveSearch(filters, label);
      if (res.error === "auth") {
        router.push("/login?next=/listings");
        return;
      }
      if (res.ok) setSaved(true);
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending || saved}
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline disabled:opacity-60"
    >
      <BookmarkPlus className="size-4" /> {saved ? "Хадгалсан ✓" : "Хайлтаа хадгалах"}
    </button>
  );
}
