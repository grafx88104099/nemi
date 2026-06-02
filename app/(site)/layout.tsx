import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
