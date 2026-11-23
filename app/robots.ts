import type { MetadataRoute } from "next";

import { PRIVATE_PATHS } from "@/lib/seo/robots";
import { absUrl, siteUrl } from "@/lib/seo/site";

// Зөвхөн default export (хуваалцах тогтмолууд lib/seo/robots.ts-д).
export default function robots(): MetadataRoute.Robots {
  // Vercel preview/development deploy индекслэгдэхгүй.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: absUrl("/sitemap.xml"),
    host: siteUrl(),
  };
}
