"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

import { bookViewing } from "@/lib/actions/viewings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BookViewingButton({
  listingId,
  agentId,
}: {
  listingId: string;
  agentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!when) return;
    startTransition(async () => {
      const res = await bookViewing(listingId, agentId, new Date(when).toISOString());
      if (res.error === "auth") {
        router.push("/login?next=" + encodeURIComponent(window.location.pathname));
        return;
      }
      if (res.ok) {
        setMsg("Үзлэгийн хүсэлт илгээгдлээ! ✓");
        setOpen(false);
      } else {
        setMsg("Алдаа гарлаа. Дахин оролдоно уу.");
      }
    });
  }

  if (msg && !open) {
    return <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-700">{msg}</p>;
  }

  return (
    <div className="space-y-2">
      {!open ? (
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <Calendar className="size-4" /> Үзлэг товлох
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={pending || !when}>
              {pending ? "..." : "Илгээх"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
