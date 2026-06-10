"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

const MAX_PHOTOS = 20;
const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

export function MultiPhotoUpload({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const full = value.length >= MAX_PHOTOS;

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // ижил файлыг дахин сонгох боломжтой болгох
    if (!picked.length) return;
    setErr(null);

    const room = MAX_PHOTOS - value.length;
    if (room <= 0) { setErr(`Дээд тал нь ${MAX_PHOTOS} зураг оруулна.`); return; }

    // Тоо/хэмжээ/төрлийг шалгаж шүүнэ.
    const problems: string[] = [];
    const files: File[] = [];
    for (const file of picked) {
      if (files.length >= room) { problems.push(`${MAX_PHOTOS} зургийн хязгаар хэтэрсэн тул зарим нь алгассан`); break; }
      if (!file.type.startsWith("image/")) { problems.push(`${file.name}: зураг биш`); continue; }
      if (file.size > MAX_SIZE) { problems.push(`${file.name}: 8MB-аас том`); continue; }
      files.push(file);
    }
    if (!files.length) { setErr(problems.join("; ")); return; }

    setUploading(true);
    const supabase = createClient();
    // Зэрэг upload хийгээд дарааллыг хадгална (index map).
    const results = await Promise.all(
      files.map(async (file, i) => {
        const raw = (file.name.split(".").pop() ?? "").toLowerCase();
        const ext = ALLOWED_EXT.includes(raw) ? raw : "jpg";
        const path = `${Date.now()}-${i}-${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error } = await supabase.storage.from("listings").upload(path, file);
        if (error) return { error: error.message, url: null as string | null };
        return { error: null, url: supabase.storage.from("listings").getPublicUrl(path).data.publicUrl };
      })
    );
    const urls = results.map((r) => r.url).filter((u): u is string => !!u);
    const failCount = results.filter((r) => r.error).length;
    if (failCount) problems.push(`${failCount} зураг хуулж чадсангүй`);
    if (problems.length) setErr(problems.join("; "));
    if (urls.length) onChange([...value, ...urls]);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-24 w-32 rounded-lg object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-brand-500 px-1 text-[10px] font-bold text-white">Үндсэн</span>
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute -right-2 -top-2 rounded-full bg-danger p-0.5 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {!full && (
          <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600">
            <Upload className="size-5" />
            <span className="text-xs">{uploading ? "Хуулж байна..." : "Зураг нэмэх"}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} disabled={uploading} />
          </label>
        )}
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="text-xs text-subtle">Эхний зураг үндсэн зураг болно. ({value.length}/{MAX_PHOTOS}, файл бүр ≤8MB)</p>
    </div>
  );
}
