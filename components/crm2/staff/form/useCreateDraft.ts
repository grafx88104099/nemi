"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { logUiEvent } from "@/lib/crm2/actions/events";
import {
  discardDraft,
  draftKey as makeDraftKey,
  loadDraft,
  newDraft,
  shouldAutoRestore,
  staffNewScope,
  useDraftAutosave,
  type DraftAutosaveState,
  type LoadedDraft,
} from "@/lib/crm2/device/draft-store";
import type { Crm2Paths } from "@/lib/crm2/paths";
import type { UiEventInput } from "@/lib/crm2/schemas";

/**
 * Бүрэн формын шинэ хөрөнгийн ноорог (P5): ?draft=<clientKey> → тэр ноорог; параметргүй бол шинэ
 * ноорог үүсгэж URL-ийг ?full=1&draft=<key> болгоно (window.history.replaceState — серверт очихгүй).
 * Шуурхай бүртгэлтэй ИЖИЛ бичлэг (crm2:draft:{profileId}:staff-new:{clientKey}) тул хооронд нь
 * шилжихэд юу ч алдагдахгүй.
 *   * 12 цагаас бага → асуухгүйгээр сэргээнэ («Ноорог сэргээгдлээ HH:mm»);
 *   * хуучин → «Үргэлжлүүлэх / Шинээр эхлэх» (шинээр эхлэхэд хуучин ноорог жагсаалтад үлдэнэ).
 */

const CLIENT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientKey(v: string | null | undefined): v is string {
  return !!v && CLIENT_KEY_RE.test(v);
}

/** Хэмжилт — сүлжээгүй, хуучин DB үед ч алдаа гаргахгүй (fire-and-forget). */
export function trackUi(e: UiEventInput): void {
  try {
    const p: unknown = logUiEvent(e);
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    /* хэмжилт — алгасна */
  }
}

/** URL-ийн ?draft; байхгүй/буруу бол шинэ clientKey үүсгэж URL-д бичнэ (тэр хүртэл null). */
export function useStaffDraftKey(paths: Pick<Crm2Paths, "staffNew">): string | null {
  const sp = useSearchParams();
  const param = sp.get("draft");
  const valid = isClientKey(param) ? param.toLowerCase() : null;

  React.useEffect(() => {
    if (valid) return;
    window.history.replaceState(null, "", paths.staffNew({ full: 1, draft: newDraft() }));
  }, [valid, paths]);

  return valid;
}

export type CreateDraftPhase = "loading" | "ready" | "offer";

export type CreateDraftController<F, P> = {
  phase: CreateDraftPhase;
  /** Автоматаар/хүсэлтээр сэргээсэн нооргийн хадгалсан цаг. */
  restoredAt: number | null;
  /** Асуух горимд — хуучин нооргийн хадгалсан цаг. */
  offerSavedAt: number | null;
  /** Хувийн хэсэг (эзний утас) нээгдсэнгүй. */
  privateLost: boolean;
  /** Сүүлд утсан дээр бичигдсэн цаг. */
  savedAt: number | null;
  error: boolean;
  /** Хуучин ноорогийг үргэлжлүүлэх. */
  continueOffer: () => void;
  /** Шинэ ноорог эхлэх (хуучин нь жагсаалтад үлдэнэ). */
  startNew: () => void;
  flush: () => Promise<void>;
  /** Амжилттай хадгалсны дараа: автомат хадгалалтыг зогсоож нооргийг устгана (дараалалд шилжсэн blob үлдэнэ). */
  discard: () => Promise<void>;
  key: string;
  /** Анхдагч бус сэргээгдсэн нооргийн эх сурвалж. */
  source: LoadedDraft<F, P>["source"];
};

export function useCreateDraft<F, P>({
  profileId,
  clientKey,
  state,
  paths,
  onRestore,
}: {
  profileId: string;
  /** null — засах горим (ноорог ашиглахгүй). */
  clientKey: string | null;
  state: DraftAutosaveState<F, P>;
  paths: Pick<Crm2Paths, "staffNew">;
  /** Нооргийг маягтад буулгана (медиаг blob-оос сэргээх зэрэг). */
  onRestore: (loaded: LoadedDraft<F, P>) => void;
}): CreateDraftController<F, P> {
  const scope = clientKey ? staffNewScope(clientKey) : null;
  const key = scope ? makeDraftKey(profileId, scope) : "";
  const [phase, setPhase] = React.useState<CreateDraftPhase>(clientKey ? "loading" : "ready");
  const [restoredAt, setRestoredAt] = React.useState<number | null>(null);
  const [offer, setOffer] = React.useState<LoadedDraft<F, P> | null>(null);
  const [privateLost, setPrivateLost] = React.useState(false);
  const [source, setSource] = React.useState<LoadedDraft<F, P>["source"]>("manual");
  const onRestoreRef = React.useRef(onRestore);
  React.useEffect(() => {
    onRestoreRef.current = onRestore;
  });
  const logged = React.useRef(false);

  const apply = React.useCallback((d: LoadedDraft<F, P>) => {
    onRestoreRef.current(d);
    setRestoredAt(d.record.savedAt);
    setPrivateLost(d.privateLost);
    setSource(d.source);
  }, []);

  React.useEffect(() => {
    if (!scope) return;
    let alive = true;
    loadDraft<F, P>(profileId, scope)
      .then((d) => {
        if (!alive) return;
        const first = !logged.current;
        logged.current = true;
        if (!d) {
          setPhase("ready");
          return;
        }
        if (shouldAutoRestore(d.record.savedAt)) {
          apply(d);
          setPhase("ready");
          if (first) trackUi({ event: "draft_restored_auto", flow: "full", meta: { photos: d.media.length, private_lost: d.privateLost } });
        } else {
          setOffer(d);
          setPhase("offer");
          if (first) trackUi({ event: "draft_restore_offer", flow: "full" });
        }
      })
      .catch(() => {
        // IndexedDB алга (хувийн горим г.м.) — ноорoггүй ажиллана.
        if (alive) setPhase("ready");
      });
    return () => {
      alive = false;
    };
  }, [profileId, scope, apply]);

  const autosave = useDraftAutosave<F, P>(state, { profileId, scope, enabled: !!scope && phase === "ready" });

  const continueOffer = React.useCallback(() => {
    if (!offer) return;
    apply(offer);
    setOffer(null);
    setPhase("ready");
    trackUi({ event: "draft_restored", flow: "full" });
  }, [offer, apply]);

  const startNew = React.useCallback(() => {
    trackUi({ event: "draft_new_started", flow: "full" });
    // Шинэ clientKey → маягт шинээр (хуучин ноорог «Дуусаагүй ноорог» жагсаалтад үлдэнэ).
    window.history.replaceState(null, "", paths.staffNew({ full: 1, draft: newDraft() }));
  }, [paths]);

  const { cancel, flush } = autosave;
  const discard = React.useCallback(async () => {
    cancel();
    if (!key) return;
    try {
      await discardDraft(key, { undoMs: 0 });
    } catch {
      /* IDB алга — устгах зүйлгүй */
    }
  }, [cancel, key]);

  return {
    phase,
    restoredAt,
    offerSavedAt: offer?.record.savedAt ?? null,
    privateLost,
    savedAt: autosave.savedAt,
    error: autosave.error,
    continueOffer,
    startNew,
    flush,
    discard,
    key,
    source,
  };
}
