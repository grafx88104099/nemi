"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { maybeShowGuestSavedToast, useFavorite } from "@/components/listings/favorites-store";
import { cn } from "@/lib/utils";

/**
 * Зарын хуудасны «Хадгалах». Картын зүрхтэй нэг store (favorites-store) хуваалцана.
 * Нэвтрээгүй бол /login руу шилжүүлэхгүй — энэ төхөөрөмж дээр хадгална.
 */
export function FavoriteButton({
  listingId,
  initial = false,
  withLabel = false,
}: {
  listingId: string;
  initial?: boolean;
  withLabel?: boolean;
}) {
  const { saved, ready, pending, toggle } = useFavorite(listingId);
  const router = useRouter();
  const fav = ready ? saved : initial;

  async function onClick() {
    const r = await toggle();
    if (r.guest && r.saved) maybeShowGuestSavedToast(router);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-50",
        fav ? "border-rose-200 bg-rose-50 text-rose-600" : "border-line bg-surface text-ink hover:bg-surface-2"
      )}
      aria-pressed={fav}
      aria-label={withLabel ? undefined : fav ? "Хадгалснаас хасах" : "Хадгалах"}
    >
      <Heart className={cn("size-4", fav && "fill-current")} />
      {withLabel && (fav ? "Хадгалсан" : "Хадгалах")}
    </button>
  );
}
