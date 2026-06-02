export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Үйлчилгээний нөхцөл</h1>
      <p className="mt-2 text-sm text-subtle">Сүүлд шинэчилсэн: 2026-06-01</p>
      <div className="mt-6 space-y-5 text-muted">
        <section>
          <h2 className="font-bold text-ink">1. Ерөнхий нөхцөл</h2>
          <p className="mt-1">
            Нэми платформыг ашигласнаар та энэхүү нөхцөлийг хүлээн зөвшөөрч байгаа
            болно. Платформ нь үл хөдлөх хөрөнгийн зар сурталчилгаа, агент
            холбох үйлчилгээ үзүүлдэг зуучлагч талбар юм.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">2. Хэрэглэгчийн үүрэг</h2>
          <p className="mt-1">
            Хэрэглэгч үнэн зөв мэдээлэл оруулах, бусдын эрхийг хүндэтгэх, хуурамч
            зар нийтлэхгүй байх үүрэгтэй. Зөрчил гаргасан бүртгэлийг түдгэлзүүлж болно.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-ink">3. Хариуцлагын хязгаарлалт</h2>
          <p className="mt-1">
            Нэми нь зарын мэдээллийн үнэн зөвийг бүрэн баталгаажуулах боломжгүй
            бөгөөд хэлцлийн эцсийн хариуцлагыг тал бүр өөрөө хүлээнэ. AI үнэлгээ нь
            зөвхөн лавлагаа шинжтэй.
          </p>
        </section>
      </div>
    </div>
  );
}
