"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Crm2Panel } from "@/lib/crm2/paths";
import { cn } from "@/lib/utils";

import { FromMyListingsSheet } from "./FromMyListingsSheet";
import { parseImportParam } from "./import-model";

/**
 * «Миний зараас» товч ба доод цонх (Staff жагсаалтын толгой, «Миний дутуу хөрөнгө»).
 * autoOpenFromQuery: ?import=1 | ?import=<listing id> үед өөрөө нээгдэж (зарын хуудасны чип),
 * хаахад параметрийг URL-аас хасна.
 */
export function ImportListingsButton({
  panel,
  label = "Миний зараас",
  autoOpenFromQuery = false,
  className,
}: {
  panel: Crm2Panel;
  label?: string;
  autoOpenFromQuery?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const fromQuery = autoOpenFromQuery ? parseImportParam(sp.get("import")) : { open: false, listingId: null };
  const [open, setOpen] = React.useState(fromQuery.open);
  const [initial] = React.useState(fromQuery.listingId);

  function close() {
    setOpen(false);
    if (autoOpenFromQuery && sp.get("import")) {
      const q = new URLSearchParams(sp.toString());
      q.delete("import");
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="md" className={cn("shrink-0", className)} onClick={() => setOpen(true)}>
        <Download className="size-4" aria-hidden />
        {label}
      </Button>
      <FromMyListingsSheet open={open} onClose={close} panel={panel} initialListingId={initial} />
    </>
  );
}
