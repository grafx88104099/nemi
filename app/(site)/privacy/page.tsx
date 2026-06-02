export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Нууцлалын бодлого</h1>
      <p className="mt-2 text-sm text-subtle">Сүүлд шинэчилсэн: 2026-06-01</p>
      <div className="mt-6 space-y-5 text-muted">
        <section>
          <h2 className="font-bold text-ink">1. Цуглуулдаг мэдээлэл</h2>
          <p className="mt-1">
            Бид таны нэр, и-мэйл, утас, болон платформ дээрх үйлдлийн мэдээллийг
            үйлчилгээ үзүүлэх зорилгоор цуглуулдаг.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">2. Мэдээллийн ашиглалт</h2>
          <p className="mt-1">
            Таны мэдээллийг зар тааруулах, агенттай холбох, сэрэмжлүүлэг илгээх
            зорилгоор ашиглана. Бид таны хувийн мэдээллийг гуравдагч этгээдэд
            зарж борлуулдаггүй.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">3. Таны эрх</h2>
          <p className="mt-1">
            Та өөрийн мэдээллээ хэдийд ч засах, устгах хүсэлт гаргах эрхтэй.
            Дансны тохиргооноос мэдээллээ удирдана уу.
          </p>
        </section>
      </div>
    </div>
  );
}
