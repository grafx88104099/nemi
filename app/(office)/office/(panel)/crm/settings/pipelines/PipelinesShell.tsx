"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, Pencil } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { savePipeline, saveStage } from "@/lib/actions/crm-settings";
import { GATES, GATE_LABEL, GATE_CHECKER_LABEL, type GateCode } from "@/lib/constants-crm";
import type { GateRequirementRow, PipelineWithStages, StageRow } from "@/lib/queries-crm-core";

type StageDraft = {
  id?: string;
  pipelineId: string;
  code: string;
  name: string;
  sortOrder: number;
  probability: number;
  gateCode: GateCode | "";
  isTerminal: boolean;
  terminalState: "won" | "lost" | "";
  isClosingDirection: boolean;
};

const EMPTY_STAGE = (pipelineId: string, sortOrder: number): StageDraft => ({
  pipelineId,
  code: "",
  name: "",
  sortOrder,
  probability: 0,
  gateCode: "",
  isTerminal: false,
  terminalState: "",
  isClosingDirection: false,
});

export function PipelinesShell({
  pipelines,
  gateReqs,
  canEdit,
}: {
  pipelines: PipelineWithStages[];
  gateReqs: GateRequirementRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState(pipelines[0]?.id ?? "");
  const [stageDraft, setStageDraft] = useState<StageDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = pipelines.find((p) => p.id === tab) ?? pipelines[0] ?? null;

  function submitStage() {
    if (!stageDraft) return;
    setError(null);
    startTransition(async () => {
      const res = await saveStage({
        id: stageDraft.id,
        pipelineId: stageDraft.pipelineId,
        code: stageDraft.code,
        name: stageDraft.name,
        sortOrder: stageDraft.sortOrder,
        probability: stageDraft.probability,
        gateCode: stageDraft.gateCode || null,
        isTerminal: stageDraft.isTerminal,
        terminalState: stageDraft.terminalState || null,
        isClosingDirection: stageDraft.isClosingDirection,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setStageDraft(null);
      router.refresh();
    });
  }

  function togglePipelineActive(p: PipelineWithStages) {
    startTransition(async () => {
      const res = await savePipeline({
        id: p.id,
        code: p.code,
        name: p.name,
        restricted: p.restricted,
        sortOrder: p.sort_order,
        isActive: !p.is_active,
      });
      if (!res.ok) setError(res.error ?? "Алдаа гарлаа.");
      router.refresh();
    });
  }

  if (pipelines.length === 0) {
    return (
      <Card className="mt-6">
        <CardBody>
          <p className="py-8 text-center text-sm text-muted">
            Урсгал тохируулагдаагүй байна — seed скрипт (scripts/seed-crm.mjs) ажиллуулна уу.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <Tabs
        items={pipelines.map((p) => ({
          value: p.id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {p.restricted ? <Lock className="size-3.5" /> : null}
              {p.code} · {p.name}
            </span>
          ),
        }))}
        value={active?.id ?? ""}
        onValueChange={setTab}
      />

      {active ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={active.is_active ? "green" : "neutral"}>
              {active.is_active ? "Идэвхтэй" : "Идэвхгүй"}
            </Badge>
            {active.restricted ? <Badge tone="rose">Хязгаарлагдмал (PL-6 — 5 дүр)</Badge> : null}
            {canEdit ? (
              <>
                <Button size="sm" variant="outline" onClick={() => togglePipelineActive(active)} disabled={pending}>
                  {active.is_active ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStageDraft(EMPTY_STAGE(active.id, active.stages.length))}
                  disabled={pending}
                >
                  <Plus className="size-4" /> Шат нэмэх
                </Button>
              </>
            ) : null}
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <Card>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Код</th>
                    <th className="px-4 py-2.5 font-medium">Нэр</th>
                    <th className="px-4 py-2.5 font-medium">Магадлал</th>
                    <th className="px-4 py-2.5 font-medium">Гейт</th>
                    <th className="px-4 py-2.5 font-medium">Терминал</th>
                    {canEdit ? <th className="px-4 py-2.5" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {active.stages.map((s: StageRow) => (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-subtle">{s.sort_order}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.code}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {s.name}
                        {s.is_closing_direction ? (
                          <Badge tone="amber" className="ml-2">
                            Хаалтын чиглэл
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">{Number(s.probability)}%</td>
                      <td className="px-4 py-2.5">
                        {s.gate_code ? <Badge tone="blue">{GATE_LABEL[s.gate_code]}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.is_terminal ? (
                          <Badge tone={s.terminal_state === "won" ? "green" : "rose"}>
                            {s.terminal_state === "won" ? "Амжилттай" : "Алдсан"}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setStageDraft({
                                id: s.id,
                                pipelineId: s.pipeline_id,
                                code: s.code,
                                name: s.name,
                                sortOrder: s.sort_order,
                                probability: Number(s.probability),
                                gateCode: s.gate_code ?? "",
                                isTerminal: s.is_terminal,
                                terminalState:
                                  s.terminal_state === "won" || s.terminal_state === "lost"
                                    ? s.terminal_state
                                    : "",
                                isClosingDirection: s.is_closing_direction,
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
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="font-bold text-ink">Гейтийн шаардлагууд (G0–G6)</p>
              <p className="text-xs text-subtle">
                Шатанд орохын өмнө шалгагдана; дутуу шаардлага UI-д жагсаж, DB trigger хориглоно (F-354).
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {GATES.map((g) => {
                  const reqs = gateReqs.filter(
                    (r) => r.gate_code === g && r.is_active && (r.pipeline_id === null || r.pipeline_id === active.id)
                  );
                  return (
                    <div key={g} className="rounded-xl border border-line p-3">
                      <p className="text-sm font-semibold text-ink">{GATE_LABEL[g]}</p>
                      {reqs.length === 0 ? (
                        <p className="mt-1 text-xs text-subtle">Шаардлагагүй</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted">
                          {reqs.map((r) => (
                            <li key={r.id}>
                              •{" "}
                              {GATE_CHECKER_LABEL[r.checker_kind as keyof typeof GATE_CHECKER_LABEL] ??
                                r.checker_kind}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}

      <Modal
        open={stageDraft !== null}
        onClose={() => setStageDraft(null)}
        title={stageDraft?.id ? "Шат засах" : "Шат нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStageDraft(null)}>
              Болих
            </Button>
            <Button onClick={submitStage} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {stageDraft ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Код">
                <Input
                  value={stageDraft.code}
                  onChange={(e) => setStageDraft({ ...stageDraft, code: e.target.value })}
                  placeholder="qualified"
                />
              </Field>
              <Field label="Нэр">
                <Input
                  value={stageDraft.name}
                  onChange={(e) => setStageDraft({ ...stageDraft, name: e.target.value })}
                  placeholder="Чанаржуулсан"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дараалал">
                <Input
                  type="number"
                  value={stageDraft.sortOrder}
                  onChange={(e) => setStageDraft({ ...stageDraft, sortOrder: Number(e.target.value) })}
                />
              </Field>
              <Field label="Магадлал (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={stageDraft.probability}
                  onChange={(e) => setStageDraft({ ...stageDraft, probability: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Гейт (шатанд орохын өмнө)">
              <Select
                value={stageDraft.gateCode}
                onChange={(e) => setStageDraft({ ...stageDraft, gateCode: e.target.value as GateCode | "" })}
              >
                <option value="">Гейтгүй</option>
                {GATES.map((g) => (
                  <option key={g} value={g}>
                    {GATE_LABEL[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Терминал шат">
                <Select
                  value={stageDraft.isTerminal ? stageDraft.terminalState || "won" : ""}
                  onChange={(e) => {
                    const v = e.target.value as "" | "won" | "lost";
                    setStageDraft({ ...stageDraft, isTerminal: v !== "", terminalState: v });
                  }}
                >
                  <option value="">Биш</option>
                  <option value="won">Амжилттай (won)</option>
                  <option value="lost">Алдсан (lost)</option>
                </Select>
              </Field>
              <Field label="Хаалтын чиглэл (AML hold хориглоно)">
                <Select
                  value={stageDraft.isClosingDirection ? "yes" : "no"}
                  onChange={(e) => setStageDraft({ ...stageDraft, isClosingDirection: e.target.value === "yes" })}
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
