import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Нэрийн эхний үсгүүд (Аватарт). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + second).toUpperCase();
}

/**
 * Агент (аватар + нэр). role — «Листлэгч агент» г.м. жижиг гарчиг.
 * Нэргүй (томилоогүй) бол «Томилоогүй» гэж бүдэг харуулна.
 */
export function AgentChip({
  name,
  avatarUrl,
  role,
  size = "sm",
  className,
  emptyLabel = "Томилоогүй",
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  role?: string;
  size?: "sm" | "md";
  className?: string;
  emptyLabel?: string;
}) {
  const has = !!name?.trim();
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {has ? (
        <Avatar initials={initials(name)} src={avatarUrl} size={size} className="shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-subtle",
            size === "sm" ? "size-7 text-[10px]" : "size-10 text-xs"
          )}
        >
          ?
        </span>
      )}
      <span className="min-w-0 leading-tight">
        {role ? <span className="block truncate text-[11px] text-muted">{role}</span> : null}
        <span className={cn("block truncate text-sm", has ? "font-medium text-ink" : "text-subtle")}>
          {has ? name : emptyLabel}
        </span>
      </span>
    </span>
  );
}
