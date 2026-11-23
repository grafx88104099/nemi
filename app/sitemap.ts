import type { MetadataRoute } from "next";

import { NEWS } from "@/lib/news";
import { getSitemapRows } from "@/lib/queries-seo";
import { absUrl } from "@/lib/seo/site";

// Нэг цагт нэг удаа шинэчилнэ (cache-тэй route).
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

const STATIC: [string, Entry["changeFrequency"], number][] = [
  ["/", "daily", 1],
  ["/listings", "hourly", 0.9],
  ["/map", "daily", 0.6],
  ["/agents", "weekly", 0.6],
  ...(["/home-loans", "/rent/afford", "/sell", "/my-home", "/ai", "/news", "/about", "/contact", "/help", "/partners"].map(
    (p) => [p, "monthly", 0.4] as [string, Entry["changeFrequency"], number]
  )),
  ["/privacy", "yearly", 0.2],
  ["/terms", "yearly", 0.2],
];

/**
 * Зөвхөн нийтийн, индекслэх хуудсууд: идэвхтэй зар (хаагдсан зар, PRIVATE_PATHS,
 * /office-signup, /sell-ийн дэд хуудас ОРОХГҮЙ). Cookie-гүй public client — build үед аюулгүй.
 * DB алдаа гарвал статик хэсэг л гарна (sitemap бүхэлдээ унахгүй).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = STATIC.map(([path, changeFrequency, priority]) => ({
    url: absUrl(path),
    changeFrequency,
    priority,
  }));

  for (const a of NEWS) {
    out.push({ url: absUrl(`/news/${a.slug}`), lastModified: a.date, changeFrequency: "yearly", priority: 0.3 });
  }

  try {
    const r = await getSitemapRows();
    for (const l of r.listings) {
      out.push({
        url: absUrl(`/listings/${l.id}`),
        ...(l.updated_at ? { lastModified: l.updated_at } : {}),
        changeFrequency: "daily",
        priority: 0.8,
        ...(l.photo ? { images: [l.photo] } : {}),
      });
    }
    for (const a of r.agents) {
      out.push({ url: absUrl(`/agents/${a.id}`), changeFrequency: "weekly", priority: 0.5 });
    }
    for (const o of r.offices) {
      out.push({ url: absUrl(`/offices/${o.id}`), changeFrequency: "weekly", priority: 0.5 });
    }
  } catch (e) {
    console.error("sitemap:", e instanceof Error ? e.message : e);
  }

  return out;
}
