import Link from "next/link";

import { NEWS } from "@/lib/news";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-extrabold text-ink">Мэдээ ба зах зээлийн судалгаа</h1>
      <p className="mt-2 text-muted">Үл хөдлөхийн салбарын шинэ мэдээ, дүн шинжилгээ.</p>
      <div className="mt-8 space-y-4">
        {NEWS.map((n) => (
          <Link key={n.slug} href={`/news/${n.slug}`} className="block">
            <Card className="transition hover:shadow-md">
              <CardBody className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">{n.tag}</Badge>
                  <span className="text-xs text-subtle">{n.date}</span>
                </div>
                <h2 className="text-lg font-bold text-ink">{n.title}</h2>
                <p className="text-sm text-muted">{n.excerpt}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
