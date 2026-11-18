-- Шаардлагын «Бусад зайлшгүй нөхцөл» дэх урт текстийн асуудал.
--
-- Гомдол: урт нөхцөл бичвэл шаардлага хадгалагдахгүй. Шалтгаан нь мөр бүрийн
-- урт 200 тэмдэгтээр хязгаарлагдсан байсан (жагсаалтын элемент) ба алдаа нь
-- зөвхөн «хэт урт» гэж хэлдэг тул агент юу засахаа мэдэхгүй байв.
--
-- Залруулга: нэг мөрийн хязгаарыг 1000 (байршил 500) болгов. Хязгаарыг
-- өгөгдлийн санд ч давхар шалгана — шаардлагын мөр PostgREST-ээр шууд бичигдэж
-- болдог тул хязгааргүй текст орохоос сэргийлнэ. Жагсаалтын мөрийн тоог мөн
-- хязгаарлав (zod-той ижил).

create or replace function public.crm2_requirements_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta text[] := array['status', 'archived_at', 'version', 'updated_at', 'updated_by'];
begin
  new.locations := array(select distinct btrim(x) from unnest(new.locations) x where btrim(x) <> '');
  new.must_haves := array(select distinct btrim(x) from unnest(new.must_haves) x where btrim(x) <> '');
  new.districts := array(select distinct btrim(x) from unnest(coalesce(new.districts, '{}'::text[])) x
                          where btrim(x) <> '' order by 1);
  new.required_features := array(select distinct btrim(x) from unnest(coalesce(new.required_features, '{}'::text[])) x
                                  where btrim(x) <> '' order by 1);

  -- Жагсаалтын хэмжээ ба нэг мөрийн урт (lib/crm2/schemas.ts-тэй ижил).
  if cardinality(new.must_haves) > 30 then
    raise exception 'CRM: зайлшгүй нөхцөл 30-аас ихгүй мөр байна';
  end if;
  if exists (select 1 from unnest(new.must_haves) x where char_length(x) > 1000) then
    raise exception 'CRM: зайлшгүй нөхцөлийн нэг мөр 1000 тэмдэгтээс ихгүй — урт тайлбарыг «Тэмдэглэл»-д бичнэ үү';
  end if;
  if cardinality(new.locations) > 30 then
    raise exception 'CRM: байршил 30-аас ихгүй мөр байна';
  end if;
  if exists (select 1 from unnest(new.locations) x where char_length(x) > 500) then
    raise exception 'CRM: байршлын нэг мөр 500 тэмдэгтээс ихгүй';
  end if;
  if cardinality(new.districts) > 20 then
    raise exception 'CRM: дүүрэг 20-оос ихгүй';
  end if;
  if cardinality(new.required_features) > 40 then
    raise exception 'CRM: зайлшгүй онцлог 40-өөс ихгүй';
  end if;

  if tg_op = 'INSERT' then
    select c.office_id into new.office_id from public.crm2_contacts c where c.id = new.contact_id;
    if new.office_id is null then
      raise exception 'CRM: харилцагч олдсонгүй';
    end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.version := 1;
    new.status := 'active';
    new.archived_at := null;
    new.created_at := now();
  else
    if new.contact_id <> old.contact_id or new.office_id <> old.office_id
       or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'CRM: шаардлагын харилцагчийг өөрчлөхгүй';
    end if;
    new.version := old.version;
    if (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      insert into public.crm2_requirement_versions (office_id, requirement_id, contact_id, version, snapshot, replaced_by)
      values (old.office_id, old.id, old.contact_id, old.version, to_jsonb(old), auth.uid());
      new.version := old.version + 1;
    end if;
    if new.status <> old.status then
      new.archived_at := case when new.status = 'archived' then now() end;
    else
      new.archived_at := old.archived_at;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.districts is distinct from old.districts)
     and exists (select 1 from unnest(new.districts) x
                  where not (public.crm2_setting('property.districts', new.office_id) ? x)) then
    raise exception 'CRM: шаардлагын дүүрэг жагсаалтад алга';
  end if;
  if (tg_op = 'INSERT' or new.required_features is distinct from old.required_features)
     and exists (select 1 from unnest(new.required_features) x
                  where not (public.crm2_setting('property.features', new.office_id) ? x)) then
    raise exception 'CRM: тохиргоонд бүртгэлгүй онцлог байна';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
