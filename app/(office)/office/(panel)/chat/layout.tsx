import { StaffChatLayout } from "@/components/staff-chat/StaffChatLayout";

export const metadata = { title: "Чат — Оффис" };

// 3.5rem нь панелийн толгойн өндөр: хуудас өөрөө гүйлгэгдэхгүй, жагсаалт ба яриа дотроо гүйлгэгдэнэ.
export default function OfficeChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-3.5rem)] p-3 sm:p-4 lg:p-6">
      <StaffChatLayout basePath="/office/chat" loginPath="/office/login">
        {children}
      </StaffChatLayout>
    </div>
  );
}
