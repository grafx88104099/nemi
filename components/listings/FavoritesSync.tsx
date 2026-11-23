"use client";

import { useEffect } from "react";

import { refreshFavorites } from "@/components/listings/favorites-store";

/**
 * (site) layout-д нэг удаа. Mount бүрт хадгалсан зарын төлөвийг ачаална —
 * (auth) бүлгээс (нууц үг/утсаар нэвтэрсний дараа), OAuth /auth/callback болон
 * /auth/confirm-оос буцаж ирэхэд зочны хадгалсныг бүртгэлд нэгтгэнэ.
 */
export function FavoritesSync() {
  useEffect(() => {
    void refreshFavorites();
  }, []);
  return null;
}
