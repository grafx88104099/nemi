import { Select } from "@/components/ui/select";
import type { Crm2StaffMember } from "@/lib/crm2/types";

/**
 * Оффисын CRM ажилтнаас агент сонгох (crm2_staff_directory). Одоогийн утга
 * жагсаалтад байхгүй (ажлаас гарсан) бол «идэвхгүй ажилтан» гэж үлдээнэ.
 */
export function AgentSelect({
  id,
  value,
  onChange,
  staff,
  me,
  disabled,
  emptyLabel = "— Сонгоогүй —",
  allowEmpty = true,
  currentName,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  staff: Crm2StaffMember[];
  me?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  allowEmpty?: boolean;
  /** Жагсаалтад байхгүй одоогийн агентын нэр. */
  currentName?: string | null;
  invalid?: boolean;
}) {
  const known = !value || staff.some((s) => s.profile_id === value);
  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowEmpty || !value ? <option value="">{emptyLabel}</option> : null}
      {!known ? <option value={value}>{currentName ? `${currentName} (идэвхгүй)` : "Идэвхгүй ажилтан"}</option> : null}
      {staff.map((s) => (
        <option key={s.profile_id} value={s.profile_id}>
          {s.name}
          {s.profile_id === me ? " (би)" : ""}
          {s.team_name ? ` · ${s.team_name}` : ""}
        </option>
      ))}
    </Select>
  );
}
