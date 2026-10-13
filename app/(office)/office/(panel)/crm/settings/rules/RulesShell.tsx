"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveRule } from "@/lib/actions/crm-settings";
import type { AutomationRuleRow } from "@/lib/queries-crm-core";

export function RulesShell({ rules, canEdit }: { rules: AutomationRuleRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(rule: AutomationRuleRow, patch: { isActive?: boolean; dryRun?: boolean }) {
    setError(null);
    startTransition(async () => {
      const res = await saveRule({
        id: rule.id,
        isActive: patch.isActive ?? rule.is_active,
        dryRun: patch.dryRun ?? rule.dry_run,
      });
      if (!res.ok) setError(res.error ?? "Алдаа гарлаа.");
      router.refresh();
    });
  }

  return (
    <Card className="mt-6">
      <CardBody className="p-0">
        {error ? <p className="px-5 pt-3 text-xs text-danger">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th className="px-5 py-2.5 font-medium">Код</th>
                <th className="px-5 py-2.5 font-medium">Нэр</th>
                <th className="px-5 py-2.5 font-medium">Триггер</th>
                <th className="px-5 py-2.5 font-medium">Төлөв</th>
                {canEdit ? <th className="px-5 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-5 py-6 text-center text-subtle">
                    Дүрэм бүртгэгдээгүй — seed скрипт ажиллуулна уу.
                  </td>
                </tr>
              ) : null}
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-mono text-xs text-muted">{r.code}</td>
                  <td className="px-5 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-subtle">{r.trigger_kind}</td>
                  <td className="px-5 py-2.5">
                    {!r.is_active ? (
                      <Badge tone="neutral">Идэвхгүй</Badge>
                    ) : r.dry_run ? (
                      <Badge tone="amber">Туршилт (dry-run)</Badge>
                    ) : (
                      <Badge tone="green">Идэвхтэй</Badge>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => toggle(r, { isActive: !r.is_active })}
                        >
                          {r.is_active ? "Унтраах" : "Асаах"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending || !r.is_active}
                          onClick={() => toggle(r, { dryRun: !r.dry_run })}
                        >
                          {r.dry_run ? "Бодитоор" : "Dry-run"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
