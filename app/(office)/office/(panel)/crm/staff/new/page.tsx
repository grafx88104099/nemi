import { StaffFormScreen } from "@/components/crm2/staff/form/StaffFormScreen";

export const metadata = { title: "Шинэ хөрөнгө — Staff" };

/** S02 Staff хөрөнгө нэмэх (оффисын панель). Дэлгэц нь components/crm2/staff/form-д. */
export default function OfficeStaffNewPage() {
  return <StaffFormScreen panel="office" />;
}
