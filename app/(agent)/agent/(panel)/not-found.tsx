import { panelHomeFor } from "@/lib/panel-home";
import { PanelNotFound } from "@/components/layout/PanelNotFound";

/** Агентын панелийн notFound() (зар засах, ажил, төсөл …) — Topbar хэвээр, CRM руу буцах. */
export default function AgentPanelNotFound() {
  return <PanelNotFound home={panelHomeFor("/agent")} />;
}
