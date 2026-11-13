"use server";

import { crm2Session } from "@/lib/crm2/server";
import { AUTH_ERROR, dbFail, fail, ok, zodErrorText } from "@/lib/crm2/result";
import { searchQuerySchema } from "@/lib/crm2/schemas";
import type { Crm2LocationSuggestion, Crm2ProjectSuggestion, Crm2Result } from "@/lib/crm2/types";

/**
 * Клиентийн typeahead-д (маягт бичих зуур): төсөл, байршлын санал.
 * Агентын сонгогчийг серверээс prop-оор (getStaffDirectory) дамжуулна.
 */

export async function suggestProjectsAction(query: string, limit = 10): Promise<Crm2Result<Crm2ProjectSuggestion[]>> {
  const q = searchQuerySchema.safeParse(query);
  if (!q.success) return fail(zodErrorText(q.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_suggest_projects", {
    p_query: q.data,
    p_limit: Math.min(Math.max(1, limit), 50),
  });
  if (error) return dbFail("suggestProjectsAction", error);
  return ok(data ?? []);
}

export async function suggestLocationsAction(query: string, limit = 15): Promise<Crm2Result<Crm2LocationSuggestion[]>> {
  const q = searchQuerySchema.safeParse(query);
  if (!q.success) return fail(zodErrorText(q.error));
  const session = await crm2Session();
  if (!session) return fail(AUTH_ERROR);
  const { data, error } = await session.supabase.rpc("crm2_suggest_locations", {
    p_query: q.data,
    p_limit: Math.min(Math.max(1, limit), 50),
  });
  if (error) return dbFail("suggestLocationsAction", error);
  return ok(data ?? []);
}
