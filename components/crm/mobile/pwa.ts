"use client";

/**
 * PWA клиентийн туслахууд (R4): service worker бүртгэл, push захиалга,
 * төхөөрөмжийн төрөл. iOS дээр push зөвхөн нүүр дэлгэцэд суулгасан
 * (standalone) апп-д ажиллана (iOS 16.4+).
 */

export const SW_URL = "/sw.js";

export function swSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export function pushSupported(): boolean {
  return swSupported() && "PushManager" in window && "Notification" in window;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!swSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  } catch (e) {
    console.error("service worker:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerSw());
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}
