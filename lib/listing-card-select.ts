/**
 * ListingCard-ийн select мөрүүд — клиентэд аюулгүй модуль (серверийн импортгүй),
 * тул anon браузер клиент ч ашиглана.
 *
 * ЗӨВХӨН нийтийн картын багана. address_detail, owner_phone, CRM-ийн талбар
 * энд ХЭЗЭЭ Ч бүү нэм — энэ мөрийг anon браузер клиент ашигладаг.
 *
 * Оффисын самбар ч ижил картыг харуулдаг тул нэг эх сурвалжаас авна — нэг нь
 * зураггүй болж хоцрохоос сэргийлнэ. Агентын embed нь дуудлага болгонд өөр
 * (оффисын самбар agents!inner-ээр шүүдэг) тул тусад нь залгана.
 */
export const LISTING_CARD_COLUMNS =
  "id, title, price, ai_score, rooms, area, floor, district, photo, hot, verified, deal_type, " +
  "rent_advance_months, rent_deposit_months, created_at, owner_name";

/** ListingCard-д хэрэгтэй агентын embed (нийтийн хуудсууд). */
export const LISTING_CARD_AGENT = "agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))";

/** Картын бүтэн select (багана + агентын embed). */
export const LISTING_CARD_SELECT = `${LISTING_CARD_COLUMNS}, ${LISTING_CARD_AGENT}`;
