import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, MapPin, Phone, Mail, Globe, Calendar, BadgeCheck, Building2, ArrowLeft, Users } from "lucide-react";

import { getOfficeProfile, getAgents } from "@/lib/queries";
import { AgentCard } from "@/components/agents/AgentCard";
import { Avatar } from "@/components/ui/avatar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const office = await getOfficeProfile(id);
  return { title: office ? `${office.name} — Нэми` : "Оффис — Нэми" };
}

export default async function OfficeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const office = await getOfficeProfile(id);
  if (!office) notFound();

  const agents = await getAgents(id);
  const accent = office.color ?? "#C2410C";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/agents" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-brand-600">
        <ArrowLeft className="size-4" /> Агентууд руу буцах
      </Link>

      {/* Ковер + лого */}
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="h-40 w-full sm:h-52" style={office.cover_url ? { backgroundImage: `url(${office.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(135deg, ${accent}, #0F172A)` }} />
        <div className="relative px-6 pb-6">
          <div className="-mt-10 flex items-end gap-4">
            <div className="rounded-2xl border-4 border-surface bg-surface">
              <Avatar initials={office.logo ?? office.name.slice(0, 2)} src={office.logo_url} color={accent} size="lg" />
            </div>
            <div className="flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-ink">{office.name}</h1>
                {office.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <BadgeCheck className="size-3.5" /> Баталгаажсан
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {office.agents_count} агент · {office.listings_count} зар
                {office.founded_year ? ` · ${office.founded_year} оноос` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Зүүн: танилцуулга */}
        <div className="space-y-6">
          {(office.about || office.description) && (
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-2 flex items-center gap-2 font-bold text-ink"><Building2 className="size-5 text-brand-600" /> Танилцуулга</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{office.about || office.description}</p>
            </section>
          )}

          {office.specialties?.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-3 font-bold text-ink">Мэргэшил</h2>
              <div className="flex flex-wrap gap-2">
                {office.specialties.map((s) => (
                  <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">{s}</span>
                ))}
              </div>
            </section>
          )}

          {office.service_areas?.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-3 font-bold text-ink">Үйлчилгээний бүс</h2>
              <div className="flex flex-wrap gap-2">
                {office.service_areas.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm text-muted"><MapPin className="size-3.5" /> {s}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Баруун: холбоо барих */}
        <aside className="space-y-3 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-bold text-ink">Холбоо барих</h2>
          {office.address && <Row icon={<MapPin className="size-4" />}>{office.address}</Row>}
          {office.phone && <Row icon={<Phone className="size-4" />}><a href={`tel:${office.phone}`} className="hover:text-brand-600">{office.phone}</a></Row>}
          {office.email && <Row icon={<Mail className="size-4" />}><a href={`mailto:${office.email}`} className="hover:text-brand-600">{office.email}</a></Row>}
          {office.website && <Row icon={<Globe className="size-4" />}><a href={office.website} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">Вэбсайт</a></Row>}
          {office.license_no && <Row icon={<ShieldCheck className="size-4" />}>Лиценз: {office.license_no}</Row>}
          {office.founded_year && <Row icon={<Calendar className="size-4" />}>Үүсгэн байгуулсан: {office.founded_year}</Row>}
          {(office.facebook || office.instagram) && (
            <div className="flex gap-3 pt-2">
              {office.facebook && <a href={office.facebook} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">Facebook</a>}
              {office.instagram && <a href={office.instagram} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-600 hover:underline">Instagram</a>}
            </div>
          )}
          {!office.address && !office.phone && !office.email && !office.website && (
            <p className="text-sm text-muted">Холбоо барих мэдээлэл оруулаагүй байна.</p>
          )}
        </aside>
      </div>

      {/* Оффисын агентууд */}
      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-ink">
          <Users className="size-5 text-brand-600" /> Манай агентууд <span className="text-base font-normal text-muted">({agents.length})</span>
        </h2>
        {agents.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => <AgentCard key={a.id} a={a} />)}
          </div>
        ) : (
          <p className="py-10 text-center text-muted">Идэвхтэй агент алга.</p>
        )}
      </section>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-ink/80">
      <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
