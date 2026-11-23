"use client";

import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

/** Server-action маягтын илгээх товч — хүлээх үед идэвхгүй (давхар илгээхгүй). */
export function PendingSubmit({ idle, pending: pendingLabel }: { idle: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60 sm:min-h-9"
      >
        <Sparkles className="size-3.5" aria-hidden />
        {pending ? pendingLabel : idle}
      </button>
      <span aria-live="polite" className="sr-only">
        {pending ? pendingLabel : ""}
      </span>
    </>
  );
}
