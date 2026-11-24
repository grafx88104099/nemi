"use client";

import * as React from "react";
import { Images, Link2, PlusCircle } from "lucide-react";

import type { Crm2PublishLinkCandidate, Crm2PublishLinkMode } from "@/lib/crm2/types";
import { cn } from "@/lib/utils";

import { listingStatusLabel } from "./listing-status";
import { LINK_OPTION_LABEL, NEW_OPTION_LABEL, publishChoices, type PublishChoice } from "./publish-model";

/**
 * «Миний зараас үүсгэсэн» хөрөнгийг нийтлэх горим (R21):
 *   link_only — зөвхөн одоогийн зарыг шинэчилнэ (эх зар идэвхтэй — шинэ давхар зар үүсгэхгүй);
 *   choice    — шинэчлэх эсвэл шинэ зар (эх зар идэвхгүй);
 *   new_only  — энэ хэсэг харагдахгүй.
 * «Зургийг солих» нь тодорхой сонголт (анхдагчаар зарын зураг хэвээр).
 */
export function LinkChoice({
  mode,
  candidate,
  choice,
  onChoice,
  replacePhotos,
  onReplacePhotos,
  imageCount,
  disabled,
}: {
  mode: Crm2PublishLinkMode;
  candidate: Crm2PublishLinkCandidate;
  choice: PublishChoice;
  onChoice: (c: PublishChoice) => void;
  replacePhotos: boolean;
  onReplacePhotos: (v: boolean) => void;
  imageCount: number;
  disabled?: boolean;
}) {
  const name = React.useId();
  const choices = publishChoices(mode);
  const single = choices.length === 1;

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink">
        Энэ хөрөнгийг таны зараас үүсгэсэн
        {candidate.title ? (
          <>
            {" "}
            (<span className="font-semibold">{candidate.title}</span>
            {" · "}
            {listingStatusLabel(candidate.status)})
          </>
        ) : (
          ` (${listingStatusLabel(candidate.status)})`
        )}
        .
      </p>
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="sr-only">Нийтлэх арга</legend>
        <Option
          name={name}
          checked={choice === "link"}
          onSelect={() => onChoice("link")}
          icon={Link2}
          title={LINK_OPTION_LABEL}
          hint={
            mode === "link_only"
              ? "Зар идэвхтэй тул давхар шинэ зар үүсгэхгүй. Үнэ, үзүүлэлт CRM-ээс шинэчлэгдэж, цаашид зар CRM-ээр удирдагдана."
              : "Зар дахин идэвхжиж, үнэ, үзүүлэлт CRM-ээс шинэчлэгдэнэ. Цаашид зар CRM-ээр удирдагдана."
          }
          single={single}
        />
        {choices.includes("new") ? (
          <Option
            name={name}
            checked={choice === "new"}
            onSelect={() => onChoice("new")}
            icon={PlusCircle}
            title={NEW_OPTION_LABEL}
            hint="Хуучин зар хөндөгдөхгүй. CRM-ийн зураг тамгатайгаар шинэ зарт орно."
          />
        ) : null}
      </fieldset>

      {choice === "link" ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-brand-600"
            checked={replacePhotos}
            disabled={disabled || imageCount === 0}
            onChange={(e) => onReplacePhotos(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Images className="size-4 shrink-0 text-brand-600" aria-hidden /> Зургийг солих
            </span>
            <span className="block text-xs text-muted">
              {replacePhotos
                ? `Зарын ${candidate.photo_count} зургийг CRM-ийн ${imageCount} зургаар (тамгатай) солино.`
                : `Зарын ${candidate.photo_count} зураг хэвээр үлдэнэ.`}
              {imageCount === 0 ? " CRM-д зураг алга." : ""}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function Option({
  name,
  checked,
  onSelect,
  icon: Icon,
  title,
  hint,
  single,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  icon: typeof Link2;
  title: string;
  hint: string;
  single?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5",
        checked ? "border-brand-500 bg-brand-50/60" : "border-line bg-surface"
      )}
    >
      <input
        type="radio"
        name={name}
        className={cn("mt-0.5 size-5 shrink-0 accent-brand-600", single && "sr-only")}
        checked={checked}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Icon className="size-4 shrink-0 text-brand-600" aria-hidden /> {title}
        </span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
