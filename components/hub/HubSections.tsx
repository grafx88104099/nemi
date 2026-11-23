"use client";

import type * as React from "react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { HUB_INTENT_KEY, HUB_INTENTS, hubSectionOrder, parseHubIntent, type HubIntent, type HubSectionId } from "@/lib/hub";

const INTENT_EVENT = "nemi:hub-intent";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(INTENT_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(INTENT_EVENT, cb);
  };
}

function getSnapshot(): HubIntent | null {
  try {
    return parseHubIntent(localStorage.getItem(HUB_INTENT_KEY));
  } catch {
    return null;
  }
}

function setIntent(v: HubIntent | null) {
  try {
    if (v) localStorage.setItem(HUB_INTENT_KEY, v);
    else localStorage.removeItem(HUB_INTENT_KEY);
  } catch {
    // localStorage хаалттай — дараалал өгөгдмөлөөрөө.
  }
  window.dispatchEvent(new Event(INTENT_EVENT));
}

/**
 * «Таны зорилго» чипүүд (aria-pressed toggle) ба хэсгүүдийн дараалал.
 * Зорилго зөвхөн энэ төхөөрөмжийн localStorage-д; хэсгийн агуулга серверээс.
 */
export function HubSections({ sections }: { sections: { id: HubSectionId; node: React.ReactNode }[] }) {
  const intent = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const order = hubSectionOrder(intent);
  const sorted = [...sections].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  return (
    <>
      <div role="group" aria-label="Таны зорилго" className="mt-6 flex flex-wrap gap-2">
        {HUB_INTENTS.map(([v, label]) => {
          const on = intent === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => setIntent(on ? null : v)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-sm font-medium transition",
                on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-surface text-ink hover:border-brand-200"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-6 space-y-6">
        {sorted.map((s) => (
          <div key={s.id}>{s.node}</div>
        ))}
      </div>
    </>
  );
}
