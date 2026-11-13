/**
 * CRM v2-ийн хуваалцах UI. Client компонентууд (filter-bar, confirm-dialog,
 * reason-dialog) өөрсдөө "use client"-тэй — энэ barrel-ийг серверээс ч импортлоно.
 */
export {
  BrokerageStatusBadge,
  CategoryBadge,
  DealStageBadge,
  PropertyStatusBadge,
  RecordStatusBadge,
  RequestStatusBadge,
  ShowingStatusBadge,
  TaskBucketBadge,
  TaskStatusBadge,
} from "./badges";
export { CodeChip } from "./code-chip";
export { MaskedName } from "./masked-name";
export { Money } from "./money";
export { AgentChip, initials } from "./agent-chip";
export {
  FilterBar,
  FilterChips,
  FilterClear,
  FilterPager,
  FilterProvider,
  FilterSearch,
  FilterSelect,
  useFilters,
  type FilterOption,
  type FilterParams,
} from "./filter-bar";
export { ConfirmDialog, type ConfirmResult } from "./confirm-dialog";
export { ReasonDialog, type ReasonValue } from "./reason-dialog";
export { HistoryList, type HistoryListRow } from "./history-list";
export { ComingSoonState, Crm2Empty, LoadErrorState, NoAccessState, NotFoundState } from "./empty";
