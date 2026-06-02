"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { startAgentChat } from "@/lib/actions/chat";
import { Button } from "@/components/ui/button";

export function StartAgentChatButton({ agentId }: { agentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const res = await startAgentChat(agentId);
      if (res.error === "auth") {
        router.push("/login?next=" + encodeURIComponent(window.location.pathname));
        return;
      }
      if (res.id) router.push(`/messages?c=${res.id}`);
    });
  }

  return (
    <Button className="w-full" onClick={onClick} disabled={pending}>
      <MessageCircle className="size-4" /> {pending ? "..." : "Чат бичих"}
    </Button>
  );
}
