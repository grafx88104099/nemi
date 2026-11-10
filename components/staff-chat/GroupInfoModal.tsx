"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { addGroupMembers, leaveGroupChat } from "@/lib/actions/staff-chat";
import type { StaffChatKind, StaffChatPerson } from "@/lib/staff-chat";

import { ChatAvatar } from "./ChatAvatar";
import { PersonPicker } from "./PersonPicker";
import { useStaffChatShell } from "./StaffChatShell";

const FALLBACK_ERR = "Алдаа гарлаа. Дахин оролдоно уу.";

type Result = { ok: boolean; error?: string };

/** Бүлэгт гишүүн нэмэх, гарах боломжтой; багийн чатын гишүүнчлэлийг баг өөрөө тодорхойлно. */
export function GroupInfoModal({
  chatId,
  kind,
  title,
  people,
  onMembersChanged,
  onClose,
}: {
  chatId: string;
  kind: StaffChatKind;
  title: string;
  people: StaffChatPerson[];
  onMembersChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { basePath, currentUserId, refreshInbox } = useStaffChatShell();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const memberIds = useMemo(() => new Set(people.map((p) => p.profile_id)), [people]);
  const isGroup = kind === "group";

  function toggle(profileId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(profileId)) next.add(profileId);
      return next;
    });
  }

  function addSelected() {
    startTransition(async () => {
      const result: Result = await addGroupMembers({ chatId, memberIds: [...selected] }).catch(() => ({ ok: false }));
      if (!result.ok) {
        toast.error(result.error ?? FALLBACK_ERR);
        return;
      }
      await onMembersChanged();
      refreshInbox();
      setSelected(new Set());
      setAdding(false);
      toast.success("Гишүүд нэмэгдлээ");
    });
  }

  function leave() {
    if (!window.confirm(`«${title}» бүлгээс гарах уу?`)) return;
    startTransition(async () => {
      const result: Result = await leaveGroupChat(chatId).catch(() => ({ ok: false }));
      if (!result.ok) {
        toast.error(result.error ?? FALLBACK_ERR);
        return;
      }
      refreshInbox();
      onClose();
      router.replace(basePath);
    });
  }

  if (adding) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Гишүүн нэмэх"
        footer={
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Буцах
            </Button>
            <Button type="button" disabled={selected.size === 0 || pending} onClick={addSelected}>
              Нэмэх{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
        }
      >
        <div className="p-4">
          <PersonPicker selected={selected} excludeIds={memberIds} onPick={toggle} disabled={pending} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        isGroup ? (
          <div className="flex flex-wrap justify-between gap-2 border-t border-line p-4">
            <Button type="button" variant="outline" className="text-danger" disabled={pending} onClick={leave}>
              <LogOut className="size-4" /> Бүлгээс гарах
            </Button>
            <Button type="button" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" /> Гишүүн нэмэх
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{people.length} гишүүн</p>
        <ul className="space-y-1">
          {people.map((person) => (
            <li key={person.profile_id} className="flex min-h-10 items-center gap-3">
              <ChatAvatar kind="direct" avatarUrl={person.avatar_url} name={person.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{person.name}</span>
              {person.profile_id === currentUserId ? <span className="shrink-0 text-xs text-muted">Та</span> : null}
            </li>
          ))}
        </ul>
        {kind === "team" ? (
          <p className="mt-3 text-xs text-muted">Багийн гишүүнчлэл багийн бүрэлдэхүүнээр автоматаар шинэчлэгдэнэ.</p>
        ) : null}
      </div>
    </Modal>
  );
}
