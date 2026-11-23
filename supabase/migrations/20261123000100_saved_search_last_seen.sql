-- R03 «Миний Нэми»: хадгалсан хайлтыг сүүлд нээсэн цаг.
-- NULL = хэзээ ч нээгээгүй → код created_at-аар орлуулна («N шинэ» тоолох суурь).
--
-- Хамрах хүрээ: зөвхөн public.saved_searches дээр nullable багана нэмнэ.
--  * Default-гүй nullable багана → метадата өөрчлөлт (хүснэгт дахин бичихгүй);
--    ACCESS EXCLUSIVE түгжээ хором зуур. lock_timeout-оор амьд сайтыг хүлээлгэхгүй.
--  * Backfill байхгүй: одоо байгаа мөрүүд NULL хэвээр (= created_at-аар тоолно).
--  * saved_searches дээр триггер байхгүй (prod-д шалгасан) → UPDATE-д дагалдах үйлдэлгүй.
--  * RLS: saved_searches_own (ALL, user_id = auth.uid()) хэвээр хамаарна — хэрэглэгч
--    зөвхөн өөрийн мөрийн last_seen_at-ийг уншиж/шинэчилнэ; anon-д auth.uid() = NULL
--    тул мөр харагдахгүй. Хүснэгтийн түвшний grant шинэ баганад автоматаар хамаарна.
--    Бодлого, grant, функц өөрчлөхгүй.

set local lock_timeout = '5s';

alter table public.saved_searches
  add column if not exists last_seen_at timestamptz;

comment on column public.saved_searches.last_seen_at is
  'Хэрэглэгч энэ хайлтыг /listings?ss=<id>-ээр сүүлд нээсэн цаг; «шинэ зар» тоолоход ашиглана. NULL = created_at.';
