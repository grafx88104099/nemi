"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { maybeShowGuestSavedToast, useFavorite } from "@/components/listings/favorites-store";
import { cn } from "@/lib/utils";

/**
 * Зарын карт дээрх зүрх. Картын <Link>-ийн ДОТОР биш, хажууд нь (sibling) байрлана —
 * <a> дотор <button> үүрлэхгүй. Байрлалыг className-аар өгнө.
 */
export function CardSaveButton({
  listingId,
  title,
  className,
}: {
  listingId: string;
  title: string;
  className?: string;
}) {
  const { saved, pending, toggle } = useFavorite(listingId);
  const router = useRouter();

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const r = await toggle();
    if (r.guest && r.saved) maybeShowGuestSavedToast(router);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={`${saved ? "Хадгалснаас хасах" : "Хадгалах"}: ${title}`}
      disabled={pending}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60 after:absolute after:-inset-1",
        className
      )}
    >
      <Heart className={saved ? "size-5 fill-current text-rose-600" : "size-5"} aria-hidden />
    </button>
  );
}
