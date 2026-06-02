"use client";

import { useState, useTransition } from "react";

import { setUserRole } from "@/lib/actions/admin";

const ROLES: { v: "buyer" | "agent" | "office_admin" | "admin"; label: string }[] = [
  { v: "buyer", label: "Худалдан авагч" },
  { v: "agent", label: "Агент" },
  { v: "office_admin", label: "Оффис админ" },
  { v: "admin", label: "Админ" },
];

export function UserRoleSelect({ userId, role }: { userId: string; role: string }) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as (typeof ROLES)[number]["v"];
    setValue(v);
    startTransition(async () => {
      await setUserRole(userId, v);
    });
  }

  return (
    <select
      value={value}
      onChange={onChange}
      disabled={pending}
      className="rounded-lg border border-line bg-surface px-2 py-1 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r.v} value={r.v}>{r.label}</option>
      ))}
    </select>
  );
}
