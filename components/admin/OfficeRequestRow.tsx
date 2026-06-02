"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { approveOfficeRequest, rejectOfficeRequest } from "@/lib/actions/offices";
import { Badge } from "@/components/ui/badge";

export function OfficeRequestRow({
  id,
  name,
  phone,
  note,
  status,
  requester,
  date,
}: {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requester: string;
  date: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function act(fn: (id: string) => Promise<unknown>) {
    startTransition(async () => {
      await fn(id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-ink">{name}</h3>
          <Badge tone={status === "pending" ? "amber" : status === "approved" ? "green" : "rose"}>
            {status === "pending" ? "Хүлээгдэж буй" : status === "approved" ? "Батлагдсан" : "Татгалзсан"}
          </Badge>
        </div>
        <p className="text-sm text-muted">{requester} · {phone || "утасгүй"} · {date}</p>
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => act(approveOfficeRequest)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-4" /> Батлах
          </button>
          <button
            onClick={() => act(rejectOfficeRequest)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            <X className="size-4" /> Татгалзах
          </button>
        </div>
      )}
    </div>
  );
}
