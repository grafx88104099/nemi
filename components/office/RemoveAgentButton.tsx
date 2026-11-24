"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Loader2, UserMinus } from "lucide-react";

import { getAgentRemovalCheck, removeAgentFromOffice } from "@/lib/actions/agent-account";
import {
  blockerLinks,
  canDeleteListings,
  confirmNameMatches,
  defaultListingsChoice,
  listingsChoiceError,
  moreCount,
  needsListingsChoice,
  removalSummary,
  type ListingsChoice,
  type RemovalCheck,
  type TransferTarget,
} from "@/lib/office/agent-removal";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

type Loaded = { check: RemovalCheck; targets: TransferTarget[] };

/**
 * «Хасах» — агентыг оффисоос бүрмөсөн гаргах (идэвхгүй болгохоос цааш).
 * Нээхэд DB-ийн шалгалтыг ачаалж: хориг (засах холбоостой), юу болох,
 * зарыг шилжүүлэх/устгах сонголт, нэрээр баталгаажуулалт.
 */
export function RemoveAgentButton({
  agentId,
  agentName,
  redirectTo,
}: {
  agentId: string;
  agentName: string;
  /** Амжилттай бол шилжих хуудас (дэлгэрэнгүй хуудаснаас жагсаалт руу). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<ListingsChoice | null>(null);
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [pending, startRemove] = useTransition();

  function load() {
    setLoadErr(null);
    startLoad(async () => {
      const res = await getAgentRemovalCheck(agentId);
      if ("error" in res) {
        setLoadErr(res.error);
        return;
      }
      setData(res);
      setChoice(defaultListingsChoice(res.check, res.targets));
      setTargetId(res.targets[0]?.id ?? "");
    });
  }

  function openDialog() {
    setOpen(true);
    setData(null);
    setName("");
    setErr(null);
    load();
  }

  function close() {
    if (pending) return;
    setOpen(false);
  }

  const check = data?.check ?? null;
  const targets = data?.targets ?? [];
  const blocked = !!check && check.blockers.length > 0;
  const askChoice = !!check && needsListingsChoice(check);
  const choiceErr = check ? listingsChoiceError(check, choice, choice === "transfer" ? targetId || null : null, targets) : null;
  const nameOk = confirmNameMatches(name, agentName);
  const canSubmit = !!check && !blocked && !choiceErr && nameOk && !pending;

  function submit() {
    if (!check || !canSubmit) return;
    setErr(null);
    startRemove(async () => {
      const res = await removeAgentFromOffice({
        agentId,
        confirmName: name,
        listings: askChoice ? choice : null,
        targetId: askChoice && choice === "transfer" ? targetId : null,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      toast.success(
        res.mode === "deleted"
          ? `«${agentName}» бүрэн устгагдлаа.`
          : res.fellBack
            ? `«${agentName}» хасагдлаа — хуучин CRM-ийн бүртгэлтэй тул түүхийг нь хадгалсан.`
            : `«${agentName}» хасагдлаа — CRM-ийн түүх хадгалагдсан.`
      );
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 sm:min-h-0 sm:px-2 sm:py-1"
        title="Оффисоос бүрмөсөн хасах"
      >
        <UserMinus className="size-3.5" /> Хасах
      </button>

      <Modal
        open={open}
        onClose={close}
        title={`Агентыг хасах — ${agentName}`}
        closeOnBackdrop={!pending}
        footer={
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close} disabled={pending} className="w-full sm:w-auto">
              Болих
            </Button>
            {check && !blocked ? (
              <Button variant="danger" onClick={submit} disabled={!canSubmit} className="w-full sm:w-auto">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
                {pending ? "Хасаж байна..." : "Бүрмөсөн хасах"}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-4 p-4 text-sm">
          {loading && !check ? (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" /> Шалгаж байна...
            </p>
          ) : null}

          {loadErr ? (
            <div className="space-y-2 rounded-xl bg-rose-50 p-3 text-rose-700">
              <p>{loadErr}</p>
              <Button size="touch" variant="outline" onClick={load} disabled={loading}>
                Дахин шалгах
              </Button>
            </div>
          ) : null}

          {check ? (
            <RemovalForm
              agentId={agentId}
              agentName={agentName}
              check={check}
              targets={targets}
              choice={choice}
              onChoice={setChoice}
              targetId={targetId}
              onTarget={setTargetId}
              name={name}
              onName={setName}
            />
          ) : null}

          {err ? <p className="rounded-xl bg-rose-50 p-3 text-danger">{err}</p> : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * Диалогийн агуулга (хориг / сонголт / юу болох / нэрээр баталгаажуулах) —
 * төлөвгүй, props-оор удирдагдана.
 */
export function RemovalForm({
  agentId,
  agentName,
  check,
  targets,
  choice,
  onChoice,
  targetId,
  onTarget,
  name,
  onName,
}: {
  agentId: string;
  agentName: string;
  check: RemovalCheck;
  targets: TransferTarget[];
  choice: ListingsChoice | null;
  onChoice: (c: ListingsChoice) => void;
  targetId: string;
  onTarget: (id: string) => void;
  name: string;
  onName: (v: string) => void;
}) {
  const blocked = check.blockers.length > 0;
  const askChoice = needsListingsChoice(check);
  const choiceErr = listingsChoiceError(check, choice, choice === "transfer" ? targetId || null : null, targets);
  const targetName = targets.find((t) => t.id === targetId)?.name ?? null;
  return (
    <>
      {blocked ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Хасахаас өмнө дараахыг шийдвэрлэнэ үү:
          </p>
          <ul className="space-y-3">
            {check.blockers.map((b) => {
              const links = blockerLinks(b);
              const more = moreCount(b);
              return (
                <li key={b.code} className="space-y-1">
                  <p>{b.message}</p>
                  {links.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {links.map((l) => (
                        <li key={l.href + l.label}>
                          <Link
                            href={l.href}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 sm:min-h-9"
                          >
                            {l.label} <ExternalLink className="size-3" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {more > 0 ? <p className="text-xs">…ба бусад {more}</p> : null}
                </li>
              );
            })}
          </ul>
          {check.blockers.some((b) => b.code === "deals" || b.code === "property_roles") ? (
            <p className="text-xs">
              Хүлээлцэхийг{" "}
              <Link href="/office/crm/settings/staff" className="font-semibold underline">
                CRM → Тохиргоо → Ажилтан
              </Link>{" "}
              хэсгийн «Гарах урсгал»-аар эхлүүлж болно.
            </p>
          ) : null}
        </div>
      ) : null}

      {!blocked ? (
        <>
          {askChoice ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold text-ink">
                Зар ({check.listings.total}){check.leads + check.projects + check.viewings > 0 ? ", лид, үзлэг" : ""}
              </legend>
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50">
                <input
                  type="radio"
                  name={`listings-${agentId}`}
                  className="mt-0.5 size-4"
                  checked={choice === "transfer"}
                  onChange={() => onChoice("transfer")}
                  disabled={targets.length === 0}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">Өөр агентад шилжүүлэх</span>
                  <span className="block text-xs text-muted">
                    {targets.length === 0
                      ? "Хүлээн авах идэвхтэй агент алга."
                      : "Зар сайтад үргэлжлэн харагдана, холбоо барих агент солигдоно."}
                  </span>
                </span>
              </label>
              {choice === "transfer" && targets.length > 0 ? (
                <Select
                  aria-label="Хүлээн авах агент"
                  value={targetId}
                  onChange={(e) => onTarget(e.target.value)}
                  className="text-base sm:text-sm"
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line p-3 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50/50">
                <input
                  type="radio"
                  name={`listings-${agentId}`}
                  className="mt-0.5 size-4"
                  checked={choice === "delete"}
                  onChange={() => onChoice("delete")}
                  disabled={!canDeleteListings(check)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">Устгах</span>
                  <span className="block text-xs text-muted">
                    {canDeleteListings(check)
                      ? "Зар, зураг нь бүрмөсөн устна."
                      : `CRM-ийн хөрөнгөтэй холбоотой ${check.listings.linked} зар байгаа тул устгахгүй — шилжүүлнэ.`}
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-4 shrink-0" /> Юу болох вэ
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {removalSummary(check, askChoice ? choice : null, targetName).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`confirm-${agentId}`} className="block font-medium text-ink">
              Баталгаажуулахын тулд «{agentName}» гэж бичнэ үү
            </label>
            <Input
              id={`confirm-${agentId}`}
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder={agentName}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="text-base sm:text-sm"
              data-autofocus
            />
          </div>
          {choiceErr && askChoice ? <p className="text-xs text-amber-700">{choiceErr}</p> : null}
        </>
      ) : null}
    </>
  );
}
