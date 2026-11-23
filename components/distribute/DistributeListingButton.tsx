"use client";

import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { loadShareKit } from "@/lib/actions/distribute";
import type { ShareKitData } from "@/lib/distribute/types";

import { ShareKit } from "./ShareKit";

/**
 * Зарын мөрийн «Түгээх» товч → нэг өргөн Modal (ShareKit). Дотор нь өөр цонх
 * нээхгүй (Facebook баталгаажуулалт табын дотор). Засварласан текст алдагдахгүйн
 * тулд арын дэвсгэр дээр дарахад хаагдахгүй.
 */
export function DistributeListingButton({ listingId, title }: { listingId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ShareKitData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openKit() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await loadShareKit(listingId);
      if (res.ok) setData(res.data);
      else setError(res.error);
    } catch {
      toast.error("Алдаа гарлаа. Дахин оролдоно уу.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openKit}
        aria-label={`${title} зарыг түгээх`}
        title="Түгээх"
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
      >
        <Megaphone className="size-4" aria-hidden />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Түгээх — Facebook, Viber, unegui.mn"
        closeOnBackdrop={false}
      >
        <div className="p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Ачаалж байна…
            </p>
          ) : error ? (
            <p role="alert" className="text-sm text-danger">{error}</p>
          ) : data ? (
            <ShareKit data={data} />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
