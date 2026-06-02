"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, ArrowRight, BadgeCheck } from "lucide-react";

import { setSelfAgent } from "@/lib/actions/agents";

export function MyAgentRoleToggle({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle(enable: boolean) {
    setErr(null);
    start(async () => {
      const res = await setSelfAgent(enable);
      if (!res.ok) {
        setErr(res.error ?? "Алдаа гарлаа");
        return;
      }
      router.refresh();
    });
  }

  if (active) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold text-ink">Та энэ оффист агентаар бүртгэлтэй</p>
              <p className="text-sm text-muted">
                Зар оруулах, лид удирдах агентын самбараа ашиглаарай. Нийтэд агент болж харагдана.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/agent"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Агент самбар <ArrowRight className="size-4" />
            </Link>
            <button
              onClick={() => toggle(false)}
              disabled={pending}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition hover:text-danger disabled:opacity-50"
            >
              {pending ? "..." : "Болих"}
            </button>
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserPlus className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <div>
            <p className="font-bold text-ink">Өөрөө бас агентаар ажиллах уу?</p>
            <p className="text-sm text-muted">
              Оффисоо удирдахын зэрэгцээ өөрийн зар, лидээ агентаар хөтлөх боломжтой.
            </p>
          </div>
        </div>
        <button
          onClick={() => toggle(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "..." : "Намайг агентаар бүртгэх"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
