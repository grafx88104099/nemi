import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { StaffChatLayout } from "@/components/staff-chat/StaffChatLayout";

export const metadata = { title: "Чат — Агент" };

// 4rem + 1px нь Topbar-ийн өндөр (доод хүрээтэй): хуудас өөрөө гүйлгэгдэхгүй, жагсаалт ба яриа дотроо гүйлгэгдэнэ.
export default function AgentChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-1px)] max-w-7xl flex-col px-4 py-3">
      <DashboardNav />
      <div className="mt-3 min-h-0 flex-1">
        <StaffChatLayout basePath="/agent/chat" loginPath="/agent/login?next=/agent/chat">
          {children}
        </StaffChatLayout>
      </div>
    </div>
  );
}
