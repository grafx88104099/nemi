"use client";

import { useEffect } from "react";

import { markConversationNotificationsRead } from "@/lib/actions/notifications";
import { conversationLink } from "@/lib/hub";

/**
 * Нээлттэй харилцааны мессежийн мэдэгдлийг mount-ын дараа уншсан болгоно
 * (GET render-т бичихгүй, prefetch-д ажиллахгүй), серверийн үлдсэн тоог
 * «nemi:messages-read»-ээр MobileTabBar, NotificationBell руу дамжуулна.
 * Сонсогчид layout-д байнга байдаг тул хуудаснаас гарсан ч event-ийг илгээнэ.
 *
 * Нээлттэй байх үед энэ харилцаанд шинэ мессеж ирвэл (NotificationBell-ийн
 * realtime «nemi:notification») түүнийг ч мөн DB-д уншсан болгоно — эс бөгөөс
 * MobileTabBar зөвхөн клиент талд алгасаж, дараагийн шилжилтэд тоо буцаж гарна.
 */
export function MessagesReadSync({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    const link = conversationLink(conversationId);
    let alive = true;

    function sync() {
      markConversationNotificationsRead(conversationId)
        .then(({ remaining }) => {
          if (remaining < 0) return;
          window.dispatchEvent(new CustomEvent("nemi:messages-read", { detail: { link, remaining } }));
        })
        .catch(() => {});
    }

    function onNotification(e: Event) {
      const d = (e as CustomEvent<{ type?: string | null; link?: string | null } | null>).detail;
      if (!alive || d?.type !== "message" || d.link !== link) return;
      sync();
    }

    sync();
    window.addEventListener("nemi:notification", onNotification);
    return () => {
      alive = false;
      window.removeEventListener("nemi:notification", onNotification);
    };
  }, [conversationId]);

  return null;
}
