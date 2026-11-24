import type { MetadataRoute } from "next";

/**
 * Web Share Target (Android Chrome, суулгасан PWA): зарын бичвэр/зургийг Nemi CRM руу
 * хуваалцахад public/sw.js POST-ыг барьж IndexedDB-д битүүмжлээд шуурхай бүртгэл рүү
 * чиглүүлнэ. SW удирдаагүй бол share/route.ts «?share=nosw» руу буцаана.
 * Next-ийн төрөлд files нь DOM File гэж буруу бичигдсэн тул хувиргаж өгнө.
 */
type ShareTarget = {
  action: string;
  method: "POST";
  enctype: "multipart/form-data";
  params: { title: string; text: string; url: string; files: { name: string; accept: string[] }[] };
};

const SHARE_TARGET: ShareTarget = {
  action: "/agent/crm/staff/share",
  method: "POST",
  enctype: "multipart/form-data",
  params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: ["image/*"] }] },
};

/**
 * PWA manifest: агентын CRM-ийг утсанд апп хэлбэрээр суулгана. id/start_url
 * хэвээр (суулгасан апп нэг апп хэвээр); нээхэд Staff жагсаалт руу чиглэнэ.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/agent/crm",
    name: "Nemi CRM",
    short_name: "Nemi CRM",
    description: "Үл хөдлөхийн агентын CRM — Staff хөрөнгө, харилцагч, хэлцэл, мэдэгдэл.",
    lang: "mn",
    start_url: "/agent/crm",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#f97316",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Шинэ хөрөнгө", url: "/agent/crm/staff/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Харилцагчид", url: "/agent/crm/contacts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Staff", url: "/agent/crm/staff", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    share_target: SHARE_TARGET as unknown as NonNullable<MetadataRoute.Manifest["share_target"]>,
  };
}
