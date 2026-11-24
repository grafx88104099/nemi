"use client";

import { MediaManager } from "@/components/crm2/staff/form/MediaManager";
import type { PropertyMediaItem } from "@/lib/crm2/queries/properties";
import type { Crm2FileLimits } from "@/lib/crm2/settings";

import { SheetShell } from "./SheetShell";

/**
 * «Зураг, бичлэг» цонх: MediaManager — profileId өгсөн тул зураг утсан дээр багасаад upload
 * дараалалаар явна (апп солиход алдагдахгүй, бичлэг Wi-Fi хүлээнэ) ба энэ хөрөнгийн хүлээгдэж буй
 * файлуудыг (PendingUploads) дотроо харуулна. Тусдаа ноорог шаардлагагүй — дараалал IDB-д.
 */
export function PhotosSheet({
  propertyId,
  officeId,
  media,
  limits,
  imagesRequired,
  me,
  onClose,
}: {
  propertyId: string;
  officeId: string;
  media: PropertyMediaItem[];
  limits: Crm2FileLimits;
  imagesRequired: boolean;
  me: string | null;
  onClose: () => void;
}) {
  return (
    <SheetShell title="Зураг, бичлэг" onClose={onClose} closeLabel="Болсон">
      <div id="cs-images" tabIndex={-1} className="outline-none">
        <MediaManager
          propertyId={propertyId}
          officeId={officeId}
          items={media}
          limits={limits}
          imagesRequired={imagesRequired}
          profileId={me}
          flow="card"
        />
      </div>
    </SheetShell>
  );
}
