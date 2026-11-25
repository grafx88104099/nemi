"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * <Link>-ийн хүүхэд: товшсоны дараа дараагийн хуудас ачаалж байх хооронд картыг бүдгэрүүлнэ (утсанд
 * «юу ч болсонгүй» гэж дахин дарахаас сэргийлнэ). Зарын/агентын дэлгэрэнгүйд loading.tsx ЗОРИУД алга
 * (404/500 статус хадгалах) тул хариуг энд өгнө. Байнга зурагдана, зөвхөн opacity солигдоно — layout
 * shift үүсгэхгүй. Эцэг нь `relative` байх ёстой.
 */
export function LinkPendingOverlay({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-surface/50 opacity-0 motion-safe:transition-opacity",
        pending && "opacity-100 motion-safe:animate-pulse",
        className
      )}
    />
  );
}
