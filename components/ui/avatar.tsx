"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Аватар — зурагтай (src) бол фото, эс бөгөөс үсгэн товчлол. Зураг ачаалагдаагүй бол
 * (хуучирсан Google холбоос, устсан файл) үсгэн товчлол руу шилжинэ — Topbar хоосон үлдэхгүй.
 */
export function Avatar({
  initials,
  src,
  color = "#C2410C",
  size = "md",
  alt,
  className,
}: {
  initials: string;
  src?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg";
  /** Зургийн alt (анхдагч — товчлол). Нэр нь хажууд эсвэл товчны нэрэнд байвал "". */
  alt?: string;
  className?: string;
}) {
  // src солигдвол дахин оролдоно (бүтэлгүйтсэн холбоосыг л санана).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const dims = {
    sm: "size-7 text-[10px]",
    md: "size-10 text-xs",
    lg: "size-14 text-base",
  }[size];

  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? initials}
        // Google-ийн профайл зураг referrer-тэй хүсэлтэд 403 буцаах тохиолдол бий.
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        // SSR-ээр ирээд hydration-оос өмнө ачаалал нь бүтэлгүйтсэн зураг (onError дахин дуудагдахгүй).
        ref={(img) => {
          if (img && img.complete && img.naturalWidth === 0) setFailedSrc(src);
        }}
        className={cn("rounded-full object-cover", dims, className)}
        style={{ background: color }}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid place-items-center rounded-full font-bold text-white",
        dims,
        className
      )}
      style={{ background: color }}
    >
      {initials}
    </div>
  );
}
