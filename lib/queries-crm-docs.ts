import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RESTRICTED_DOC_CATEGORIES, type DocCategory } from "@/lib/constants-crm";

/**
 * Баримтын уншилтууд (U5 — F-700–709). RLS: ангилалд суурилсан хандалт
 * (crm_can_view_document). Хязгаарлагдмал (aml/ownership/identity) баримтын
 * үзэлт БҮР crm_log_doc_view RPC-ээр аудитад (F-709); signed URL —
 * private bucket 'crm-docs', Content-Disposition: attachment.
 */

export type DocRow = {
  id: string;
  category: DocCategory;
  title: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  version: number;
  parent_document_id: string | null;
  retention_until: string | null;
  uploaded_by: string;
  uploader_name: string | null;
  created_at: string;
  is_cover: boolean;
  sort_order: number;
};

const DOC_SELECT =
  "is_cover, sort_order, " +
  "document:crm_documents!crm_document_links_document_id_fkey(id, category, title, storage_path, mime, " +
  "size_bytes, version, parent_document_id, retention_until, uploaded_by, created_at, " +
  "uploader:profiles!crm_documents_uploaded_by_fkey(full_name))";

type RawLink = {
  is_cover: boolean;
  sort_order: number;
  document: (Omit<DocRow, "uploader_name" | "is_cover" | "sort_order"> & {
    uploader: { full_name: string | null } | null;
  }) | null;
};

/** Нэг объектод хавсрагдсан баримтууд (эрхгүй ангилал RLS-ээр шүүгдэнэ). */
export async function getDocsForEntity(entity: string, entityId: string): Promise<DocRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_document_links")
    .select(DOC_SELECT)
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("sort_order");
  if (error) {
    console.error("getDocsForEntity:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as RawLink[])
    .filter((l) => l.document)
    .map((l) => {
      const { uploader, ...doc } = l.document!;
      return {
        ...doc,
        uploader_name: uploader?.full_name ?? null,
        is_cover: l.is_cover,
        sort_order: l.sort_order,
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Хувилбарын гинж (F-702) — parent_document_id-аар өгсөж цуглуулна. */
export async function getDocVersions(docId: string): Promise<DocRow[]> {
  const supabase = await createClient();
  const versions: DocRow[] = [];
  let currentId: string | null = docId;
  for (let i = 0; i < 20 && currentId; i++) {
    const { data } = await supabase
      .from("crm_documents")
      .select(
        "id, category, title, storage_path, mime, size_bytes, version, parent_document_id, " +
          "retention_until, uploaded_by, created_at, " +
          "uploader:profiles!crm_documents_uploaded_by_fkey(full_name)"
      )
      .eq("id", currentId)
      .maybeSingle();
    if (!data) break;
    type Raw = Omit<DocRow, "uploader_name" | "is_cover" | "sort_order"> & {
      uploader: { full_name: string | null } | null;
    };
    const raw = data as unknown as Raw;
    const { uploader, ...doc } = raw;
    versions.push({ ...doc, uploader_name: uploader?.full_name ?? null, is_cover: false, sort_order: 0 });
    currentId = raw.parent_document_id;
  }
  return versions;
}

/**
 * Татах signed URL (10 мин, attachment). Урьдчилж хэрэглэгчийн клиентээр
 * RLS шалгаж, хязгаарлагдмал ангилалд crm_log_doc_view аудит бичээд
 * дараа нь service role-оор URL үүсгэнэ (bucket клиентэд хаалттай).
 */
export async function getSignedUrl(docId: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("crm_documents")
    .select("id, category, title, storage_path")
    .eq("id", docId)
    .maybeSingle();
  if (error || !doc) return { error: "Баримт олдсонгүй эсвэл танд хандах эрх алга." };

  if (RESTRICTED_DOC_CATEGORIES.includes(doc.category as DocCategory)) {
    const { error: logErr } = await supabase.rpc("crm_log_doc_view", { p_doc: docId });
    if (logErr) {
      console.error("getSignedUrl audit:", logErr.message);
      return { error: "Хязгаарлагдмал баримтын үзэлт бүртгэгдээгүй тул хандалт хаагдлаа." };
    }
  }

  const admin = createAdminClient();
  const path = doc.storage_path.replace(/^crm-docs\//, "");
  const { data: signed, error: signErr } = await admin.storage
    .from("crm-docs")
    .createSignedUrl(path, 600, { download: doc.title });
  if (signErr || !signed) {
    console.error("getSignedUrl:", signErr?.message);
    return { error: "Татах холбоос үүсгэхэд алдаа гарлаа." };
  }
  return { url: signed.signedUrl };
}
