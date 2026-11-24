import {
  BadgeCheck,
  ExternalLink,
  FileText,
  Images,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ListingLocationMap } from "@/components/listings/ListingLocationMap";
import { AgentChip } from "@/components/crm2/ui/agent-chip";
import { CategoryBadge } from "@/components/crm2/ui/badges";
import { CodeChip } from "@/components/crm2/ui/code-chip";
import { MaskedName } from "@/components/crm2/ui/masked-name";
import { Money } from "@/components/crm2/ui/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { HISTORY_FIELD_LABEL } from "@/lib/crm2/history";
import type { Checklist, NextStep } from "@/lib/crm2/checklist";
import { PROPERTY_AGENT_ROLE_LABEL } from "@/lib/crm2/labels";
import { formatPrice } from "@/lib/crm2/money";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone, telHref } from "@/lib/crm2/phone";
import type { PropertyDetail } from "@/lib/crm2/queries/properties";
import { featureLabel, propertyTypeLabel, type Crm2Settings } from "@/lib/crm2/settings";

import { ChecklistSummary } from "../ChecklistSheet";
import { MediaGallery, type GalleryItem } from "../MediaGallery";
import { AutoTag } from "../sheets/AutoTag";
import { OpenSheetButton } from "../sheets/OpenSheetButton";
import { brokerageEndInfo, mapsHref, verifiedAge } from "../logic";
import { InfoRow, Note, Section, TextBlock } from "../parts";

/**
 * «Үндсэн мэдээлэл» таб: бүх талбар, медиа, газрын зургийн цэг (зөвхөн харах),
 * 3 үүрэгт агент, хяналтын огноо, шалгах жагсаалтын товч (дарахад жагсаалт нээгдэнэ); хувийн хэсэг ба үзүүлэх
 * заавар зөвхөн эрхтэнд.
 */
export function InfoTab({
  detail,
  settings,
  panel,
  now,
  checklist,
  next,
}: {
  detail: PropertyDetail;
  settings: Crm2Settings;
  panel: Crm2Panel;
  now: number;
  /** Картын шалгах жагсаалт (queries/checklist buildCardChecklist) — хуучин «идэвхжүүлэх нөхцөл»-ийн оронд. */
  checklist?: Checklist;
  next?: NextStep;
}) {
  const p = detail.property;
  const fieldNotes = p.field_notes && typeof p.field_notes === "object" && !Array.isArray(p.field_notes)
    ? Object.entries(p.field_notes as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""
      )
    : [];
  const gallery: GalleryItem[] = detail.media.map((m) => ({
    id: m.id,
    kind: m.kind,
    url: m.url,
    external: !m.storage_path && !!m.external_url,
    caption: m.caption,
    isCover: m.is_cover,
    mime: m.mime_type,
  }));
  const pinHref = mapsHref(p.lat, p.lng);
  const hasMapsKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const verified = verifiedAge(p.last_verified_at, now);
  const endInfo = brokerageEndInfo(p.brokerage_end_date, now);
  const unconfirmed = new Set(p.unconfirmed ?? []);
  /** Утга байгаа ч автоматаар бөглөсөн (баталгаажаагүй) бол саарал «автомат». */
  const auto = (...keys: string[]) => (keys.some((k) => unconfirmed.has(k)) ? <AutoTag className="ml-1.5 align-middle" /> : null);
  const canEdit = detail.can.edit;
  const edit = (sheet: "location" | "size" | "price" | "details" | "photos" | "roles", label?: string) =>
    canEdit ? <OpenSheetButton sheet={sheet} label={label} /> : null;
  const floor =
    p.floor != null ? (p.building_floors != null ? `${p.floor} / ${p.building_floors}` : String(p.floor)) : p.building_floors != null ? `— / ${p.building_floors}` : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {checklist && next ? <ChecklistSummary checklist={checklist} next={next} /> : null}

        <Section
          title="Үндсэн мэдээлэл"
          icon={FileText}
          action={
            canEdit ? (
              <>
                {edit("location", "Байршил")}
                {edit("size", "Хэмжээ")}
                {edit("price", "Үнэ")}
              </>
            ) : null
          }
        >
          <dl className="divide-y divide-line">
            <InfoRow label="Ангилал">
              <CategoryBadge category={p.category} labels={settings["property.category_labels"]} />
            </InfoRow>
            <InfoRow label="Хөрөнгийн төрөл">
              {p.property_type ? <>{propertyTypeLabel(settings, p.property_type)}{auto("property_type")}</> : null}
            </InfoRow>
            <InfoRow label="Төсөл">{p.project ? <>{p.project.name}{auto("project")}</> : null}</InfoRow>
            <InfoRow label="Дүүрэг">{p.district ? <>{p.district}{auto("district")}</> : null}</InfoRow>
            <InfoRow label="Байршил">{p.location_text ? <>{p.location_text}{auto("location_text")}</> : null}</InfoRow>
            <InfoRow label="Байршлын дэлгэрэнгүй">{p.address_detail ? <TextBlock text={p.address_detail} /> : null}</InfoRow>
            <InfoRow label="Хэмжээ">{p.area_m2 != null ? <>{p.area_m2} м²{auto("area_m2")}</> : null}</InfoRow>
            <InfoRow label="Өрөө">{p.rooms != null ? <>{p.rooms}{auto("rooms")}</> : null}</InfoRow>
            <InfoRow label="Давхар / барилгын давхар">{floor ? <>{floor}{auto("floor", "building_floors")}</> : null}</InfoRow>
            <InfoRow label="Ашиглалтад орсон он">{p.year_in_use != null ? <>{p.year_in_use}{auto("year_in_use")}</> : null}</InfoRow>
            <InfoRow label="Үнэ">
              {p.price != null ? (
                <>
                  <Money amount={p.price} currency={p.currency} period={p.price_period} basis={p.price_basis} total={p.price_total} />
                  {auto("price", "currency", "price_basis", "price_period")}
                </>
              ) : null}
            </InfoRow>
            <InfoRow label="Ашиглалтын зардал">
              {p.operating_cost != null ? (
                <span>
                  {formatPrice({ amount: p.operating_cost, currency: p.operating_cost_currency, period: p.operating_cost_period })}
                  {p.operating_cost_note ? <span className="block text-xs text-muted">{p.operating_cost_note}</span> : null}
                </span>
              ) : p.operating_cost_note ? (
                p.operating_cost_note
              ) : null}
            </InfoRow>
            <InfoRow label="Боломжтой огноо">
              {p.available_from || p.availability_note ? (
                <span>
                  {p.available_from ? fmtIsoDate(p.available_from) : null}
                  {p.availability_note ? <span className="block text-xs text-muted">{p.availability_note}</span> : null}
                </span>
              ) : null}
            </InfoRow>
            <InfoRow label="Онцлог">
              {p.features.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {p.features.map((f) => (
                    <Badge key={f} tone="brand">
                      {featureLabel(settings, f)}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </InfoRow>
          </dl>
        </Section>

        <Section title="Тайлбар" icon={FileText} action={edit("details")}>
          <dl className="divide-y divide-line">
            <InfoRow label="Нөхцөл">{p.condition ? <TextBlock text={p.condition} /> : null}</InfoRow>
            <InfoRow label="Харууц">{p.view_note ? <TextBlock text={p.view_note} /> : null}</InfoRow>
            <InfoRow label="Давуу тал">{p.advantages ? <TextBlock text={p.advantages} /> : null}</InfoRow>
            <InfoRow label="Нэмэлт тайлбар">{p.notes ? <TextBlock text={p.notes} /> : null}</InfoRow>
            {fieldNotes.map(([k, v]) => (
              <InfoRow key={k} label={`${HISTORY_FIELD_LABEL[k] ?? k} — тайлбар`}>
                <TextBlock text={v} />
              </InfoRow>
            ))}
          </dl>
        </Section>

        <Section title={`Зураг, бичлэг (${detail.media.length})`} icon={Images} action={edit("photos", "Зураг нэмэх")}>
          {gallery.length ? <MediaGallery items={gallery} /> : <p className="text-sm text-muted">Зураг, бичлэг оруулаагүй.</p>}
        </Section>

        <Section
          title="Газрын зураг"
          icon={MapPin}
          action={
            pinHref ? (
              <a
                href={pinHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline sm:min-h-0"
              >
                Google Maps <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null
          }
        >
          {p.lat != null && p.lng != null ? (
            <div className="space-y-2">
              {hasMapsKey ? (
                <ListingLocationMap lat={p.lat} lng={p.lng} />
              ) : (
                <p className="text-xs text-muted">Газрын зургийн түлхүүр тохируулаагүй тул зургийг харуулахгүй — Google Maps холбоосоор нээнэ үү.</p>
              )}
              {p.pin_address ? <p className="text-sm text-ink">{p.pin_address}</p> : null}
              <p className="text-xs text-muted tabular-nums">
                {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Газрын зургийн цэг тэмдэглээгүй.{p.pin_address ? ` ${p.pin_address}` : ""}</p>
          )}
        </Section>
      </div>

      <div className="min-w-0 space-y-4">
        <Section title="Үүрэгт агентууд" icon={Users} action={edit("roles")}>
          <ul className="space-y-3">
            <li>
              <AgentChip role={PROPERTY_AGENT_ROLE_LABEL.listing_agent_id} name={p.listing_agent?.full_name} avatarUrl={p.listing_agent?.avatar_url} />
            </li>
            <li>
              <AgentChip role={PROPERTY_AGENT_ROLE_LABEL.contract_agent_id} name={p.contract_agent?.full_name} avatarUrl={p.contract_agent?.avatar_url} />
            </li>
            <li>
              <AgentChip role={PROPERTY_AGENT_ROLE_LABEL.photo_agent_id} name={p.photo_agent?.full_name} avatarUrl={p.photo_agent?.avatar_url} />
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">Хэлцлийн хариуцсан агент эднээс тусдаа.</p>
        </Section>

        <PrivateSection detail={detail} panel={panel} />

        <Section title="Хяналт" icon={ShieldCheck}>
          <dl className="divide-y divide-line">
            <InfoRow label="Эзэнтэй сүүлд тулгасан">
              {p.last_verified_at ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {fmtDate(p.last_verified_at)}
                  {detail.names.lastVerifiedBy ? <span className="text-xs text-muted">· {detail.names.lastVerifiedBy}</span> : null}
                  {verified?.stale ? <Badge tone="amber">{verified.days} хоног өмнө</Badge> : null}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <BadgeCheck className="size-3.5" aria-hidden /> Тулгаагүй
                </span>
              )}
            </InfoRow>
            <InfoRow label="Зуучлалын гэрээ дуусах">
              {p.brokerage_end_date ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {fmtIsoDate(p.brokerage_end_date)}
                  {endInfo ? <Badge tone={endInfo.tone}>{endInfo.text}</Badge> : null}
                </span>
              ) : null}
            </InfoRow>
            <InfoRow label="Идэвхжсэн">{p.activated_at ? fmtDate(p.activated_at) : null}</InfoRow>
            <InfoRow label="Төлөв өөрчлөгдсөн">
              <span>
                {fmtDateTime(p.status_changed_at)}
                {p.status_reason ? <span className="block text-xs text-muted">Шалтгаан: {p.status_reason}</span> : null}
              </span>
            </InfoRow>
            <InfoRow label="Бүртгэсэн">
              {fmtDate(p.created_at)}
              {detail.names.createdBy ? ` · ${detail.names.createdBy}` : ""}
            </InfoRow>
            <InfoRow label="Сүүлд засварласан">
              {fmtDateTime(p.updated_at)}
              {detail.names.updatedBy ? ` · ${detail.names.updatedBy}` : ""}
            </InfoRow>
          </dl>
        </Section>
      </div>
    </div>
  );
}

function PrivateSection({ detail, panel }: { detail: PropertyDetail; panel: Crm2Panel }) {
  const paths = crm2Paths(panel);
  const canEdit = detail.can.edit;
  const priv = detail.private;
  if (detail.can.viewPrivate && priv) {
    const owner = priv.owner;
    return (
      <Section title="Эзэн ба дотоод мэдээлэл" icon={Lock} action={canEdit ? <OpenSheetButton sheet="owner" /> : null}>
        <dl className="divide-y divide-line">
          <InfoRow label="Эзэн">
            {owner ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <MaskedName name={owner.full_name} visible href={paths.contact(owner.id)} />
                <CodeChip code={owner.code} />
              </span>
            ) : null}
          </InfoRow>
          <InfoRow label="Эзний утас">
            {owner?.phones.length ? (
              <ul className="space-y-1">
                {owner.phones.map((ph) => {
                  const href = telHref(ph.phone);
                  return (
                    <li key={ph.id} className="flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0 text-muted" aria-hidden />
                      {href ? (
                        <a href={href} className="font-medium text-brand-700 tabular-nums hover:underline">
                          {formatPhone(ph.phone)}
                        </a>
                      ) : (
                        <span className="tabular-nums">{ph.phone}</span>
                      )}
                      {ph.label ? <span className="text-xs text-muted">{ph.label}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </InfoRow>
          <InfoRow label="Эзний тэмдэглэл">{priv.owner_note ? <TextBlock text={priv.owner_note} /> : null}</InfoRow>
          <InfoRow label="Яаж үзүүлэх">{priv.showing_instructions ? <TextBlock text={priv.showing_instructions} /> : null}</InfoRow>
        </dl>
        <p className="mt-2 text-xs text-muted">Зөвхөн эрх бүхий ажилтанд харагдана.</p>
      </Section>
    );
  }
  if (detail.can.viewShowingInfo) {
    return (
      <Section title="Яаж үзүүлэх" icon={Lock}>
        <TextBlock text={detail.showingInfo} />
        <p className="mt-2 text-xs text-muted">Энэ хөрөнгө дээр хэлцэл/үзүүлэлттэй тул харагдана. Эзний мэдээлэл хаалттай.</p>
      </Section>
    );
  }
  return (
    <Note icon={Lock}>
      Эзний холбоо барих мэдээлэл, үзүүлэх заавар зөвхөн эрх бүхий ажилтанд (болон энэ хөрөнгө дээр хэлцэлтэй агентад) харагдана.
    </Note>
  );
}
