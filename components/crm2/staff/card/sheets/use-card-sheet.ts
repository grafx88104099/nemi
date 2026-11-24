"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { parseSheetParam, type CardSheetParam } from "./sheet-model";

/**
 * Картын доод цонхны төлөв URL-д (?sheet=…&field=…): хуудас дахин ачаалах, апп солих, холбоос
 * хуваалцахад цонх хэвээр нээгдэнэ. window.history.pushState/replaceState нь Next-ийн router-тэй
 * синк (useSearchParams шинэчлэгдэнэ, сервер рүү хүсэлт явахгүй).
 *
 * Картаас нээсэн цонхыг хаахад history.back() — утасны «буцах» товч цонхыг хаана. Холбоосоор
 * (?sheet=) шууд орж ирсэн бол replaceState-ээр параметрийг арилгана (хуудаснаас гарахгүй).
 */

/** Энэ хуудсанд pushState-ээр нээсэн цонхны тоо (back хийх эсэх). */
let pushedDepth = 0;

function buildUrl(mutate: (sp: URLSearchParams) => void): string {
  const sp = new URLSearchParams(window.location.search);
  mutate(sp);
  const q = sp.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
}

export type CardSheetApi = {
  sheet: CardSheetParam | null;
  field: string | null;
  /** Цонх нээх. Өөр цонх нээлттэй бол түүнийг солино (түүхэнд нэг мөр). */
  open: (sheet: CardSheetParam, field?: string | null) => void;
  close: () => void;
};

export function useCardSheet(): CardSheetApi {
  const sp = useSearchParams();
  const sheet = parseSheetParam(sp.get("sheet"));
  const field = sheet ? sp.get("field") : null;

  const open = React.useCallback((next: CardSheetParam, nextField?: string | null) => {
    const already = !!parseSheetParam(new URLSearchParams(window.location.search).get("sheet"));
    const url = buildUrl((q) => {
      q.set("sheet", next);
      if (nextField) q.set("field", nextField);
      else q.delete("field");
    });
    if (already) {
      window.history.replaceState(null, "", url);
    } else {
      pushedDepth += 1;
      window.history.pushState(null, "", url);
    }
  }, []);

  const close = React.useCallback(() => {
    if (pushedDepth > 0) {
      pushedDepth -= 1;
      window.history.back();
      return;
    }
    window.history.replaceState(
      null,
      "",
      buildUrl((q) => {
        q.delete("sheet");
        q.delete("field");
      })
    );
  }, []);

  // Хэрэглэгч өөрөө «буцах» дарж цонх хаагдвал тоолуурыг тэнцүүлнэ.
  React.useEffect(() => {
    const onPop = () => {
      if (!parseSheetParam(new URLSearchParams(window.location.search).get("sheet"))) pushedDepth = 0;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return { sheet, field, open, close };
}
