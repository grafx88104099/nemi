"use client";

import { useEffect } from "react";

const DEDUPE_MS = 30 * 60_000;

/**
 * R10: зар үзсэнийг нэргүйгээр тоолох beacon (/api/listing-view). DNT/GPC үед
 * хүсэлт огт илгээхгүй (серверийн optedOut-тай ижил). Нэг таб 30 минутад нэг удаа.
 */
export function ListingViewBeacon({ listingId }: { listingId: string }) {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;

    const key = `nemi_lv_${listingId}`;
    try {
      const last = Number(sessionStorage.getItem(key) ?? "0");
      if (last && Date.now() - last < DEDUPE_MS) return;
    } catch {
      // sessionStorage хаалттай — серверийн давхардал шалгалт хангалттай
    }

    fetch("/api/listing-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
    try {
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // үл тоомсорлоно
    }
  }, [listingId]);

  return null;
}
