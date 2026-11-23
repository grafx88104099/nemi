"use client";

import * as React from "react";
import { Copy, Download, ExternalLink, Link2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { textareaClass } from "@/components/crm2/staff/card/publish/PublishPanel";
import { postListingToFacebook } from "@/lib/actions/distribute";
import { channelLabel } from "@/lib/attribution";
import {
  facebookSharerUrl,
  SHARE_CHANNEL_ORDER,
  SHARE_CHANNELS,
  UNEGUI_POST_URL,
  viberForwardUrl,
  type ShareChannel,
} from "@/lib/distribute/links";
import { channelsFromRecord, formatCountsLine, ZERO_COUNTS } from "@/lib/distribute/stats-model";
import type { ShareKitData } from "@/lib/distribute/types";
import { fmtDateTime } from "@/lib/format";

const linkClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2";

async function copyText(text: string, okMessage = "Хуулагдлаа") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    window.prompt("Хуулна уу:", text);
  }
}

function CopyButtons({ text, link }: { text: string; link: string }) {
  return (
    <>
      <Button type="button" size="touch" onClick={() => copyText(text)}>
        <Copy className="size-4" aria-hidden /> Хуулах
      </Button>
      <Button type="button" size="touch" variant="outline" onClick={() => copyText(link, "Холбоос хуулагдлаа")}>
        <Link2 className="size-4" aria-hidden /> Холбоос хуулах
      </Button>
    </>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const id = React.useId();
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div id={id} className="text-xs font-semibold text-muted">{label}</div>
        <p aria-labelledby={id} className="mt-0.5 whitespace-pre-line break-words rounded-xl bg-surface-2 p-2.5 text-sm text-ink">
          {value || "—"}
        </p>
      </div>
      <Button
        type="button"
        size="touch"
        variant="outline"
        className="mt-5"
        disabled={!value}
        onClick={() => copyText(value)}
        aria-label={`${label} хуулах`}
      >
        <Copy className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/**
 * R10 «Түгээх» — Facebook / Viber / unegui.mn-д хуулж тавих текст, UTM холбоос,
 * зургийн татах холбоос, сувгийн 30 хоногийн статистик. Facebook хуудсанд шууд
 * нийтлэх баталгаажуулалт нь ЭНЭ табын дотор (хоёр дахь цонх нээхгүй).
 */
export function ShareKit({ data }: { data: ShareKitData }) {
  const [tab, setTab] = React.useState<ShareChannel>("facebook");
  const [fbText, setFbText] = React.useState(data.texts.facebook);
  const [viberText, setViberText] = React.useState(data.texts.viber);
  const [uneguiBody, setUneguiBody] = React.useState(data.texts.unegui.body);
  const [fbStep, setFbStep] = React.useState<"idle" | "confirm">("idle");
  const [fbEnabled, setFbEnabled] = React.useState(data.facebook.enabled);
  const [fbError, setFbError] = React.useState<string | null>(null);
  const [posted, setPosted] = React.useState<{ at: string; url: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  // Facebook-ийн алхам солигдоход фокусыг алдахгүй (unmount болсон товчноос <body> руу унахгүй).
  const fbRef = React.useRef<HTMLDivElement>(null);
  const focusNext = React.useRef<"confirm" | "trigger" | "posted" | null>(null);
  React.useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    const sel = want === "confirm" ? "[data-fb-confirm] button" : want === "trigger" ? "[data-fb-trigger]" : "[data-fb-posted]";
    fbRef.current?.querySelector<HTMLElement>(sel)?.focus();
  }, [fbStep, posted]);

  if (!data.active) {
    return <p className="text-sm text-muted">Зар нийтэд идэвхтэй үед түгээнэ.</p>;
  }

  const summary = channelsFromRecord(data.stats);
  const statsLine = (ch: ShareChannel) =>
    `30 хоногт: ${formatCountsLine(data.stats[SHARE_CHANNELS[ch].source] ?? ZERO_COUNTS)}`;

  function publish() {
    setFbError(null);
    startTransition(async () => {
      try {
        const res = await postListingToFacebook({ listing_id: data.listingId, message: fbText });
        if (res.ok) {
          focusNext.current = "posted";
          setFbEnabled(false);
          setFbStep("idle");
          setPosted({ at: new Date().toISOString(), url: res.postUrl });
          toast.success("Оффисын хуудсанд нийтэллээ", {
            action: { label: "Харах", onClick: () => window.open(res.postUrl, "_blank", "noopener,noreferrer") },
          });
        } else {
          setFbError(res.error);
        }
      } catch {
        setFbError("Алдаа гарлаа. Дахин оролдоно уу.");
      }
    });
  }

  const lastAt = posted?.at ?? data.facebook.lastPostedAt;
  const lastUrl = posted?.url ?? data.facebook.lastPostUrl;
  const lastPending = !posted && data.facebook.lastPostPending;

  return (
    <div className="space-y-4">
      <section aria-labelledby="share-kit-summary" className="rounded-xl bg-surface-2 p-3">
        <h3 id="share-kit-summary" className="text-xs font-semibold text-muted">
          Сувгаар · сүүлийн 30 хоног
        </h3>
        {summary.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Одоогоор хэмжилт алга.</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-ink">
            {summary.map((s) => (
              <li key={s.channel} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
                <span className="font-medium">{channelLabel(s.channel)}</span>
                <span className="text-muted">{formatCountsLine(s)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Tabs
        items={SHARE_CHANNEL_ORDER.map((ch) => ({ value: ch, label: SHARE_CHANNELS[ch].label }))}
        value={tab}
        onValueChange={(v) => setTab(v as ShareChannel)}
      />

      <TabPanel when="facebook" value={tab} className="space-y-3">
        <div ref={fbRef} className="space-y-3">
          <p className="text-xs text-muted">{statsLine("facebook")}</p>
          {fbStep === "confirm" ? (
            <div
              data-fb-confirm
              role="group"
              aria-labelledby="share-kit-fb-confirm"
              className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3"
            >
              <p id="share-kit-fb-confirm" className="text-sm font-semibold text-ink">
                Оффисын Facebook хуудсанд нийтлэх үү?
              </p>
              <p className="max-h-60 overflow-y-auto whitespace-pre-line break-words rounded-xl bg-surface p-3 text-sm text-ink">
                {fbText}
              </p>
              <p className="text-xs text-muted">Нийтэлсэн постыг эндээс буцааж устгахгүй.</p>
              {fbError ? (
                <p role="alert" className="text-sm text-danger">{fbError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="touch" onClick={publish} disabled={pending} aria-busy={pending}>
                  <Send className="size-4" aria-hidden /> {pending ? "Нийтэлж байна…" : "Нийтлэх"}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  variant="outline"
                  disabled={pending}
                  aria-busy={pending}
                  onClick={() => {
                    focusNext.current = "trigger";
                    setFbStep("idle");
                    setFbError(null);
                  }}
                >
                  Болих
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="share-kit-fb">Facebook-ийн текст</label>
              <textarea
                id="share-kit-fb"
                rows={8}
                className={textareaClass}
                value={fbText}
                onChange={(e) => setFbText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <CopyButtons text={fbText} link={data.links.facebook} />
                <a
                  href={facebookSharerUrl(data.links.facebook)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  <ExternalLink className="size-4" aria-hidden /> Facebook-т хуваалцах
                </a>
                {fbEnabled ? (
                  <Button
                    type="button"
                    size="touch"
                    variant="secondary"
                    data-fb-trigger
                    onClick={() => {
                      focusNext.current = "confirm";
                      setFbError(null);
                      setFbStep("confirm");
                    }}
                  >
                    <Send className="size-4" aria-hidden /> Оффисын хуудсанд нийтлэх
                  </Button>
                ) : null}
              </div>
              {fbError ? (
                <p role="alert" className="text-sm text-danger">{fbError}</p>
              ) : null}
            </>
          )}
          {lastAt ? (
            <p data-fb-posted tabIndex={-1} role="status" className="text-xs text-muted focus:outline-none">
              {lastPending ? (
                "Нийтлэл баталгаажаагүй — Facebook хуудсаа шалгана уу."
              ) : (
                <>
                  Хуудсанд нийтэлсэн: {fmtDateTime(lastAt)}
                  {lastUrl ? (
                    <>
                      {" · "}
                      <a href={lastUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                        Постыг харах
                      </a>
                    </>
                  ) : null}
                </>
              )}
            </p>
          ) : null}
        </div>
      </TabPanel>

      <TabPanel when="viber" value={tab} className="space-y-3">
        <p className="text-xs text-muted">{statsLine("viber")}</p>
        <label className="sr-only" htmlFor="share-kit-viber">Viber-ийн текст</label>
        <textarea
          id="share-kit-viber"
          rows={8}
          className={textareaClass}
          value={viberText}
          onChange={(e) => setViberText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <CopyButtons text={viberText} link={data.links.viber} />
          <a href={viberForwardUrl(viberText)} className={linkClass}>
            <Send className="size-4" aria-hidden /> Viber-ээр илгээх
          </a>
        </div>
        <p className="text-xs text-muted">Viber апп суусан утас, компьютер дээр нээгдэнэ. Эс бөгөөс текстээ хуулж групптээ тавина уу.</p>
      </TabPanel>

      <TabPanel when="unegui" value={tab} className="space-y-3">
        <p className="text-xs text-muted">{statsLine("unegui")}</p>
        <CopyRow label="Гарчиг" value={data.texts.unegui.title} />
        <CopyRow label="Үнэ (₮)" value={data.texts.unegui.price} />
        <label className="block text-xs font-semibold text-muted" htmlFor="share-kit-unegui">Тайлбар</label>
        <textarea
          id="share-kit-unegui"
          rows={8}
          className={textareaClass}
          value={uneguiBody}
          onChange={(e) => setUneguiBody(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <CopyButtons text={uneguiBody} link={data.links.unegui} />
          <a href={UNEGUI_POST_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink className="size-4" aria-hidden /> unegui.mn нээх
          </a>
        </div>
        <p className="text-xs text-muted">
          unegui.mn-д нэвтэрч «Зар нэмэх» хэсэгт гарчиг, үнэ, тайлбараа тус тусад нь хуулж тавина. Зургийг доороос татаж оруулна уу.
        </p>
      </TabPanel>

      {data.photos.length > 0 ? (
        <section aria-labelledby="share-kit-photos">
          <h3 id="share-kit-photos" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Download className="size-4" aria-hidden /> Зураг ({data.photos.length})
          </h3>
          <p className="text-xs text-muted">Зураг дээр оффисын тамга дарагдсан.</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {data.photos.map((p, i) => (
              <li key={p.url}>
                <a
                  href={p.downloadUrl}
                  download
                  aria-label={`Зураг ${i + 1} татах`}
                  className="block overflow-hidden rounded-lg border border-line hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- татах холбоосын жижиг урьдчилсан зураг */}
                  <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
