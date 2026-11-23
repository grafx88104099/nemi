import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { FavoritesSync } from "@/components/listings/FavoritesSync";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar site />
      <FavoritesSync />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
