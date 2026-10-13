"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, FilePlus2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requestApproval, approveTxnApproval } from "@/lib/actions/crm-transactions";
import type { TxnApproval } from "@/lib/queries-crm-transactions";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Transaction Approval (F-410–412): стандарт хөлснөөс зөрсөн дүн зөвшөөрлийн
 * бүртгэлгүйгээр систем хүлээж авахгүй (F-411). Батлах — SD/CEO (эрхийн матриц).
 */

const FEE_CHANGE_LABEL: Record<string, string> = {
  discount: "Хөнгөлөлт",
  waiver: "Чөлөөлөлт",
  special: "Тусгай нөхцөл",
};

export function ApprovalPanel({
  txnId,
  approvals,
  roles,
}: {
  txnId: string;
  approvals: TxnApproval[];
  roles: CrmRole[];
}) {
  const router = useRouter();
  const canApprove = roles.some((r) => r === "sales_director" || r === "ceo");
  const [open, setOpen] = useState(false);
  const [rationale, setRationale] = useState("");
  const [feeChange, setFeeChange] = useState("discount");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestApproval({
        transactionId: txnId,
        rationale,
        feeChange: feeChange as "discount" | "waiver" | "special",
        approvedAmount: amount ? Number(amount) : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setRationale("");
      setAmount("");
      router.refresh();
    });
  }

  function approve(id: string) {
    startTransition(async () => {
      const res = await approveTxnApproval(id, txnId);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Стандарт хөлснөөс зөрсөн дүн батлагдсан зөвшөөрөлгүйгээр хүлээн авахгүй (F-411).
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FilePlus2 className="size-4" />
          Зөвшөөрөл хүсэх
        </Button>
      </div>

      {approvals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Зөвшөөрлийн бүртгэл алга.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {approvals.map((a) => (
            <li key={a.id} className="space-y-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={a.approved_at ? "green" : "amber"}>
                  {a.approved_at ? "Батлагдсан" : "Хүлээгдэж буй"}
                </Badge>
                <span className="text-sm font-medium text-ink">{FEE_CHANGE_LABEL[a.fee_change] ?? a.fee_change}</span>
                {a.approved_amount != null && (
                  <span className="text-sm text-muted">{a.approved_amount.toLocaleString()}₮</span>
                )}
                <span className="ml-auto text-xs text-subtle">
                  {new Date(a.created_at).toLocaleDateString("mn-MN")}
                </span>
              </div>
              <p className="text-sm text-muted">{a.rationale}</p>
              <p className="text-xs text-subtle">
                Хүсэгч: {a.requester_name ?? "?"}
                {a.approved_at && ` · Баталсан: ${a.approver_name ?? "?"} (${new Date(a.approved_at).toLocaleDateString("mn-MN")})`}
              </p>
              {!a.approved_at && canApprove && (
                <Button size="sm" variant="secondary" onClick={() => approve(a.id)} disabled={pending}>
                  <BadgeCheck className="size-4" />
                  Батлах (F-412)
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Transaction Approval хүсэлт (F-410)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending || !rationale.trim()}>
              {pending ? "Илгээж байна…" : "Хүсэлт илгээх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Хөлсний өөрчлөлт">
            <Select value={feeChange} onChange={(e) => setFeeChange(e.target.value)}>
              <option value="discount">Хөнгөлөлт</option>
              <option value="waiver">Чөлөөлөлт</option>
              <option value="special">Тусгай нөхцөл</option>
            </Select>
          </Field>
          <Field label="Зөвшөөрөх дүн (₮, заавал биш)">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Үндэслэл" error={error ?? undefined}>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Яагаад стандартаас зөрөх шаардлагатай вэ…"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
