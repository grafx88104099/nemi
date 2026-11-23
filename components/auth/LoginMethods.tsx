"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { LoginForm } from "@/components/auth/LoginForm";
import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";

type Method = "phone" | "email";

const TABS: { id: Method; label: string }[] = [
  { id: "phone", label: "Утсаар" },
  { id: "email", label: "И-мэйлээр" },
];

/**
 * /login-ийн «Утсаар / И-мэйлээр» сонголт. Зөвхөн PHONE_LOGIN_ENABLED үед mount хийгдэнэ.
 * Хүртээмж: roving tabindex + ←/→/Home/End. Хоёр панел хоёулаа mount хэвээр (идэвхгүй нь
 * `hidden`) — таб сольж буцахад илгээсэн код, алхам, дахин илгээх хугацаа алдагдахгүй.
 */
export function LoginMethods({ next, initialMethod = "phone" }: { next: string; initialMethod?: Method }) {
  const [method, setMethod] = useState<Method>(initialMethod);
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = TABS.findIndex((t) => t.id === method);
    let to = -1;
    if (e.key === "ArrowRight") to = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") to = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = TABS.length - 1;
    if (to < 0) return;
    e.preventDefault();
    setMethod(TABS[to].id);
    listRef.current?.querySelector<HTMLButtonElement>(`#login-tab-${TABS[to].id}`)?.focus();
  }

  return (
    <div className="space-y-4">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Нэвтрэх арга"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`login-tab-${t.id}`}
            aria-selected={method === t.id}
            tabIndex={method === t.id ? 0 : -1}
            aria-controls={`login-panel-${t.id}`}
            onClick={() => setMethod(t.id)}
            className={cn(
              "h-11 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              method === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`login-panel-${t.id}`}
          aria-labelledby={`login-tab-${t.id}`}
          hidden={method !== t.id}
        >
          {t.id === "phone" ? <PhoneOtpForm next={next} /> : <LoginForm next={next} />}
        </div>
      ))}
    </div>
  );
}
