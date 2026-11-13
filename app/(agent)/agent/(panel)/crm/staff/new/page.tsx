import { StaffFormScreen } from "@/components/crm2/staff/form/StaffFormScreen";

export const metadata = { title: "Шинэ хөрөнгө — Staff" };

/** S02 Staff хөрөнгө нэмэх (агентын панель). Дэлгэц нь components/crm2/staff/form-д. */
export default function AgentStaffNewPage() {
  return <StaffFormScreen panel="agent" />;
}
