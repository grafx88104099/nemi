import Link from "next/link";
import { notFound } from "next/navigation";

import { getArticle, NEWS } from "@/lib/news";
import { Badge } from "@/components/ui/badge";

export function generateStaticParams() {
  return NEWS.map((a) => ({ slug: a.slug }));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/news" className="text-sm text-muted hover:underline">← Мэдээ</Link>
      <div className="mt-4 flex items-center gap-2">
        <Badge tone="brand">{a.tag}</Badge>
        <span className="text-xs text-subtle">{a.date}</span>
      </div>
      <h1 className="mt-3 text-3xl font-extrabold text-ink">{a.title}</h1>
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
        {a.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </article>
  );
}
