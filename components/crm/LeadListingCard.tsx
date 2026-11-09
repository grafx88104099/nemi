"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, RefreshCcw } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ListingLines, ListingPicker, ListingThumb } from "@/components/crm/ListingPicker";
import { setLeadListing } from "@/lib/actions/crm-lead-listing";
import { listingInactiveLabel, type LeadListingOption } from "@/lib/crm/lead-listing";
import { fmtDate } from "@/lib/format";
import type { LeadDetail } from "@/lib/queries-crm-leads";

/**
 * Сэжмийн карт дээрх зар. Идэвхтэй зарын одоогийн мэдээллийг, зар идэвхгүй
 * болсон, устсан эсвэл энэ хэрэглэгчид харагдахгүй бол бүртгэсэн үеийн хуулбарыг харуулна.
 */
export function LeadListingCard({
  lead,
  canEdit,
}: {
  lead: Pick<LeadDetail, "id" | "listing_id" | "listing_snapshot" | "listing_live" | "listing_live_status">;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<LeadListingOption | null>(null);

  const hasListing = !!lead.listing_id || !!lead.listing_snapshot;
  const shown = lead.listing_live ?? lead.listing_snapshot;
  const inactiveLabel = hasListing ? listingInactiveLabel(lead.listing_live_status) : null;
  const actionLabel = hasListing ? "Зар солих" : "Зар холбох";

  function close() {
    setOpen(false);
    setPick(null);
  }

  function save(listingId: string | null) {
    startTransition(async () => {
      const res = await setLeadListing(lead.id, listingId);
      if (!res.ok) {
        toast.error(res.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      toast.success(listingId ? "Зар холбогдлоо" : "Зарын холбоос салгагдлаа");
      close();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">Холбогдсон зар</h3>
          {canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              {hasListing ? <RefreshCcw className="size-4" /> : <Link2 className="size-4" />} {actionLabel}
            </Button>
          ) : null}
        </div>

        {shown ? (
          <div className="mt-2 flex gap-3">
            <ListingThumb photo={shown.photo} className="size-20 rounded-xl sm:size-24" sizes="96px" />
            <div className="min-w-0 flex-1">
              <ListingLines listing={shown} fullTitle />
              {inactiveLabel ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone="amber">{inactiveLabel}</Badge>
                  {lead.listing_snapshot ? <span>Бүртгэсэн үеийн мэдээлэл · {fmtDate(lead.listing_snapshot.captured_at)}</span> : null}
                </div>
              ) : (
                <Link
                  href={`/listings/${lead.listing_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  nemi.mn дээр харах <ExternalLink className="size-3.5" />
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {hasListing ? "Холбогдсон зарын мэдээлэл олдсонгүй." : "Энэ сэжим тодорхой зартай холбогдоогүй."}
          </p>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={close}
        title={actionLabel}
        footer={
          <div className="flex w-full items-center justify-end gap-2 border-t border-line p-4">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Болих
            </Button>
            <Button onClick={() => pick && save(pick.id)} disabled={pending || !pick}>
              {pending ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          <ListingPicker value={pick} onChange={setPick} disabled={pending} />
          {hasListing ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(null)}
              className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
            >
              Зарын холбоосыг салгах
            </button>
          ) : null}
        </div>
      </Modal>
    </Card>
  );
}
