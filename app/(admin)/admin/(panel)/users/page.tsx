import { createClient } from "@/lib/supabase/server";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";

export const metadata = { title: "Хэрэглэгчид — Backoffice" };

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  const users = (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string; created_at: string }>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Хэрэглэгчид</h1>
      <p className="text-sm text-muted">{users.length} хэрэглэгч</p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-muted">
            <tr>
              <th className="p-3 font-medium">Нэр</th>
              <th className="p-3 font-medium">И-мэйл</th>
              <th className="p-3 font-medium">Бүртгүүлсэн</th>
              <th className="p-3 font-medium">Эрх</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium text-ink">{u.full_name || "—"}</td>
                <td className="p-3 text-muted">{u.email}</td>
                <td className="p-3 text-muted">{new Date(u.created_at).toLocaleDateString("mn-MN")}</td>
                <td className="p-3"><UserRoleSelect userId={u.id} role={u.role} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
