/**
 * Агент, оффисын metadata — цэвэр builder-ууд. Оролтын төрөлд утас, имэйл,
 * profile_id, хаяг огт байхгүй (гаралтад хэзээ ч орохгүй).
 */
import type { Metadata } from "next";

import { clip, ogBase, ogPhotoUrl, ROOT_OG_IMAGE, withBrand } from "./site";

export type AgentSeo = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  rating: number | null;
  reviews_count: number | null;
  sold: number | null;
  years: number | null;
  specialty: string | null;
  areas: string[] | null;
  bio: string | null;
  office: { name: string } | null;
};

export function agentMetaFor(id: string, a: AgentSeo | null): Metadata {
  if (!a) return { title: withBrand("Агент"), robots: { index: false, follow: false } };

  const facts = [
    a.office?.name,
    a.specialty,
    a.rating != null && a.reviews_count ? `★ ${a.rating} (${a.reviews_count} сэтгэгдэл)` : null,
    a.sold ? `${a.sold} зарсан` : null,
    a.areas?.length ? a.areas.slice(0, 3).join(", ") : null,
  ].filter(Boolean);
  const d = clip(facts.join(" · ") + (a.bio ? `. ${a.bio}` : ""), 160);
  const url = `/agents/${id}`;
  const img = ogPhotoUrl(a.avatar_url, 640);

  return {
    title: withBrand(`${a.display_name} — үл хөдлөхийн агент`),
    description: d,
    alternates: { canonical: url },
    openGraph: {
      ...ogBase(),
      type: "profile",
      url,
      title: a.display_name,
      description: d,
      images: img ? [{ url: img, alt: a.display_name }] : [ROOT_OG_IMAGE],
    },
    twitter: { card: "summary" },
  };
}

export type OfficeSeo = {
  id: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  agents_count: number | null;
  listings_count: number | null;
  about: string | null;
  description: string | null;
  service_areas: string[] | null;
  suspended_at: string | null;
};

export function officeMetaFor(id: string, o: OfficeSeo | null): Metadata {
  if (!o) return { title: withBrand("Оффис"), robots: { index: false, follow: false } };

  const areas = o.service_areas?.length ? ` · ${o.service_areas.slice(0, 3).join(", ")}` : "";
  const d = clip(
    `${o.agents_count ?? 0} агент · ${o.listings_count ?? 0} зар${areas}. ${o.about || o.description || ""}`,
    160
  );
  const url = `/offices/${id}`;
  const cover = ogPhotoUrl(o.cover_url, 1200);
  const logo = ogPhotoUrl(o.logo_url, 640);
  const image = cover ? { url: cover, alt: o.name } : logo ? { url: logo, alt: o.name } : ROOT_OG_IMAGE;
  const suspended = Boolean(o.suspended_at);

  return {
    title: withBrand(`${o.name} — үл хөдлөхийн оффис`),
    description: d,
    // Түдгэлзсэн оффис: noindex-тэй зөрчилдөх canonical тавихгүй.
    ...(suspended ? { robots: { index: false, follow: false } } : { alternates: { canonical: url } }),
    openGraph: { ...ogBase(), url, title: o.name, description: d, images: [image] },
    twitter: { card: cover ? "summary_large_image" : "summary" },
  };
}
