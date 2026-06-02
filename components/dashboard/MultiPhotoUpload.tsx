"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export function MultiPhotoUpload({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setErr(null);
    const supabase = createClient();
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
      const { error } = await supabase.storage.from("listings").upload(path, file);
      if (error) {
        setErr(error.message);
        continue;
      }
      urls.push(supabase.storage.from("listings").getPublicUrl(path).data.publicUrl);
    }
    onChange([...value, ...urls]);
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
        <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600">
          <Upload className="size-5" />
          <span className="text-xs">{uploading ? "Хуулж байна..." : "Зураг нэмэх"}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} disabled={uploading} />
        </label>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="text-xs text-subtle">Эхний зураг үндсэн зураг болно.</p>
    </div>
  );
}
