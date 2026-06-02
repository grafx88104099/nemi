"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { valuateListing } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";

export function AiValuateButton({ listingId }: { listingId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await valuateListing(listingId);
      if (res.error === "no_key") {
        setMsg("AI идэвхгүй: ANTHROPIC_API_KEY тохируулаагүй байна.");
      } else if (res.error) {
        setMsg(`Алдаа: ${res.error}`);
      } else {
        setMsg(`AI оноо: ${res.score}/100 — ${res.note}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        <Sparkles className="size-4" /> {pending ? "Үнэлж байна..." : "AI үнэлгээ хийх"}
      </Button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
