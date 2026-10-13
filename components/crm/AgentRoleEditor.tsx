"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { setAgentRoles, type AgentRoleInput } from "@/lib/actions/crm-transactions";
import type { TxnAgentRole } from "@/lib/queries-crm-transactions";
import type { AgentOption } from "@/lib/queries-crm-leads";
import { COMMISSION_ROLES, COMMISSION_ROLE_LABEL, type CommissionRole } from "@/lib/constants-crm";

/**
 * Агентын үүргийн бүртгэл + split (F-402/451/458) — урамшууллын нотолгооны эх.
 * Нэг үүргийг олон агент хуваавал нийлбэр 100% (клиент + сервер давхар шалгана).
 */

type RowState = { agentProfileId: string; role: CommissionRole; splitPct: string };

export function AgentRoleEditor({
  txnId,
  existing,
  agents,
  editable,
}: {
  txnId: string;
  existing: TxnAgentRole[];
  agents: AgentOption[];
  editable: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(
    existing.map((r) => ({
      agentProfileId: r.agent_profile_id,
      role: r.role,
      splitPct: r.split_pct != null ? String(r.split_pct) : "",
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const splitWarnings: string[] = [];
  const byRole = new Map<string, RowState[]>();
  for (const r of rows) {
    if (!r.agentProfileId) continue;
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }
  for (const [role, list] of byRole) {
    if (list.length > 1) {
      const sum = list.reduce((s, r) => s + (Number(r.splitPct) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        splitWarnings.push(
          `«${COMMISSION_ROLE_LABEL[role as CommissionRole]}» үүргийн нийлбэр ${sum}% — 100% байх ёстой (F-458).`
        );
      }
    }
  }

  function save() {
    setError(null);
    const payload: AgentRoleInput[] = rows
      .filter((r) => r.agentProfileId)
      .map((r) => ({
        agentProfileId: r.agentProfileId,
        role: r.role,
        splitPct: r.splitPct ? Number(r.splitPct) : null,
      }));
    if (!payload.length) {
      setError("Дор хаяж нэг үүрэг бүртгэнэ (F-402).");
      return;
    }
    startTransition(async () => {
      const res = await setAgentRoles(txnId, payload);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  if (!editable) {
    return existing.length ? (
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {existing.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.agent_name ?? "?"}</span>
            <span className="text-muted">{COMMISSION_ROLE_LABEL[r.role]}</span>
            {r.split_pct != null && <span className="font-semibold text-ink">{r.split_pct}%</span>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-4 text-center text-sm text-muted">Үүргийн бүртгэл алга.</p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            className="min-w-44 flex-[2]"
            value={r.agentProfileId}
            onChange={(e) => setRow(i, { agentProfileId: e.target.value })}
          >
            <option value="">— Агент —</option>
            {agents.map((a) => (
              <option key={a.profileId} value={a.profileId}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            className="min-w-40 flex-1"
            value={r.role}
            onChange={(e) => setRow(i, { role: e.target.value as CommissionRole })}
          >
            {COMMISSION_ROLES.map((role) => (
              <option key={role} value={role}>
                {COMMISSION_ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Split %"
            className="w-24"
            value={r.splitPct}
            onChange={(e) => setRow(i, { splitPct: e.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            title="Мөр хасах"
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, { agentProfileId: "", role: "selling", splitPct: "" }])}
        >
          <Plus className="size-4" />
          Үүрэг нэмэх
        </Button>
        <Button size="sm" onClick={save} disabled={pending || splitWarnings.length > 0}>
          <Save className="size-4" />
          {pending ? "Хадгалж байна…" : "Хадгалах"}
        </Button>
      </div>
      {splitWarnings.map((w) => (
        <p key={w} className="text-sm text-amber-600">
          {w}
        </p>
      ))}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-subtle">
        Үүргийн бүртгэл = урамшууллын нотолгооны эх (F-451). Хамтарсан үүргийн хуваарилалт хаалтын
        ӨМНӨ тохирсон байх ёстой (F-458); мөр хасах зөвхөн ноорог төлөвт.
      </p>
    </div>
  );
}
