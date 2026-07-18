/// Вебийн lib/constants.ts-ээс ҮГЧЛЭН порт хийсэн таксономи.
/// Утга нэмэх/өөрчлөхдөө заавал веб талтай тааруулна (taxonomy drift — §12 #3).
library;

/// Үл хөдлөхийн төрөл (PROPERTY_TYPES).
const List<String> kPropertyTypes = [
  'Орон сууц',
  'Хаус',
  'Газар',
  'Оффис',
  'Худалдааны талбай',
  'Обьект',
];

/// УБ-ын 7 дүүрэг (DISTRICTS).
const List<String> kDistricts = [
  'Сүхбаатар',
  'Чингэлтэй',
  'Хан-Уул',
  'Баянгол',
  'Сонгинохайрхан',
  'Баянзүрх',
  'Налайх',
];

/// Гүйлгээний төрлийн кодууд (DEAL_TYPES).
const List<String> kDealTypes = ['sale', 'rent'];

/// DEAL_TYPE_LABEL.
const Map<String, String> kDealTypeLabel = {
  'sale': 'Худалдах',
  'rent': 'Түрээс',
};

/// Эрэмбэлэх сонголтууд — код → MN шошго (вебийн listings page SORTS).
const Map<String, String> kSortOptions = {
  'new': 'Шинэлэг',
  'price_asc': 'Үнэ: бага → их',
  'price_desc': 'Үнэ: их → бага',
  'ai': 'AI оноо',
};

/// «Нийтэлсэн хугацаа» шүүлтүүр — хоног → MN шошго (вебийн POSTED).
const Map<int, String> kPostedOptions = {
  1: 'Сүүлийн 24 цаг',
  3: 'Сүүлийн 3 хоног',
  7: 'Сүүлийн 7 хоног',
  30: 'Сүүлийн 30 хоног',
};

/// Түрээсийн X+Y нөхцөлийн бэлэн сонголтууд (RENT_TERM_PRESETS).
/// X = урьдчилж төлөх түрээсийн сар, Y = барьцааны сар.
const List<({int advance, int deposit})> kRentTermPresets = [
  (advance: 1, deposit: 1),
  (advance: 2, deposit: 1),
  (advance: 3, deposit: 1),
  (advance: 6, deposit: 1),
  (advance: 1, deposit: 2),
];
