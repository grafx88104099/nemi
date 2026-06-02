// Туршилтын хэрэглэгчид (email баталгаажсан) — dev only.
// node scripts/create-test-users.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const txt = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const l of txt.split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const users = [
  { email: "buyer@nemi.mn", password: "Nemi1234!", full_name: "Б. Энхтуяа", role: "buyer" },
  { email: "agent@nemi.mn", password: "Nemi1234!", full_name: "Тест Агент", role: "agent" },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.full_name, role: u.role },
  });
  if (error) {
    console.log(`⚠ ${u.email}: ${error.message}`);
  } else {
    console.log(`✓ ${u.email} (${u.role}) → ${data.user.id}`);
  }
}
