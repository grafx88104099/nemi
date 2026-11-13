import type { LucideIcon } from "lucide-react";
import { CloudOff, Construction, FileSearch, Inbox, Lock, SearchX } from "lucide-react";

import { EmptyState, type EmptyStateAction } from "@/components/ui/empty-state";
import { COMING_LATER_TEXT } from "@/lib/crm2/labels";

/**
 * CRM v2-ийн хоосон төлөвүүд (components/ui/empty-state дээр).
 */

/** Жагсаалт хоосон. filtered=true бол «шүүлтүүрт тохирох зүйл алга» хэлбэр. */
export function Crm2Empty({
  title,
  description,
  icon = Inbox,
  action,
  filtered = false,
  onClear,
  compact,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: EmptyStateAction;
  filtered?: boolean;
  /** Шүүлтүүр цэвэрлэх холбоос (href) эсвэл товч. */
  onClear?: EmptyStateAction;
  compact?: boolean;
  className?: string;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title="Шүүлтүүрт тохирох зүйл олдсонгүй"
        description="Хайлтын үг эсвэл шүүлтүүрээ өөрчилж үзнэ үү."
        action={onClear}
        compact={compact}
        className={className}
      />
    );
  }
  return (
    <EmptyState icon={icon} title={title} description={description} action={action} compact={compact} className={className} />
  );
}

/**
 * Уншиж чадсангүй (DB, эрх, сүлжээний алдаа) — хоосон жагсаалтаас ялгана.
 * retryHref = одоогийн холбоос (дахин ачаална).
 */
export function LoadErrorState({
  title = "Ачаалахад алдаа гарлаа",
  description = "Мэдээллийг уншиж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.",
  retryHref,
  compact,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  retryHref?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <EmptyState
      icon={CloudOff}
      title={title}
      description={description}
      action={retryHref ? { label: "Дахин оролдох", href: retryHref } : undefined}
      compact={compact}
      className={className}
    />
  );
}

/** Эрхгүй (жишээ: хувийн талбар, гэрээ, тохиргоо). */
export function NoAccessState({
  title = "Харах эрхгүй",
  description = "Энэ мэдээлэл зөвхөн эрх бүхий ажилтанд харагдана.",
  compact,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return <EmptyState icon={Lock} title={title} description={description} compact={compact} className={className} />;
}

/** Олдсонгүй (устгагдсан, эрхгүй эсвэл буруу холбоос). */
export function NotFoundState({
  title = "Олдсонгүй",
  description = "Бичлэг олдсонгүй эсвэл харах эрхгүй байна.",
  backHref,
  backLabel = "Жагсаалт руу буцах",
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <EmptyState
      icon={FileSearch}
      title={title}
      description={description}
      action={backHref ? { label: backLabel, href: backHref } : undefined}
      className={className}
    />
  );
}

/** Дараагийн шатанд нээгдэх цэс (Миний ажил, Хүлээлэг, Санхүү, Тайлан). */
export function ComingSoonState({
  title,
  description = `${COMING_LATER_TEXT}.`,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  className?: string;
}) {
  return <EmptyState icon={Construction} title={title} description={description} action={action} className={className} />;
}
