"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { currentPath, isAuthPath, loginHref } from "@/lib/nav";

/**
 * Topbar-ын «Нэвтрэх»: дарах мөчид одоогийн зам + query-г `?next=`-д хийнэ —
 * нэвтэрсний дараа яг тэр шүүлтүүртэй хуудас руу буцна. SSR href нь «/login»
 * хэвээр тул hydration зөрөхгүй, useSearchParams/Suspense хэрэггүй.
 */
export function LoginLink({
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof ButtonLink>, "href">) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Шинэ таб/цонх (cmd/ctrl/shift/alt, дунд товч) — хөтчийн жам ёсоор.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const p = currentPath();
    if (!isAuthPath(p) && p !== "/") {
      e.preventDefault();
      router.push(loginHref(p));
    }
  }

  return <ButtonLink href="/login" {...props} onClick={handleClick} />;
}
