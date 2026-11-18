"use server";

import { getRequirementMatches, type Crm2MatchRow } from "@/lib/crm2/queries/waitlist";
import { crm2Session } from "@/lib/crm2/server";
import { AUTH_ERROR, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { idSchema } from "@/lib/crm2/schemas";
import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Хүлээлгийн жагсаалт (T10): нэг шаардлагын тохирох хөрөнгүүдийг картыг
 * дэлгэхэд ачаалах. Жагсаалтад 200 хүртэл хүн байж болох тул бүгдийн тохирлыг
 * урьдчилж уншихгүй — хүссэн картынх нь л нэг RPC-ээр татна.
 * Эрхийг DB шалгана (crm2_requirement_match_list = definer: харилцагчийн харах
 * эрх + хөрөнгийн харагдац); энд зөвхөн нэвтэрсэн эсэхийг шалгаад дамжуулна.
 */
export async function loadRequirementMatches(requirementId: string): Promise<Crm2Result<Crm2MatchRow[]>> {
  const parsed = idSchema.safeParse(requirementId);
  if (!parsed.success) return fail(zodErrorText(parsed.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  return ok(await getRequirementMatches(parsed.data));
}
