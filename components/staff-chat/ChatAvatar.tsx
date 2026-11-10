import { Users, UsersRound } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { personAvatar } from "@/lib/crm/avatar";
import type { StaffChatKind } from "@/lib/staff-chat";
import { cn } from "@/lib/utils";

/** Шууд чатад хүний зураг, бүлэг ба багт дүрс. */
export function ChatAvatar({
  kind,
  avatarUrl,
  name,
  size = "md",
}: {
  kind: StaffChatKind;
  avatarUrl?: string | null;
  name: string;
  size?: "sm" | "md";
}) {
  if (kind === "direct") {
    const { src, initials } = personAvatar(avatarUrl ?? null, name);
    return <Avatar src={src} initials={initials} size={size} className="shrink-0" />;
  }
  const Icon = kind === "team" ? UsersRound : Users;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700",
        size === "sm" ? "size-7" : "size-10"
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}
