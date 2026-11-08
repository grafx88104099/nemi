"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getPushServerStatus, removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/actions/crm-push";
import { cn } from "@/lib/utils";

import { currentSubscription, isIos, isStandalone, pushSupported, registerSw, urlBase64ToUint8Array } from "./pwa";

type State = "loading" | "unsupported" | "ios_install" | "server_off" | "denied" | "off" | "on";

/**
 * Дэлгэц хаалттай үед ч сэжмийн мэдэгдэл авах (R4). iOS-д эхлээд нүүр
 * дэлгэцэд суулгах шаардлагатай — тэр тохиолдолд зааврыг харуулна.
 */
export function PushToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported()) {
        if (alive) setState(isIos() && !isStandalone() ? "ios_install" : "unsupported");
        return;
      }
      const status = await getPushServerStatus();
      if (!alive) return;
      if (!status.configured || !status.publicKey) {
        setState("server_off");
        return;
      }
      setKey(status.publicKey);
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await currentSubscription();
      if (alive) setState(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  function enable() {
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState(perm === "denied" ? "denied" : "off");
          toast.error("Мэдэгдлийн зөвшөөрөл олгогдсонгүй.");
          return;
        }
        const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerSw());
        if (!reg || !key) throw new Error("no registration");
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
        const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
        if (!res.ok) {
          toast.error(res.error ?? "Мэдэгдлийг асааж чадсангүй.");
          return;
        }
        setState("on");
        toast.success("Мэдэгдэл асаалаа", { description: "Шинэ сэжим, хугацааны сануулга энэ төхөөрөмжид ирнэ." });
      } catch (e) {
        console.error("push enable:", e instanceof Error ? e.message : e);
        toast.error("Мэдэгдлийг асааж чадсангүй. Хөтчийн тохиргоог шалгана уу.");
      }
    });
  }

  function disable() {
    start(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
      toast.info("Энэ төхөөрөмжид мэдэгдэл унтарлаа.");
    });
  }

  function test() {
    start(async () => {
      const res = await sendTestPush();
      if (res.ok) toast.success("Туршилтын мэдэгдэл илгээлээ.");
      else toast.error(res.error ?? "Илгээж чадсангүй.");
    });
  }

  const box = cn("rounded-2xl border border-line bg-surface p-3 text-sm", className);

  if (state === "loading") return compact ? null : <div className={box}><p className="text-muted">Мэдэгдлийн төлөв шалгаж байна…</p></div>;
  if (state === "unsupported")
    return compact ? null : (
      <div className={box}>
        <p className="flex items-center gap-2 text-muted"><BellOff className="size-4" /> Энэ хөтөч дэлгэцийн мэдэгдэл дэмжихгүй.</p>
      </div>
    );
  if (state === "server_off")
    return compact ? null : (
      <div className={box}>
        <p className="flex items-center gap-2 text-muted"><BellOff className="size-4" /> Мэдэгдлийн сервер тохируулагдаагүй байна.</p>
      </div>
    );
  if (state === "ios_install")
    return (
      <div className={box}>
        <p className="flex items-center gap-2 font-medium text-ink"><Smartphone className="size-4 text-brand-600" /> iPhone-д мэдэгдэл авах</p>
        <p className="mt-1 text-xs text-muted">
          Safari-ийн «Хуваалцах» товч → «Нүүр дэлгэцэд нэмэх»-ийг дарж аппыг суулгаад, нүүр дэлгэцээс нээж мэдэгдлийг асаана.
        </p>
      </div>
    );
  if (state === "denied")
    return (
      <div className={box}>
        <p className="flex items-center gap-2 text-ink"><BellOff className="size-4 text-rose-600" /> Мэдэгдлийг хөтчийн тохиргоонд хаасан байна.</p>
        <p className="mt-1 text-xs text-muted">Хөтчийн сайтын тохиргооноос «Мэдэгдэл»-ийг зөвшөөрөөд хуудсыг дахин ачаална уу.</p>
      </div>
    );
  if (state === "off")
    return (
      <div className={cn(box, "flex flex-wrap items-center gap-2")}>
        <Bell className="size-4 text-brand-600" />
        <span className="min-w-0 flex-1 text-ink">Дэлгэц хаалттай үед ч шинэ сэжмийн мэдэгдэл авах</span>
        <Button size="sm" onClick={enable} disabled={pending}>Асаах</Button>
      </div>
    );
  return (
    <div className={cn(box, "flex flex-wrap items-center gap-2")}>
      <BellRing className="size-4 text-emerald-600" />
      <span className="min-w-0 flex-1 text-ink">Энэ төхөөрөмжид мэдэгдэл асаалттай</span>
      {!compact ? (
        <Button size="sm" variant="outline" onClick={test} disabled={pending}>Туршиж үзэх</Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={disable} disabled={pending}>Унтраах</Button>
    </div>
  );
}
