"use client";

import { useEffect } from "react";

import { markSavedSearchSeen } from "@/lib/actions/saved-searches";

/**
 * /listings?ss=<id> — хадгалсан хайлтыг mount-ын дараа «үзсэн» болгоно
 * (GET render, prefetch-д DB бичихгүй). Юу ч зурахгүй.
 */
export function SavedSearchSeen({ id }: { id: string }) {
  useEffect(() => {
    markSavedSearchSeen(id).catch(() => {});
  }, [id]);
  return null;
}
