"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { toggleFavorite } from "@/lib/actions/favorites";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  listingId,
  initial = false,
  withLabel = false,
}: {
  listingId: string;
  initial?: boolean;
  withLabel?: boolean;
}) {
  const [fav, setFav] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const res = await toggleFavorite(listingId);
      if (res.error === "auth") {
        router.push("/login?next=" + encodeURIComponent(window.location.pathname));
        return;
      }
      setFav(res.favorited);
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-50",
        fav ? "border-rose-200 bg-rose-50 text-rose-600" : "border-line bg-surface text-ink hover:bg-surface-2"
      )}
      aria-pressed={fav}
    >
      <Heart className={cn("size-4", fav && "fill-current")} />
      {withLabel && (fav ? "Хадгалсан" : "Хадгалах")}
    </button>
  );
}
