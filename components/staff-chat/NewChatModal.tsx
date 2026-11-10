"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { createGroupChat, openDirectChat } from "@/lib/actions/staff-chat";
import { cn } from "@/lib/utils";

import { PersonPicker } from "./PersonPicker";
import { useStaffChatShell } from "./StaffChatShell";

const FALLBACK_ERR = "Чат нээж чадсангүй. Дахин оролдоно уу.";

type Mode = "direct" | "group";
type OpenResult = { ok: boolean; error?: string; id?: string };

export function NewChatModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { basePath, refreshInbox } = useStaffChatShell();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("direct");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  function open(fn: () => Promise<OpenResult>) {
    startTransition(async () => {
      const result: OpenResult = await fn().catch(() => ({ ok: false }));
      if (!result.ok || !result.id) {
        toast.error(result.error ?? FALLBACK_ERR);
        return;
      }
      refreshInbox();
      onClose();
      router.push(`${basePath}/${result.id}`);
    });
  }

  function toggle(profileId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(profileId)) next.add(profileId);
      return next;
    });
  }

  const canCreateGroup = name.trim().length > 0 && selected.size > 0 && !pending;

  return (
    <Modal
      open
      onClose={onClose}
      title="Шинэ чат"
      footer={
        mode === "group" ? (
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Болих
            </Button>
            <Button
              type="button"
              disabled={!canCreateGroup}
              onClick={() => open(() => createGroupChat({ name, memberIds: [...selected] }))}
            >
              Бүлэг үүсгэх{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          <ModeButton active={mode === "direct"} onClick={() => setMode("direct")}>
            Хүнтэй чатлах
          </ModeButton>
          <ModeButton active={mode === "group"} onClick={() => setMode("group")}>
            Бүлэг үүсгэх
          </ModeButton>
        </div>

        {mode === "group" ? (
          <>
            <Field label="Бүлгийн нэр" htmlFor="staff-chat-group-name">
              <Input
                id="staff-chat-group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="text-base lg:text-sm"
              />
            </Field>
            <PersonPicker selected={selected} onPick={toggle} disabled={pending} />
          </>
        ) : (
          <PersonPicker onPick={(id) => open(() => openDirectChat(id))} disabled={pending} />
        )}
      </div>
    </Modal>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 rounded-lg px-3 text-sm font-semibold transition",
        active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
