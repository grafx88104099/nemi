"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setPropertyStatus } from "@/lib/crm2/actions/properties";

import type { ActivationPanelState } from "./contract-model";
import { MissingList } from "./parts";

/**
 * Гэрээ батлагдсаны дараах хөрөнгийн идэвхжүүлэлт: manual горимд «Идэвхжүүлэх» (setPropertyStatus active),
 * дутуу бол жагсаалт (чимээгүй бүтэлгүйтэхгүй), эхлэх өдөр нь автоматаар бол мэдэгдэл.
 */
export function ActivationReadiness({ propertyId, state }: { propertyId: string; state: ActivationPanelState }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (state.kind === "hidden" || state.kind === "auto") return null;
  if (state.kind === "scheduled") {
    return (
      <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        Гэрээ батлагдсан. Эхлэх өдөр нь хөрөнгө автоматаар идэвхжинэ.
      </p>
    );
  }
  if (state.kind === "blocked") {
    return (
      <MissingList
        items={state.missing}
        title="Гэрээ батлагдсан ч хөрөнгийг идэвхжүүлэхэд дутуу:"
        className="border-amber-300"
      />
    );
  }

  async function activate() {
    setPending(true);
    setError(null);
    const r = await setPropertyStatus({ property_id: propertyId, status: "active" });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(r.data === "pending" ? "Идэвхжүүлэх хүсэлт илгээгдлээ" : "Хөрөнгө идэвхтэй боллоо");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
      <p className="text-sm text-emerald-900">Гэрээ батлагдсан, нөхцөл бүрэн. Хөрөнгийг идэвхжүүлж Staff санд оруулна уу.</p>
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Button type="button" size="lg" className="w-full sm:w-auto" disabled={pending} onClick={() => void activate()}>
        <Power className="size-4" aria-hidden /> {pending ? "Идэвхжүүлж байна…" : "Идэвхжүүлэх"}
      </Button>
    </div>
  );
}
