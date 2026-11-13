import { Badge } from "@/components/ui/badge";
import { TASK_BUCKET_LABEL, type TaskBucket } from "@/lib/crm2/datetime";
import {
  BROKERAGE_STATUS_LABEL,
  BROKERAGE_STATUS_TONE,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_TONE,
  PROPERTY_CATEGORY_TONE,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_TONE,
  RECORD_STATUS_LABEL,
  RECORD_STATUS_TONE,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  SHOWING_STATUS_LABEL,
  SHOWING_STATUS_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  categoryLabel,
  type Crm2Tone,
} from "@/lib/crm2/labels";
import type {
  Crm2BrokerageStatus,
  Crm2DealStage,
  Crm2PropertyCategory,
  Crm2PropertyStatus,
  Crm2RecordStatus,
  Crm2RequestStatus,
  Crm2ShowingStatus,
  Crm2TaskStatus,
} from "@/lib/crm2/types";

/**
 * CRM v2-ийн төлөв/шатны тэмдэг (components/ui/badge дээр). Server ба client
 * компонент аль алинд ашиглана.
 */

type BadgeProps = { className?: string };

function EnumBadge({ label, tone, className }: { label: string; tone: Crm2Tone; className?: string }) {
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

/** Хөрөнгийн төлөв (Ноорог, Идэвхтэй … Архив). */
export function PropertyStatusBadge({ status, className }: BadgeProps & { status: Crm2PropertyStatus }) {
  return <EnumBadge label={PROPERTY_STATUS_LABEL[status] ?? status} tone={PROPERTY_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

/** Ангилал; `labels` — тохиргооны property.category_labels. */
export function CategoryBadge({
  category,
  labels,
  className,
}: BadgeProps & { category: Crm2PropertyCategory; labels?: Partial<Record<string, string>> | null }) {
  return <EnumBadge label={categoryLabel(category, labels)} tone={PROPERTY_CATEGORY_TONE[category] ?? "neutral"} className={className} />;
}

/** Хэлцлийн шат. */
export function DealStageBadge({ stage, className }: BadgeProps & { stage: Crm2DealStage }) {
  return <EnumBadge label={DEAL_STAGE_LABEL[stage] ?? stage} tone={DEAL_STAGE_TONE[stage] ?? "neutral"} className={className} />;
}

/** Үзүүлэлтийн төлөв (Товлосон / Үзүүлсэн / Цуцалсан / Ирээгүй). */
export function ShowingStatusBadge({ status, className }: BadgeProps & { status: Crm2ShowingStatus }) {
  return <EnumBadge label={SHOWING_STATUS_LABEL[status] ?? status} tone={SHOWING_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

/** Зуучлалын гэрээний төлөв. */
export function BrokerageStatusBadge({ status, className }: BadgeProps & { status: Crm2BrokerageStatus }) {
  return <EnumBadge label={BROKERAGE_STATUS_LABEL[status] ?? status} tone={BROKERAGE_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

export function TaskStatusBadge({ status, className }: BadgeProps & { status: Crm2TaskStatus }) {
  return <EnumBadge label={TASK_STATUS_LABEL[status] ?? status} tone={TASK_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

export function RequestStatusBadge({ status, className }: BadgeProps & { status: Crm2RequestStatus }) {
  return <EnumBadge label={REQUEST_STATUS_LABEL[status] ?? status} tone={REQUEST_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

/** Харилцагч/шаардлагын идэвхтэй/архив. */
export function RecordStatusBadge({ status, className }: BadgeProps & { status: Crm2RecordStatus }) {
  return <EnumBadge label={RECORD_STATUS_LABEL[status] ?? status} tone={RECORD_STATUS_TONE[status] ?? "neutral"} className={className} />;
}

const BUCKET_TONE: Record<TaskBucket, Crm2Tone> = {
  overdue: "rose",
  today: "amber",
  upcoming: "blue",
  none: "neutral",
};

/** «Миний ажил»-ын хугацааны бүлэг (Хугацаа хэтэрсэн / Өнөөдөр / Удахгүй). */
export function TaskBucketBadge({ bucket, className }: BadgeProps & { bucket: TaskBucket }) {
  return <EnumBadge label={TASK_BUCKET_LABEL[bucket]} tone={BUCKET_TONE[bucket]} className={className} />;
}
