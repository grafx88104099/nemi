"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

const OFFICE_ASSET_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const OFFICE_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export function OfficeImageUpload({
  value,
  onChange,
  label,
  variant = "wide",
  previewClassName = "object-cover",
  disabledHint,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  variant?: "wide" | "square";
  /** Урьдчилсан зургийн нэмэлт класс (ж: цагаан логог бараан дэвсгэр дээр харуулах). */
  previewClassName?: string;
  /** Оруулах боломжгүй үеийн тайлбар (ж: батлагдаагүй агент — storage-ийн бодлого хориглоно). */
  disabledHint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Bucket-ийн хязгаартай ижил (20261125000200): JPEG/PNG/WebP/AVIF, ≤10MB.
    const ext = OFFICE_ASSET_TYPES[file.type];
    if (!ext) {
      setErr("Зөвхөн JPEG, PNG, WebP эсвэл AVIF зураг оруулна.");
      return;
    }
    if (file.size > OFFICE_ASSET_MAX_BYTES) {
      setErr("Зураг 10MB-аас ихгүй байх ёстой.");
      return;
    }
    setUploading(true);
    setErr(null);
    const supabase = createClient();
    // Storage-ийн бодлого: зөвхөн <өөрийн uid>/ хавтсанд (оффисын админ эсвэл идэвхтэй агент).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErr("Нэвтэрнэ үү.");
      setUploading(false);
      return;
    }
    const path = `${user.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { error } = await supabase.storage.from("office-assets").upload(path, file, { contentType: file.type });
    if (error) {
      setErr("Зураг хуулж чадсангүй. Дахин оролдоно уу.");
      setUploading(false);
      return;
    }
    onChange(supabase.storage.from("office-assets").getPublicUrl(path).data.publicUrl);
    setUploading(false);
  }

  const box = variant === "wide" ? "h-28 w-full" : "size-24";

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-ink">{label}</div>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className={`${box} rounded-xl border border-line ${previewClassName}`} />
            <button type="button" onClick={() => onChange("")} className="absolute -right-2 -top-2 rounded-full bg-danger p-0.5 text-white">
              <X className="size-3.5" />
            </button>
          </div>
        ) : disabledHint ? (
          <p className="text-sm text-muted">{disabledHint}</p>
        ) : (
          <label className={`flex ${box} cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600`}>
            <Upload className="size-5" />
            <span className="text-xs">{uploading ? "Хуулж байна..." : "Зураг сонгох"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
