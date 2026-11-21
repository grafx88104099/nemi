import Link from "next/link";
import { Building2, ListTodo, Phone, Users } from "lucide-react";

import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";

/**
 * Утсанд (md-ээс доош) доод хэсэгт байнга харагдах хурдан үйлдэл. Агент
 * ихэнхдээ талбай дээр, утсаараа ажилладаг: дуудлага ирэхэд цэс ухалгүй нэг
 * товчоор хөрөнгөө сонгож бүртгэнэ, шинэ хөрөнгийг тэр дор нь нэмнэ.
 */
export function CrmQuickBar({ panel }: { panel: Crm2Panel }) {
  const p = crm2Paths(panel);
  const items = [
    { href: p.staff({ call: "1" }), label: "Дуудлага", icon: Phone },
    { href: p.staffNew(), label: "Хөрөнгө нэмэх", icon: Building2 },
    { href: p.contacts(), label: "Харилцагч", icon: Users },
    { href: p.myWork(), label: "Миний ажил", icon: ListTodo },
  ];
  return (
    <nav
      aria-label="Хурдан үйлдэл"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={label}>
            <Link
              href={href}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-ink active:bg-surface-2"
            >
              <Icon className="size-5 text-brand-600" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
