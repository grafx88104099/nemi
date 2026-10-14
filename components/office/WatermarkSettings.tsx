"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";

import { updateMyOfficeWatermark } from "@/lib/actions/offices";
import { applyWatermark } from "@/lib/watermark";
import { cn } from "@/lib/utils";

/** Урьдчилсан харагдацын эх зураг: оффисын зарын зураг, эс бөгөөс зурсан жишээ. */
async function sampleFile(url: string | null): Promise<File> {
  if (url) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (res.ok) {
        const blob = await res.blob();
        return new File([blob], "sample.jpg", { type: blob.type || "image/jpeg" });
      }
    } catch {
      // Доорх жишээ зураг руу шилжинэ.
    }
  }
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 800;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const sky = ctx.createLinearGradient(0, 0, 0, 800);
  sky.addColorStop(0, "#cfe3f4");
  sky.addColorStop(1, "#9fb6c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = "#e7dfd2";
  ctx.fillRect(330, 260, 540, 540);
  ctx.fillStyle = "#7d8f9d";
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) ctx.fillRect(370 + col * 125, 300 + row * 120, 80, 70);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/png")
  );
  return new File([blob], "sample.png", { type: "image/png" });
}

export function WatermarkSettings({
  initialEnabled,
  logoUrl,
  label,
  samplePhotoUrl,
}: {
  initialEnabled: boolean;
  logoUrl: string | null;
  label: string;
  samplePhotoUrl: string | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const stamped = await applyWatermark(await sampleFile(samplePhotoUrl), { logoUrl, label });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(stamped);
        setPreview(objectUrl);
      } catch {
        if (!cancelled) setPreviewFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [samplePhotoUrl, logoUrl, label]);

  function toggle() {
    const next = !enabled;
    setErr(null);
    setEnabled(next);
    startTransition(async () => {
      const r = await updateMyOfficeWatermark(next);
      if ("error" in r && r.error) {
        setEnabled(!next);
        setErr("Тохиргоо хадгалахад алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-base font-bold text-ink">Зарын зургийн лого тамга</h2>
          <p className="mt-1 text-sm text-muted">
            Асаалттай үед танай оффисын агентуудын шинээр оруулах зарын зураг бүрд оффисын лого бүдэг
            тамга болж автоматаар дарагдана.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Зарын зургийн лого тамга"
          onClick={toggle}
          disabled={pending}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60",
            enabled ? "bg-brand-500" : "bg-line-strong"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
              enabled ? "left-[22px]" : "left-0.5"
            )}
          />
        </button>
      </div>

      {!logoUrl && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Оффисын лого оруулаагүй тул «{label}» нэрээр текст тамга дарна. Логог «Танилцуулга» хэсгээс оруулна уу.
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-subtle">
          Урьдчилсан харагдац{samplePhotoUrl ? " — танай зарын зураг дээр" : ""}
          {!enabled && " (одоо унтраалттай)"}
        </p>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Лого тамга дарагдсан зургийн жишээ"
            className={cn("w-full max-w-xl rounded-xl border border-line", !enabled && "opacity-60")}
          />
        ) : previewFailed ? (
          <div className="flex aspect-[3/2] w-full max-w-xl flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-sm text-muted">
            <ImageOff className="size-5" />
            Урьдчилсан харагдац үүсгэж чадсангүй
          </div>
        ) : (
          <div className="aspect-[3/2] w-full max-w-xl animate-pulse rounded-xl bg-surface-2" />
        )}
      </div>

      <p className="text-xs text-subtle">
        Тамга зөвхөн шинээр оруулах зурагт дарагдана — өмнө оруулсан зураг өөрчлөгдөхгүй.
      </p>
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
