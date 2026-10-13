"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { saveNotificationMatrix } from "@/lib/actions/crm-settings";
import { CRM_ROLES, CRM_ROLE_LABEL, CRM_EVENT_LABEL, type CrmRole, type CrmEventCode } from "@/lib/constants-crm";
import type { NotificationMatrixRow } from "@/lib/queries-crm-core";

const CHANNELS = ["app", "push", "email", "sms"] as const;
type Channel = (typeof CHANNELS)[number];
const CHANNEL_LABEL: Record<Channel, string> = { app: "Апп", push: "Push", email: "И-мэйл", sms: "SMS" };

type Draft = {
  id?: string;
  eventCode: string;
  recipientRoles: CrmRole[];
  channels: Channel[];
  mandatory: boolean;
  quietHoursExempt: boolean;
};

export function NotificationsShell({ matrix, canEdit }: { matrix: NotificationMatrixRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await saveNotificationMatrix(draft);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function toggleIn<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  return (
    <div className="mt-6 space-y-4">
      {canEdit ? (
        <Button
          size="sm"
          onClick={() =>
            setDraft({ eventCode: "", recipientRoles: [], channels: ["app"], mandatory: false, quietHoursExempt: false })
          }
        >
          <Plus className="size-4" /> Event нэмэх
        </Button>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">Event</th>
                  <th className="px-5 py-2.5 font-medium">Хүлээн авагч дүр</th>
                  <th className="px-5 py-2.5 font-medium">Суваг</th>
                  <th className="px-5 py-2.5 font-medium">Шинж</th>
                  {canEdit ? <th className="px-5 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {matrix.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-5 py-6 text-center text-subtle">
                      Матриц хоосон — seed скрипт ажиллуулна уу.
                    </td>
                  </tr>
                ) : null}
                {matrix.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink">
                        {CRM_EVENT_LABEL[m.event_code as CrmEventCode] ?? m.event_code}
                      </p>
                      <p className="font-mono text-[11px] text-subtle">{m.event_code}</p>
                    </td>
                    <td className="px-5 py-2.5 text-muted">
                      {m.recipient_roles.map((r) => CRM_ROLE_LABEL[r]).join(", ")}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {m.channels.map((c) => (
                          <Badge key={c} tone={c === "app" ? "brand" : "neutral"}>
                            {CHANNEL_LABEL[c as Channel] ?? c}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {m.mandatory ? <Badge tone="rose">Заавал</Badge> : null}
                        {m.quiet_hours_exempt ? <Badge tone="amber">Чимээгүй цаг үл хамаарна</Badge> : null}
                      </div>
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              id: m.id,
                              eventCode: m.event_code,
                              recipientRoles: m.recipient_roles,
                              channels: m.channels as Channel[],
                              mandatory: m.mandatory,
                              quietHoursExempt: m.quiet_hours_exempt,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Event засах" : "Event нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-3">
            <Field label="Event код" hint="Латин жижиг үсэг, ж: lead_assigned">
              <Input
                value={draft.eventCode}
                onChange={(e) => setDraft({ ...draft, eventCode: e.target.value })}
                disabled={!!draft.id}
              />
            </Field>
            <Field label="Хүлээн авагч дүрүүд">
              <div className="flex flex-wrap gap-1.5">
                {CRM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDraft({ ...draft, recipientRoles: toggleIn(draft.recipientRoles, r) })}
                    className={
                      draft.recipientRoles.includes(r)
                        ? "rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
                        : "rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
                    }
                  >
                    {CRM_ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Суваг" hint="И-мэйл/SMS суваг — интеграци хараахан идэвхгүй (заглушка)">
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, channels: toggleIn(draft.channels, c) })}
                    className={
                      draft.channels.includes(c)
                        ? "rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
                        : "rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
                    }
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Заавал ангилал (F-652)">
                <Select
                  value={draft.mandatory ? "yes" : "no"}
                  onChange={(e) => setDraft({ ...draft, mandatory: e.target.value === "yes" })}
                >
                  <option value="no">Үгүй</option>
                  <option value="yes">Тийм — хэрэглэгч хааж чадахгүй</option>
                </Select>
              </Field>
              <Field label="Чимээгүй цаг үл хамаарна">
                <Select
                  value={draft.quietHoursExempt ? "yes" : "no"}
                  onChange={(e) => setDraft({ ...draft, quietHoursExempt: e.target.value === "yes" })}
                >
                  <option value="no">Үгүй</option>
                  <option value="yes">Тийм</option>
                </Select>
              </Field>
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
