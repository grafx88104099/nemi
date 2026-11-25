import { panelHomeFor } from "@/lib/panel-home";
import { PanelNotFound } from "@/components/layout/PanelNotFound";

/** Оффисын панелийн notFound() (агент, ажил …) — панелийн толгой хэвээр, оффисын CRM руу буцах. */
export default function OfficePanelNotFound() {
  return <PanelNotFound home={panelHomeFor("/office")} />;
}
