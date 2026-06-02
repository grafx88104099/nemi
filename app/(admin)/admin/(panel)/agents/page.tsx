import { createClient } from "@/lib/supabase/server";
import { AgentModRow } from "@/components/admin/AgentModRow";

export const metadata = { title: "Агентууд — Backoffice" };

export default async function AdminAgentsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agents")
    .select("id, display_name, status, verified, office:offices(name)")
    .order("status", { ascending: true })
    .order("display_name");

  const rows = (data ?? []) as unknown as Array<{
    id: string; display_name: string; status: string; verified: boolean; office: { name: string } | null;
  }>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Агентууд</h1>
      <p className="text-sm text-muted">{rows.length} агент</p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr>
              <th className="p-3 font-medium">Нэр</th>
              <th className="p-3 font-medium">Оффис</th>
              <th className="p-3 font-medium">Төлөв</th>
              <th className="p-3 font-medium">Баталгаа</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <AgentModRow key={a.id} id={a.id} name={a.display_name} office={a.office?.name ?? "—"} status={a.status} verified={a.verified} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
