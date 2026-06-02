import { ButtonLink } from "@/components/ui/button";

export function LoginPrompt({
  title = "Нэвтрэх шаардлагатай",
  desc,
  next,
}: {
  title?: string;
  desc: string;
  next: string;
}) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-muted">{desc}</p>
      <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} className="mt-5">
        Нэвтрэх
      </ButtonLink>
    </div>
  );
}
