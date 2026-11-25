"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import type { Checklist, NextStep } from "@/lib/crm2/checklist";
import { crm2Paths, type Crm2Panel, type PropertyTab } from "@/lib/crm2/paths";
import type { PropertyDetail, PropertyMediaItem, PropertyPrivate } from "@/lib/crm2/queries/properties";
import type { Crm2FileLimits, Crm2Settings } from "@/lib/crm2/settings";
import type { Crm2BrokerageRow, Crm2StaffMember } from "@/lib/crm2/types";

import { ChecklistSheet } from "../ChecklistSheet";
import { ContractSheet } from "../contract/ContractSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { OwnerSheet } from "./OwnerSheet";
import { PhotosSheet } from "./PhotosSheet";
import { PropertyFieldSheet } from "./PropertyFieldSheet";
import { SHEET_TITLE, resolveSheet, type CardSheetParam } from "./sheet-model";
import { SheetShell } from "./SheetShell";
import { useCardSheet } from "./use-card-sheet";

const noopSubscribe = () => () => undefined;

/** Зөвхөн клиент дээр (IDB, localStorage, visualViewport) — SSR/hydration-д цонх зурахгүй. */
function useMounted(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Картын доод цонхнуудын хост: ?sheet= (next | checklist | contract | owner | location | size | price |
 * roles | details | photos | confirm | publish) ба ?field=-ээр нэг цонхыг нээнэ.
 * - next → дараагийн алхмын цонх (URL-ийг тодорхой цонхоор солино — хадгалсны дараа үсрэхгүй);
 * - contract → ContractSheet «Гэрээ бүртгэх» (ноорог, бүртгэгдсэн гэрээ эсвэл эхний PDF дээр шинэ ноорог),
 *   publish → «Зар» таб.
 */
export function CardSheetHost({
  panel,
  tab,
  property,
  priv,
  canViewPrivate,
  canEdit,
  media,
  limits,
  imagesRequired,
  checklist,
  next,
  settings,
  staff,
  me,
  teamIds,
  canReassign,
  contract,
}: {
  panel: Crm2Panel;
  tab: PropertyTab;
  property: PropertyDetail["property"];
  priv: PropertyPrivate | null;
  canViewPrivate: boolean;
  canEdit: boolean;
  media: PropertyMediaItem[];
  limits: Crm2FileLimits;
  imagesRequired: boolean;
  checklist: Checklist;
  next: NextStep;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  me: string | null;
  teamIds: string[];
  canReassign: boolean;
  /** Гэрээний цонхонд нээх гэрээ (ноорог → бүртгэгдсэн); байхгүй бол шинэ ноорог. */
  contract: Crm2BrokerageRow | null;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const { sheet: param, field: fieldParam, open, close } = useCardSheet();
  const resolved = resolveSheet(param, fieldParam, next);
  const paths = React.useMemo(() => crm2Paths(panel), [panel]);

  // «next» → тодорхой цонх (дараа нь next өөрчлөгдсөн ч энэ цонх хэвээр).
  React.useEffect(() => {
    if (param === "next" && resolved.sheet) open(resolved.sheet, resolved.field);
  }, [param, resolved.sheet, resolved.field, open]);

  // Нийтлэх нь өөрийн табтай («Зар»).
  const target = resolved.sheet;
  React.useEffect(() => {
    if (target === "publish" && tab !== "publish") router.replace(paths.property(property.id, "publish"), { scroll: false });
  }, [target, tab, router, paths, property.id]);

  // «Зуучлалын гэрээ» таб ?sheet=contract-тай ачаалагдвал BrokeragePanel өөрөө ContractSheet-ийг нээнэ —
  // тэр үед давхар цонх гаргахгүй. Хаагдсаны дараа (параметр арилвал) энд нээнэ.
  const [agreementOwnsContract, setAgreementOwnsContract] = React.useState(() => tab === "agreement" && param === "contract");
  if (agreementOwnsContract && param !== "contract") setAgreementOwnsContract(false);

  if (!mounted || !target || target === "publish") return null;
  if (target === "contract" && agreementOwnsContract) return null;

  const openSheet = (s: CardSheetParam, f?: string | null) => open(s, f ?? null);

  if (target === "contract") {
    return (
      <ContractSheet
        key="contract"
        propertyId={property.id}
        officeId={property.office_id}
        contract={contract}
        settings={settings}
        staff={staff}
        panel={panel}
        onOpenSheet={(s, f) => openSheet(s, f)}
        onClose={close}
      />
    );
  }

  if (target === "checklist") {
    return <ChecklistSheet checklist={checklist} next={next} canEdit={canEdit} onClose={close} onOpen={openSheet} />;
  }

  if (!canEdit) {
    return (
      <SheetShell title={SHEET_TITLE[target]} onClose={close}>
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Энэ хөрөнгийг үүрэгт агентууд, тэдний багийн ахлагч эсвэл менежер засна.
        </p>
      </SheetShell>
    );
  }

  switch (target) {
    case "location":
    case "size":
    case "price":
    case "roles":
    case "details":
      return (
        <PropertyFieldSheet
          key={target}
          sheet={target}
          property={property}
          settings={settings}
          me={me}
          staff={staff}
          teamIds={teamIds}
          canReassign={canReassign}
          focusField={resolved.field}
          onClose={close}
          onOpenSheet={(s) => openSheet(s)}
          contractRegistered={contract?.status === "active"}
        />
      );
    case "owner":
      return (
        <OwnerSheet
          key="owner"
          panel={panel}
          propertyId={property.id}
          priv={priv}
          canViewPrivate={canViewPrivate}
          settings={settings}
          me={me}
          focusField={resolved.field}
          onClose={close}
        />
      );
    case "photos":
      return (
        <PhotosSheet
          key="photos"
          propertyId={property.id}
          officeId={property.office_id}
          media={media}
          limits={limits}
          imagesRequired={imagesRequired}
          me={me}
          onClose={close}
        />
      );
    case "confirm":
      return <ConfirmSheet key="confirm" property={property} settings={settings} canEdit={canEdit} onClose={close} onOpenSheet={openSheet} />;
    default:
      return null;
  }
}
