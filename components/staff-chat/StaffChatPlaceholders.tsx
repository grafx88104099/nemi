import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

/** Чат сонгоогүй үеийн баруун тал (зөвхөн lg-ээс дээш харагдана). */
export function StaffChatNoSelection() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        compact
        icon={MessagesSquare}
        title="Чат сонгоно уу"
        description="Зүүн талаас чат сонгох эсвэл шинээр эхлүүлнэ үү."
      />
    </div>
  );
}

export function StaffChatNotFound({ basePath }: { basePath: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-semibold text-ink">Чат олдсонгүй</p>
      <p className="max-w-sm text-sm text-muted">Энэ чат байхгүй эсвэл та гишүүн нь биш байна.</p>
      <Link href={basePath} className="text-sm font-semibold text-brand-700 hover:underline">
        Чатын жагсаалт руу буцах
      </Link>
    </div>
  );
}

export function StaffChatThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Ачаалж байна">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <div className="size-7 animate-pulse rounded-full bg-surface-2" />
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-surface-2" />
        <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-10 w-3/5 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
