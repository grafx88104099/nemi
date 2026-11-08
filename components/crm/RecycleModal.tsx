"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { recycleLeadWithReview } from "@/lib/actions/crm-ownership";
import { RECYCLE_REASONS, RECYCLE_REASON_LABEL, type RecycleReason } from "@/lib/validation/crm-ownership";

/**
 * Эргэлтэд оруулах эсэхийг хянан үзэх (§6.27): бодит үйл ажиллагаагүй,
 * босго хэтэрсэн нотолгоог систем шалгана; дүгнэлт заавал. «Санд буцаах»
 * бол эзэмшигч чөлөөлөгдөж, бусад агент зөвшөөрлөөр авах боломжтой.
 */
export function RecycleModal({
  open,
  onClose,
  leadId,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<RecycleReason | "">("");
  const [note, setNote] = useState("");
  const [release, setRelease] = useState<"" | "yes" | "no">("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason("");
    setNote("");
    setRelease("");
    setError(null);
    onClose();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recycleLeadWithReview({ leadId, reason, note, release: release === "yes" });
      if (!res.ok) {
        setError(res.error ?? "Эргэлтэд оруулж чадсангүй.");
        return;
      }
      toast.success(release === "yes" ? "Сэжим эргэлтийн санд орлоо" : "Сэжим эргэлтэд орлоо");
      close();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Эргэлтэд оруулах эсэхийг хянан үзэх"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Болих
          </Button>
          <Button onClick={submit} disabled={pending || !reason || !release || note.trim().length < 10}>
            <RotateCcw className="size-4" />
            {pending ? "Хадгалж байна…" : "Эргэлтэд оруулах"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Систем сүүлийн холболтыг тохиргооны босготой тулгана — бодит үйл ажиллагаа хугацаандаа бүртгэгдсэн
          сэжмийг эргэлтэд оруулахгүй.
        </p>
        <Field label="Шалтгаан">
          <Select value={reason} onChange={(e) => setReason(e.target.value as RecycleReason | "")}>
            <option value="">Шалтгааныг сонгоно уу</option>
            {RECYCLE_REASONS.map((r) => (
              <option key={r} value={r}>
                {RECYCLE_REASON_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Хянан үзсэн дүгнэлт" hint="Юуг шалгасан, агенттай ярилцсан эсэх (10+ тэмдэгт).">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Шийдвэр</legend>
          {(
            [
              ["yes", "Эргэлтийн санд буцаах", "Эзэмшигч чөлөөлөгдөнө; бусад агент зөвшөөрлөөр авна."],
              ["no", "Эзэмшигчид үлдээх", "Эргэлтийн төлөвтэй, одоогийн агент дахин идэвхжүүлэх үүрэгтэй."],
            ] as const
          ).map(([v, label, hint]) => (
            <label
              key={v}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${
                release === v ? "border-brand-300 bg-brand-50" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="recycle-release"
                checked={release === v}
                onChange={() => setRelease(v)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
