"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export function OfficeImageUpload({
  value,
  onChange,
  label,
  variant = "wide",
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  variant?: "wide" | "square";
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
    const { error } = await supabase.storage.from("office-assets").upload(path, file);
    if (error) {
      setErr(error.message);
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
            <img src={value} alt="" className={`${box} rounded-xl border border-line object-cover`} />
            <button type="button" onClick={() => onChange("")} className="absolute -right-2 -top-2 rounded-full bg-danger p-0.5 text-white">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <label className={`flex ${box} cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand-300 hover:text-brand-600`}>
            <Upload className="size-5" />
            <span className="text-xs">{uploading ? "Хуулж байна..." : "Зураг сонгох"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
