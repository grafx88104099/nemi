/**
 * Зарын бичвэр задлагч (P9) — нийтийн экспорт. ЦЭВЭР, клиентэд аюулгүй.
 * AI хувилбар нь lib/ai/parse-listing.ts (сервер) ба lib/crm2/actions/parse.ts.
 */
export {
  parseListingText,
  LISTING_TEXT_MAX,
  REST_MASKED_MAX,
  YEAR_MIN,
  YEAR_MAX,
  type ListingTextContext,
  type ParsedListingFields,
  type ParsedFieldKey,
  type ParsedListingText,
  type ParseConfidence,
} from "@/lib/crm2/listing-text/parse";
export {
  parseFloorText,
  describeFloor,
  formatFloorText,
  FLOOR_MIN,
  FLOOR_MAX,
  BUILDING_FLOORS_MIN,
  BUILDING_FLOORS_MAX,
  type FloorValue,
} from "@/lib/crm2/listing-text/floor";
export {
  extractPhones,
  maskPhones,
  hasPhonePattern,
  PHONE_PATTERN_SOURCE,
  PHONE_PATTERN_SAMPLES,
  PHONE_MASK,
} from "@/lib/crm2/listing-text/phones";
export {
  findPriceInText,
  parseAmountText,
  type ParsedCurrency,
  type ParsedPriceBasis,
  type ParsedPricePeriod,
  type PriceFinding,
} from "@/lib/crm2/listing-text/price";
export type { ParsedCategory, ParsedPropertyType } from "@/lib/crm2/listing-text/dictionary";
export {
  propertyParseSchema,
  sanitizeParsedFields,
  PROPERTY_PARSE_KEYS,
  type PropertyParseFields,
  type PropertyParseKey,
} from "@/lib/crm2/listing-text/schema";
