"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellPlus } from "lucide-react";

import { createTask } from "@/lib/crm2/actions/tasks";
import { isoToUbInput } from "@/lib/crm2/datetime";
import { TASK_KIND_LABEL } from "@/lib/crm2/labels";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/crm2/ui";

/**
 * T10: хүлээж буй харилцагчид «Сануулга тавих» — crm2_tasks-д «Эргэж залгах»
 * ажил (харилцагч + шаардлагад холбоотой) үүсгэнэ. «Миний ажил»-д харагдана.
 * Хариуцагчийг DB тогтооно (анхдагч — өөрөө).
 */

/** Анхдагч хугацаа: маргааш 10:00 (УБ). */
function defaultDue(now: number = Date.now()): string {
  const tomorrow = isoToUbInput(now + 86_400_000);
  return tomorrow ? `${tomorrow.slice(0, 10)}T10:00` : "";
}

export function ReminderButton({
  contactId,
  contactName,
  requirementId,
  hasReminder = false,
}: {
  contactId: string;
  contactName: string;
  requirementId: string;
  /** Нээлттэй сануулга аль хэдийн байгаа бол товчны нэр «нэмэх». */
  hasReminder?: boolean;
}) {
  const router = useRouter();
  const ids = React.useId();
  const [open, setOpen] = React.useState(false);
  const [due, setDue] = React.useState("");
  const [note, setNote] = React.useState("");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="touch"
        onClick={() => {
          // Цагийг цонх нээхэд л тооцно (сервер/хөтчийн зөрүүгүй).
          setDue(defaultDue());
          setNote("");
          setOpen(true);
        }}
      >
        <BellPlus className="size-4" aria-hidden />
        {hasReminder ? "Сануулга нэмэх" : "Сануулга тавих"}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Сануулга тавих — ${contactName}`}
        description={`«${TASK_KIND_LABEL.call_back}» ажил болж «Миний ажил»-д харагдана. Шаардлагатай нь холбогдоно.`}
        confirmLabel="Сануулга хадгалах"
        disabled={!due}
        onConfirm={async () => {
          const res = await createTask({
            kind: "call_back",
            due_at: due,
            note,
            contact_id: contactId,
            requirement_id: requirementId,
          });
          if (!res.ok) return res.error;
          toast.success("Сануулга тавилаа", { description: "«Миний ажил»-д харагдана." });
          router.refresh();
          return null;
        }}
      >
        <Field label="Хугацаа" htmlFor={`${ids}-due`} hint="Хугацаа заавал — сануулга хугацаагаараа эрэмбэлэгдэнэ.">
          <Input id={`${ids}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Тэмдэглэл (заавал биш)" htmlFor={`${ids}-note`} hint={`${note.length}/1000`}>
          <Input
            id={`${ids}-note`}
            value={note}
            maxLength={1000}
            placeholder="Жишээ: шинэ хөрөнгө гарвал залгах"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
