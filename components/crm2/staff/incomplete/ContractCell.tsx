"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2 } from "lucide-react";

import { ContractSheet } from "@/components/crm2/staff/card/contract/ContractSheet";
import { loadContractContext } from "@/components/crm2/staff/card/contract/actions";
import type { ContractContext } from "@/components/crm2/staff/card/contract/contract-types";
import type { Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2BrokerageRow, Crm2StaffMember } from "@/lib/crm2/types";
import { cn } from "@/lib/utils";

export type ContractCellProps = {
  propertyId: string;
  officeId: string;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  /** Нүдний бичвэр (дараагийн алхам гэрээний бүлэгт бол түүний текст). */
  label: string;
  needsWork: boolean;
};

/** Шалгах жагсаалтад тооцох гэрээ: хүчинтэй нь, эс бөгөөс сүүлийн ноорог/илгээсэн. */
function pickContract(ctx: ContractContext): Crm2BrokerageRow | null {
  const list = ctx.contracts as unknown as Crm2BrokerageRow[];
  return list.find((c) => c.status === "active") ?? list.find((c) => c.status === "draft" || c.status === "pending") ?? null;
}

/**
 * Гэрээний нүд: дарахад гэрээний мэдээллийг (loadContractContext, RLS) ачаалж ContractSheet-ийг
 * нээнэ (ширээнд drawer). Хаахад хүснэгтийн хувь, дараагийн алхам дахин тооцоологдоно.
 */
export function ContractCell({ propertyId, officeId, settings, staff, label, needsWork }: ContractCellProps) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "loading" | { error: string } | { ctx: ContractContext }>("idle");

  async function openSheet() {
    setState("loading");
    const res = await loadContractContext(propertyId).catch(() => null);
    if (!res) return setState({ error: "Сүлжээ тасарлаа" });
    if (!res.ok) return setState({ error: res.error });
    setState({ ctx: res.data });
  }

  const ctx = typeof state === "object" && "ctx" in state ? state.ctx : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openSheet()}
        disabled={state === "loading"}
        className={cn(
          "inline-flex min-h-9 max-w-48 items-center gap-1 rounded-lg px-2 text-left text-xs font-medium",
          needsWork ? "bg-brand-50 text-brand-800 hover:bg-brand-100" : "text-muted hover:bg-surface-2 hover:text-ink"
        )}
      >
        {state === "loading" ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <FileSignature className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="line-clamp-2">{label}</span>
      </button>
      {typeof state === "object" && "error" in state ? (
        <p className="mt-0.5 text-[11px] text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {ctx ? (
        <ContractSheet
          propertyId={propertyId}
          officeId={officeId}
          contract={pickContract(ctx)}
          settings={settings}
          staff={staff}
          context={ctx}
          open
          onClose={() => {
            setState("idle");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
