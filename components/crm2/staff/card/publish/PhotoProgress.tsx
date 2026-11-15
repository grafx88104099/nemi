import type { PublishPhotoProgress, PublishPhotoStep } from "@/lib/crm2/publish-photos";

/** Зураг боловсруулах алхмын монгол нэр. */
export const PUBLISH_STEP_LABEL: Record<PublishPhotoStep, string> = {
  prepare: "Зураг бэлдэж байна",
  stamp: "Тамга дарж байна",
  upload: "Зураг хуулж байна",
  save: "Зард холбож байна",
};

/**
 * Тамга дарж, зураг хуулах явц. Олон зурагтай хөрөнгөд удаан үргэлжилж болох
 * тул алхам бүрийг нь харуулна («Тамга дарж байна 3/8»).
 */
export function PhotoProgress({ progress }: { progress: PublishPhotoProgress }) {
  const total = Math.max(progress.total, 1);
  const pct = Math.min(100, Math.round((progress.done / total) * 100));
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <p className="text-xs font-semibold text-ink">
        {PUBLISH_STEP_LABEL[progress.step] ?? "Зураг боловсруулж байна"}{" "}
        <span className="tabular-nums text-muted">
          {progress.done}/{progress.total}
        </span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
