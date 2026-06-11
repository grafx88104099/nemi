import Link from "next/link";

import { getMyOffice } from "@/lib/queries-office";
import { Card, CardBody } from "@/components/ui/card";
import { VerifyToggle } from "@/components/office/VerifyToggle";
import { Badge } from "@/components/ui/badge";
import { fmtMNT } from "@/lib/format";

export const metadata = { title: "Зарууд — Оффис" };

export default async function OfficeListingsPage() {
  const data = await getMyOffice();
  if (!data) return null;
  const { listings } = data;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оффисын зарууд</h1>
      <p className="text-sm text-muted">{listings.length} зар</p>
      <Card className="mt-6">
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-muted">
              <tr>
                <th className="p-3 font-medium">Зар</th>
                <th className="p-3 font-medium">Үнэ</th>
                <th className="p-3 font-medium">Төлөв</th>
                <th className="p-3 font-medium">Баталгаа</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <Link href={`/listings/${l.id}`} className="font-medium text-ink hover:underline">{l.title}</Link>
                    <div className="text-xs text-muted">{l.district} · {l.agent?.display_name}</div>
                  </td>
                  <td className="p-3 text-ink">{fmtMNT(l.price)}</td>
                  <td className="p-3"><Badge tone={l.status === "active" ? "green" : "neutral"}>{l.status}</Badge></td>
                  <td className="p-3"><VerifyToggle kind="listing" id={l.id} initial={l.verified} /></td>
                </tr>
              ))}
              {listings.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">Зар алга.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
