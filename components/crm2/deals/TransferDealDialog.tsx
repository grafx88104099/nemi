"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ReasonDialog } from "@/components/crm2/ui/reason-dialog";
import { transferDeal } from "@/lib/crm2/actions/deals";

import type { StaffOption } from "./types";

/**
 * Хэлцлийг өөр агентад шилжүүлэх: батлагч (эсвэл хоёр агентын ахлагч) бол шууд,
 * бусад тохиолдолд батлах хүсэлт үүснэ. Нээлттэй ажил хамт шилжинэ.
 */
export function TransferDealDialog({
  open,
  onClose,
  dealId,
  currentAgentId,
  staff,
  me,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  currentAgentId: string;
  staff: StaffOption[];
  me: string | null;
}) {
  const router = useRouter();
  const ids = React.useId();
  const [to, setTo] = React.useState("");
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTo("");
  }
  const options = staff.filter((s) => s.id !== currentAgentId);

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Хэлцэл шилжүүлэх"
      description="Эрх бүхий хүн (батлагч эсвэл хоёр агентын багийн ахлагч) бол шууд шилжинэ, бусад тохиолдолд батлах хүсэлт илгээгдэнэ. Нээлттэй ажил шинэ хариуцагчид шилжинэ."
      label="Шилжүүлэх шалтгаан"
      placeholder="Яагаад шилжүүлж байгааг бичнэ үү"
      confirmLabel="Шилжүүлэх"
      onSubmit={async ({ text }) => {
        if (!to) return "Шинэ хариуцагчийг сонгоно уу.";
        const res = await transferDeal({ deal_id: dealId, to_agent_id: to, reason: text });
        if (!res.ok) return res.error;
        if (res.data === "pending") {
          toast.success("Шилжүүлэх хүсэлт илгээгдлээ", { description: "Батлагдсаны дараа хэлцэл шинэ хариуцагчид шилжинэ." });
        } else {
          toast.success("Хэлцэл шилжлээ");
        }
        router.refresh();
        return null;
      }}
    >
      <Field label="Шинэ хариуцагч" htmlFor={`${ids}-to`}>
        <Select id={`${ids}-to`} value={to} onChange={(e) => setTo(e.target.value)} required>
          <option value="">Агент сонгоно уу</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === me ? `${s.name} (би)` : s.name}
            </option>
          ))}
        </Select>
      </Field>
    </ReasonDialog>
  );
}
