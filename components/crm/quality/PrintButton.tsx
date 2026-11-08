"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Самбарын гаралт (§9(12)) — хөтчийн хэвлэх цонх, PDF болгон хадгалж болно. */
export function PrintButton({ label = "Хэвлэх" }: { label?: string }) {
  return (
    <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </Button>
  );
}
