"use client";

import { useEffect } from "react";

import { registerSw } from "@/components/crm/mobile/pwa";

/** Service worker бүртгэл (push мэдэгдэл, нүүр дэлгэцэд суулгах) — юу ч зурахгүй. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerSw();
  }, []);
  return null;
}
