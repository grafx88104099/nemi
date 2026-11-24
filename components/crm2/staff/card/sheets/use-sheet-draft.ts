"use client";

import * as React from "react";

import {
  draftKey,
  hardDeleteDraft,
  loadDraft,
  sheetScope,
  useDraftAutosave,
  type DraftScope,
} from "@/lib/crm2/device/draft-store";

import type { SheetDraftPart } from "./sheet-model";

/**
 * Картын цонх бүрийн утсан дээрх ноорог (IDB scope sheet:{propertyId}:{sheet}).
 * - form: ил хадгалах хэсэг ({base, values}) — 1 сек debounce;
 * - private: vault-аар битүүмжлэх хэсэг (байршлын дэлгэрэнгүй, эзний утас/нэр, тэмдэглэл) — өөрчлөгдөх
 *   бүрт шууд;
 * - pagehide / hidden үед шууд (useDraftAutosave).
 * Хадгалсны дараа discard() — ноорог устна. Хадгалаагүй хаавал ноорог үлдэж, дараа нээхэд сэргэнэ.
 */
export type SheetDraftLoaded<P> = {
  part: SheetDraftPart | null;
  priv: P | null;
  privateLost: boolean;
  /** Нооргийн хадгалсан цаг (ноорог байхгүй бол ачаалсан цаг). */
  savedAt: number;
};

export function useSheetDraft<P>({
  profileId,
  propertyId,
  sheet,
  part,
  priv,
  onLoaded,
}: {
  profileId: string | null;
  propertyId: string;
  sheet: string;
  /** Ил хэсэг; null бол бичихгүй. */
  part: SheetDraftPart | null;
  /** Битүүмжлэх хэсэг; null бол хоосон (vault-аас устгана). */
  priv: P | null;
  /** Ачаалсны дараа нэг удаа (ноорог байхгүй бол part=null). */
  onLoaded: (loaded: SheetDraftLoaded<P>) => void;
}) {
  const scope: DraftScope = sheetScope(propertyId, sheet);
  const [ready, setReady] = React.useState(!profileId);
  const onLoadedRef = React.useRef(onLoaded);
  React.useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  React.useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    loadDraft<SheetDraftPart, P>(profileId, scope)
      .then((d) => {
        if (cancelled) return;
        const formPart = d?.form && typeof d.form === "object" && "values" in d.form ? (d.form as SheetDraftPart) : null;
        onLoadedRef.current({
          part: formPart,
          priv: d?.private ?? null,
          privateLost: !!d?.privateLost,
          savedAt: d?.record.savedAt ?? Date.now(),
        });
      })
      .catch(() => {
        if (!cancelled) onLoadedRef.current({ part: null, priv: null, privateLost: false, savedAt: Date.now() });
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, scope]);

  const autosave = useDraftAutosave<SheetDraftPart | Record<string, never>, P>(
    { form: part ?? {}, private: priv },
    { profileId, scope, enabled: ready && !!profileId }
  );

  // discardDraft биш: тэр нь түлхүүрийг хуудасны турш «устгасан» гэж түгжиж, цонхыг дахин нээхэд
  // автомат хадгалалт ажиллахгүй болно. Энд: бичилтийг зогсоож, явж буйг дуусгаад шууд устгана.
  const { cancel, flush } = autosave;
  const discard = React.useCallback(async () => {
    cancel();
    if (!profileId) return;
    try {
      await flush();
      await hardDeleteDraft(draftKey(profileId, scope));
    } catch {
      /* утсан дээрх ноорог устгаж чадсангүй — дараа нээхэд серверийн утгатай ижил тул сэргээхгүй */
    }
  }, [cancel, flush, profileId, scope]);

  return { ready, savedAt: autosave.savedAt, error: autosave.error, flush: autosave.flush, discard };
}
