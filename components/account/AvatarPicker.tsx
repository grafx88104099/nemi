"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";

import { removeMyAvatar, setMyAvatar } from "@/lib/actions/avatar";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  AVATAR_SIZE,
  AVATAR_SOURCE_MAX_BYTES,
  avatarExtension,
  avatarObjectPath,
  randomAvatarNonce,
  squareCrop,
} from "@/lib/avatar-upload";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

/** Зургийг төвөөс дөрвөлжин тайрч AVATAR_SIZE хүртэл жижигрүүлээд webp (боломжгүй бол jpeg) болгоно. */
async function toAvatarBlob(file: File): Promise<Blob> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } catch {
    // createImageBitmap-гүй / тайлж чадаагүй хөтөч: <img>-ээр (EXIF эргэлтийг хөтөч өөрөө хийнэ).
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    try {
      await img.decode();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }

  try {
    const { sx, sy, side } = squareCrop(width, height);
    const out = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    // Тунгалаг PNG jpeg болоход хар дэвсгэр гарахгүй.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, side, side, 0, 0, out, out);
    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    const webp = await encode("image/webp", 0.85);
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await encode("image/jpeg", 0.88);
    if (!jpeg) throw new Error("encode");
    return jpeg;
  } finally {
    cleanup();
  }
}

/**
 * Бүртгэлийн зураг: дээр нь дарж шинэ зураг сонгоно (утсанд камер/цомог). Хөтөч шахаад
 * avatars/<uid>/ руу байршуулж, сервер profiles.avatar_url-ийг солино.
 */
export function AvatarPicker({
  userId,
  initials,
  src,
  size = "md",
  color = "#0F172A",
  allowRemove = false,
  onChange,
  className,
}: {
  userId: string;
  initials: string;
  src: string | null;
  size?: "md" | "lg";
  color?: string;
  /** «Зураг арилгах» холбоос (профайл хуудсанд). */
  allowRemove?: boolean;
  onChange?: (url: string | null) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(src);
  const [seenSrc, setSeenSrc] = useState(src);
  // Сервер шинэ утга өгвөл (router.refresh, өөр таб) түүнийг дагана.
  if (src !== seenSrc) {
    setSeenSrc(src);
    setCurrent(src);
  }

  function applied(url: string | null) {
    setCurrent(url);
    onChange?.(url);
    router.refresh();
  }

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Зөвхөн зураг сонгоно уу.");
    if (file.size > AVATAR_SOURCE_MAX_BYTES) return setError("Зураг хэт том байна (25MB хүртэл).");
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await toAvatarBlob(file);
      } catch {
        return setError("Энэ зургийг уншиж чадсангүй. JPG эсвэл PNG зураг сонгоно уу.");
      }
      const ext = avatarExtension(blob.type);
      if (!ext || blob.size > AVATAR_MAX_BYTES) return setError("Зургийг боловсруулж чадсангүй.");
      const path = avatarObjectPath(userId, randomAvatarNonce(), ext);
      const { error: upError } = await createClient()
        .storage.from(AVATAR_BUCKET)
        // Кэш богино: файлын нэр бүр шинэ тул урт кэш хэрэггүй, харин арилгасан зураг CDN-д удаан үлдэхгүй.
        .upload(path, blob, { contentType: blob.type, cacheControl: "3600", upsert: false });
      if (upError) return setError("Зураг байршуулж чадсангүй. Дахин оролдоно уу.");
      const res = await setMyAvatar(path);
      if (!res.ok) return setError(res.error);
      applied(res.url);
    } catch {
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await removeMyAvatar();
      if (!res.ok) return setError(res.error);
      applied(null);
    } catch {
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  }

  const badge = size === "lg" ? "size-6" : "size-5";
  return (
    <div className={cn("relative flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={current ? "Зураг солих" : "Зураг нэмэх"}
        title={current ? "Зураг солих" : "Зураг нэмэх"}
        className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-wait"
      >
        <Avatar initials={initials} src={current} size={size} color={color} alt="" />
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-brand-500 text-white ring-2 ring-surface transition group-hover:bg-brand-600",
            badge
          )}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
        </span>
        {busy ? <span aria-hidden className="absolute inset-0 rounded-full bg-white/50" /> : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {allowRemove && current && !busy ? (
        <button type="button" onClick={() => void remove()} className="min-h-6 text-xs text-muted underline hover:text-danger">
          Зураг арилгах
        </button>
      ) : null}
      {busy ? (
        <span role="status" className="sr-only">
          Зураг байршуулж байна…
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-48 text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
