"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Lock, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { uploadDocument, getDocumentUrl, deleteDocument } from "@/lib/actions/crm-docs";
import type { DocRow } from "@/lib/queries-crm-docs";
import {
  DOC_CATEGORIES,
  DOC_CATEGORY_LABEL,
  RESTRICTED_DOC_CATEGORIES,
  type DocCategory,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Нэг объектын баримтын хэсэг (F-700–709): жагсаалт, upload (MIME/хэмжээ
 * серверт шалгагдана — F-703), татах (signed URL + хязгаарлагдмал ангилалд
 * аудит F-709), устгах (retention guard DB-д — F-707).
 */

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export function EntityDocs({
  entity,
  entityId,
  docs,
  roles,
  canUpload = true,
}: {
  entity: string;
  entityId: string;
  docs: DocRow[];
  roles: CrmRole[];
  canUpload?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("contract");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isOfficer = roles.includes("aml_officer");
  const categories = DOC_CATEGORIES.filter((c) => c !== "aml" || isOfficer);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Файл сонгоно уу.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("category", category);
    fd.set("entity", entity);
    fd.set("entityId", entityId);
    startTransition(async () => {
      const res = await uploadDocument(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function download(docId: string) {
    startTransition(async () => {
      const res = await getDocumentUrl(docId);
      if (res.error || !res.url) {
        setError(res.error ?? "Татах холбоос үүсгэхэд алдаа гарлаа.");
        return;
      }
      window.open(res.url, "_blank", "noopener");
    });
  }

  function remove(docId: string) {
    if (!window.confirm("Баримтыг устгах уу? (Хадгалалтын хугацаатай баримт устгагдахгүй — F-707)")) return;
    startTransition(async () => {
      const res = await deleteDocument(docId);
      if (!res.ok) {
        setError(res.error ?? "Устгахад алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Ангилал</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {DOC_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-52 flex-[2]">
            <label className="mb-1 block text-xs font-medium text-muted">Файл</label>
            <input
              ref={fileRef}
              type="file"
              className="block w-full text-sm text-ink file:mr-3 file:h-9 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:text-sm file:font-semibold file:text-brand-700"
            />
          </div>
          <Button size="sm" onClick={upload} disabled={pending}>
            <Upload className="size-4" />
            {pending ? "Байршуулж байна…" : "Байршуулах"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Хавсаргасан баримт алга.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {docs.map((d) => {
            const restricted = RESTRICTED_DOC_CATEGORIES.includes(d.category as DocCategory);
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {d.title}
                    {d.version > 1 && <span className="ml-1 text-xs text-muted">v{d.version}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {d.uploader_name ?? "?"} · {new Date(d.created_at).toLocaleDateString("mn-MN")}
                    {d.size_bytes ? ` · ${fmtSize(d.size_bytes)}` : ""}
                    {d.retention_until ? ` · ${d.retention_until} хүртэл хадгална` : ""}
                  </p>
                </div>
                <Badge tone={d.category === "aml" ? "rose" : restricted ? "amber" : "neutral"}>
                  {restricted && <Lock className="size-3" />}
                  {DOC_CATEGORY_LABEL[d.category]}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => download(d.id)} disabled={pending} title="Татах">
                  <Download className="size-4" />
                </Button>
                {canUpload && (
                  <Button variant="ghost" size="sm" onClick={() => remove(d.id)} disabled={pending} title="Устгах">
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-subtle">
        Хязгаарлагдмал ангиллын (МУТСТ/өмчлөл/иргэний) баримтын үзэлт бүр аудитад бүртгэгдэнэ (F-709).
      </p>
    </div>
  );
}
