import type { MetadataRoute } from "next";

/**
 * PWA manifest (R4): агентын CRM-ийг утсанд апп хэлбэрээр суулгана.
 * Нүүр дэлгэцээс нээхэд «Өнөөдөр» дэлгэц.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/agent/crm",
    name: "Nemi CRM",
    short_name: "Nemi CRM",
    description: "Үл хөдлөхийн агентын CRM — өнөөдрийн ажил, сэжим, мэдэгдэл.",
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
      { name: "Өнөөдөр", url: "/agent/crm", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Шинэ сэжим", url: "/agent/crm/leads?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ажлын жагсаалт", url: "/agent/crm/worklists", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
