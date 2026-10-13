"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Save } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveSetting } from "@/lib/actions/crm-settings";
import type { SettingVersionRow } from "@/lib/queries-crm-core";

/**
 * Хувилбартай параметрын генерик засварлагч: одоогийн утга (JSON),
 * шинэ хувилбар үүсгэх маягт, хувилбарын түүх. Update биш INSERT (D4).
 */
export function SettingEditor({
  settingKey,
  title,
  description,
  versions,
  canEdit,
}: {
  settingKey: string;
  title: string;
  description?: string;
  versions: SettingVersionRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = versions.find((v) => v.valid_to === null) ?? versions[0] ?? null;
  const [valueJson, setValueJson] = useState(() =>
    current ? JSON.stringify(current.value, null, 2) : ""
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveSetting({ key: settingKey, valueJson, note });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-ink">{title}</p>
            <p className="text-xs text-subtle">
              key: <code className="rounded bg-surface-2 px-1">{settingKey}</code>
              {description ? ` — ${description}` : null}
            </p>
          </div>
          {current ? (
            <Badge tone="green">Хүчинтэй {new Date(current.valid_from).toLocaleDateString("mn-MN")}-аас</Badge>
          ) : (
            <Badge tone="amber">Тохируулаагүй</Badge>
          )}
        </div>

        <textarea
          value={valueJson}
          onChange={(e) => setValueJson(e.target.value)}
          rows={Math.min(14, Math.max(4, valueJson.split("\n").length))}
          disabled={!canEdit}
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
          aria-label={`${title} — JSON утга`}
        />

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Өөрчлөлтийн тайлбар (сонголтоор)"
              className="h-9 max-w-xs text-xs"
            />
            <Button size="sm" onClick={onSave} disabled={pending || !valueJson.trim()}>
              <Save className="size-4" /> Шинэ хувилбар хадгалах
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History className="size-4" /> Түүх ({versions.length})
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xs text-subtle">Зөвхөн харах эрхтэй.</p>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History className="size-4" /> Түүх ({versions.length})
            </Button>
          </div>
        )}
        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {showHistory ? (
          <div className="space-y-2 rounded-xl bg-surface-2 p-3">
            {versions.length === 0 ? (
              <p className="text-xs text-subtle">Түүх хоосон.</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-line bg-surface p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted">
                      {new Date(v.valid_from).toLocaleString("mn-MN")} —{" "}
                      {v.valid_to ? new Date(v.valid_to).toLocaleString("mn-MN") : "одоо"}
                    </span>
                    {v.note ? <span className="text-subtle">{v.note}</span> : null}
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-ink">
                    {JSON.stringify(v.value, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
