"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/** Зураг Supabase Storage ('listings' bucket) рүү upload хийж public URL буцаана. */
export function PhotoUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const { error } = await supabase.storage.from("listings").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      setErr(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("listings").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-40 w-60 rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-2 -top-2 rounded-full bg-danger p-1 text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label className="flex h-40 w-60 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600">
          <Upload className="size-6" />
          <span className="text-sm">{uploading ? "Хуулж байна..." : "Зураг сонгох"}</span>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
        </label>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
