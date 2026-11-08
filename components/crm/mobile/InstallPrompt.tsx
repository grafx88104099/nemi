"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isIos, isStandalone } from "./pwa";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const noopSubscribe = () => () => undefined;

function subscribeDisplayMode(cb: () => void) {
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", cb);
  window.addEventListener("appinstalled", cb);
  return () => {
    mq?.removeEventListener?.("change", cb);
    window.removeEventListener("appinstalled", cb);
  };
}

/** Нүүр дэлгэцэд суулгах санал (Android/Chrome — систем цонх; iOS — заавар). */
export function InstallPrompt({ className }: { className?: string }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  // Серверт «суулгасан» гэж үзэж юу ч зурахгүй — hydration зөрөхгүй.
  const installed = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => true);
  const ios = useSyncExternalStore(noopSubscribe, isIos, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;
  if (!evt && !ios) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm", className)}>
      <Download className="size-4 text-brand-600" />
      <span className="min-w-0 flex-1 text-ink">
        {evt ? "CRM-ийг утсандаа апп хэлбэрээр суулгах" : "Safari «Хуваалцах» → «Нүүр дэлгэцэд нэмэх»-ээр суулгана"}
      </span>
      {evt ? (
        <Button
          size="sm"
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice.catch(() => undefined);
            setEvt(null);
          }}
        >
          Суулгах
        </Button>
      ) : null}
    </div>
  );
}
