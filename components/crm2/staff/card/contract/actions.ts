"use server";

import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { getProperty } from "@/lib/crm2/queries/properties";
import { AUTH_ERROR, NOT_FOUND_ERROR, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { idSchema } from "@/lib/crm2/schemas";
import type { Crm2Result } from "@/lib/crm2/types";

import { buildContractContext } from "./contract-context";
import type { ContractContext } from "./contract-types";

/**
 * Гэрээний доод цонхны өгөгдөл (картаас гадуур нээхэд — дутуу жагсаалт, ширээний хүснэгт).
 * Эрхийг getProperty (RLS) ба crm2_my_context шалгана; харах эрхгүй бол «олдсонгүй».
 */
export async function loadContractContext(propertyId: string): Promise<Crm2Result<ContractContext>> {
  const id = idSchema.safeParse(propertyId);
  if (!id.success) return fail(zodErrorText(id.error));
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) return fail(AUTH_ERROR);
  try {
    const [detail, settings] = await Promise.all([getProperty(id.data), getCrm2Settings()]);
    if (!detail) return fail(NOT_FOUND_ERROR);
    return ok(buildContractContext(detail, settings, ctx));
  } catch (e) {
    console.error("crm2 loadContractContext:", e instanceof Error ? e.message : e);
    return fail("Гэрээний мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.");
  }
}
