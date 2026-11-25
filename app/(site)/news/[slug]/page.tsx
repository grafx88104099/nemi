import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { articleBody, articleIndexable, getArticle, NEWS } from "@/lib/news";
import { hasAiScores } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { clip, ogBase, ROOT_OG_IMAGE, withBrand } from "@/lib/seo/site";

export function generateStaticParams() {
  return NEWS.map((a) => ({ slug: a.slug }));
}

/** Нийтлэл бүр өөрийн гарчиг, тайлбар, canonical, og:type=article (publishedTime). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: withBrand("Мэдээ"), robots: { index: false, follow: false } };
  const url = `/news/${a.slug}`;
  const description = clip(a.excerpt || a.body[0], 160);
  // AI оноо ажиллаагүй үед AI-ийн нийтлэлийг индекслэхгүй (/ai-тай ижил).
  const indexable = articleIndexable(a, a.requiresAiScores ? await hasAiScores().catch(() => false) : true);
  return {
    title: withBrand(a.title),
    description,
    alternates: { canonical: url },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      ...ogBase(),
      type: "article",
      url,
      title: a.title,
      description,
      publishedTime: a.date,
      images: [ROOT_OG_IMAGE],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const body = articleBody(a, a.requiresAiScores ? await hasAiScores().catch(() => false) : true);

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/news" className="text-sm text-muted hover:underline">← Мэдээ</Link>
      <div className="mt-4 flex items-center gap-2">
        <Badge tone="brand">{a.tag}</Badge>
        <span className="text-xs text-subtle">{a.date}</span>
      </div>
      <h1 className="mt-3 text-3xl font-extrabold text-ink">{a.title}</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
        {body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </article>
  );
}
