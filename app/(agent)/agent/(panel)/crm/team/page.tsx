import { redirect } from "next/navigation";

/** Багийн ахлагчийн мэдэгдлийн хуучин холбоос → гишүүдийн явц. */
export default function AgentTeamPage() {
  redirect("/agent/crm/team/monitor");
}
