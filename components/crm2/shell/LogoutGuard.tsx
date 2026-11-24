"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";

import { logoutLossText } from "./shell-model";

/**
 * Гарах (R8/R20): signOut-оос ӨМНӨ төхөөрөмж дээрх илгээгдээгүй зураг, шуурхай бүртгэл, дуусаагүй ноорог,
 * гэрээний хуудсыг тоолж, байвал «Илгээгдээгүй N зураг / M бүртгэл …» гэж асууна. Дараа нь logoutCleanup (ноорог, битүүмжилсэн
 * өгөгдөл, vault-ын түлхүүр, share хайрцаг), тэгээд хуучин signOut + шилжилт.
 * Төхөөрөмжийн модулийг зөвхөн гарах үед динамикаар ачаална (нийтийн сайтын багцад орохгүй);
 * ямар ч алдаа, удаашрал гарахыг хэзээ ч хаахгүй (хугацаа хязгаартай).
 */

const SUMMARY_TIMEOUT_MS = 3000;
const CLEANUP_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

function lastProfile(): string | null {
  try {
    return localStorage.getItem("crm2:last-profile");
  } catch {
    return null;
  }
}

export function useGuardedLogout(): { logout: () => void; pending: boolean; dialog: React.ReactNode } {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [prompt, setPrompt] = React.useState<{ profileId: string; text: string; draftsOnly: boolean } | null>(null);
  const leaving = React.useRef(false);

  const finish = React.useCallback(
    async (profileId: string | null) => {
      leaving.current = true;
      if (profileId) {
        const cleanup = import("@/lib/crm2/device/session-purge").then((m) => m.logoutCleanup(profileId));
        await withTimeout(cleanup, CLEANUP_TIMEOUT_MS, undefined);
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    },
    [router]
  );

  const logout = React.useCallback(() => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        let profileId: string | null = null;
        try {
          const { data } = await createClient().auth.getSession();
          profileId = data.session?.user.id ?? null;
        } catch {
          profileId = null;
        }
        profileId = profileId ?? lastProfile();
        if (profileId) {
          const summary = await withTimeout(
            import("@/lib/crm2/device/session-purge").then((m) => m.pendingLossSummary(profileId as string)),
            SUMMARY_TIMEOUT_MS,
            { photos: 0, submits: 0, drafts: 0, draftPhotos: 0, pages: 0 }
          );
          const text = logoutLossText(summary);
          if (text) {
            setPrompt({ profileId, text, draftsOnly: !summary.photos && !summary.submits && !summary.pages });
            setPending(false);
            return;
          }
        }
        await finish(profileId);
      } catch {
        setPending(false);
      }
    })();
  }, [pending, finish]);

  const wait = React.useCallback(() => {
    const p = prompt;
    setPrompt(null);
    if (leaving.current || !p) return;
    // «Илгээх хүртэл хүлээх»: дарааллыг шууд сэрээнэ (сүлжээ орвол өөрөө илгээнэ).
    void import("@/lib/crm2/device/upload-queue").then((m) => m.startQueue(p.profileId)).catch(() => {});
    void import("@/lib/crm2/device/network").then((m) => m.resumePendingSubmits(p.profileId)).catch(() => {});
  }, [prompt]);

  const dialog = (
    <ConfirmDialog
      open={!!prompt}
      onClose={wait}
      title={prompt?.text ?? ""}
      description={
        prompt?.draftsOnly
          ? "Ноорогоо дуусгаж хадгалбал алдагдахгүй. Одоо гарвал энэ төхөөрөмжөөс бүрмөсөн устна."
          : "Сүлжээ орох хүртэл хүлээвэл утсан дээрх зураг, бүртгэл автоматаар илгээгдэнэ. Одоо гарвал энэ төхөөрөмжөөс бүрмөсөн устна."
      }
      confirmLabel="Устгаад гарах"
      cancelLabel={prompt?.draftsOnly ? "Буцах" : "Илгээх хүртэл хүлээх"}
      tone="danger"
      onConfirm={async () => {
        if (!prompt) return null;
        await finish(prompt.profileId);
        return null;
      }}
    />
  );

  return { logout, pending, dialog };
}
