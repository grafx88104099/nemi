import type { NextConfig } from "next";

import { CRM_REDIRECTS } from "./lib/crm-redirects";

const nextConfig: NextConfig = {
  images: {
    // Зарын зургийн эх сурвалжууд (seed: unsplash, агент upload: Supabase storage)
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  // Хуучин CRM-ийн устгасан хуудас → шинэ CRM (lib/crm-redirects.ts).
  async redirects() {
    return CRM_REDIRECTS;
  },
  // CRM PWA: service worker-ийг кэшлэхгүй (шинэ хувилбар шууд үйлчилнэ), зөвхөн өөрийн домэйны скрипт.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
