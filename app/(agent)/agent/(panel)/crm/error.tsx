"use client";

import { CrmError } from "@/components/crm2/shell/CrmError";

/** CRM-ийн хуудсыг ачаалах үеийн алдаа — «Дахин оролдох» (цэс хэвээр). */
export default function CrmSegmentError(props: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return <CrmError {...props} />;
}
