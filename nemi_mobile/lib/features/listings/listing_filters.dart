/// Зарын шүүлтүүр — вебийн ListingFilters-ийн толь (lib/queries.ts).
/// Query param түлхүүрүүд вебийн /listings URL-тай ижил:
/// q, deal, district, type, rooms, minPrice, maxPrice, posted, sort.
class ListingFilters {
  final String? q;
  final String? deal; // 'sale' | 'rent'
  final String? district;
  final String? type;
  final int? roomsMin; // вебийн `rooms` (gte)
  final num? minPrice;
  final num? maxPrice;
  final int? posted; // сүүлийн N хоног (1/3/7/30)
  final String? sort; // new | price_asc | price_desc | ai

  const ListingFilters({
    this.q,
    this.deal,
    this.district,
    this.type,
    this.roomsMin,
    this.minPrice,
    this.maxPrice,
    this.posted,
    this.sort,
  });

  factory ListingFilters.fromQueryParams(Map<String, String> params) {
    final deal = params['deal'];
    return ListingFilters(
      q: _str(params['q']),
      deal: deal == 'sale' || deal == 'rent' ? deal : null,
      district: _str(params['district']),
      type: _str(params['type']),
      roomsMin: int.tryParse(params['rooms'] ?? ''),
      minPrice: num.tryParse(params['minPrice'] ?? ''),
      maxPrice: num.tryParse(params['maxPrice'] ?? ''),
      posted: int.tryParse(params['posted'] ?? ''),
      sort: _str(params['sort']),
    );
  }

  Map<String, String> toQueryParams() => {
    if (q != null && q!.isNotEmpty) 'q': q!,
    'deal': ?deal,
    'district': ?district,
    'type': ?type,
    if (roomsMin != null) 'rooms': '$roomsMin',
    if (minPrice != null) 'minPrice': '$minPrice',
    if (maxPrice != null) 'maxPrice': '$maxPrice',
    if (posted != null) 'posted': '$posted',
    'sort': ?sort,
  };

  ListingFilters copyWith({
    String? q,
    String? deal,
    String? district,
    String? type,
    int? roomsMin,
    num? minPrice,
    num? maxPrice,
    int? posted,
    String? sort,
  }) => ListingFilters(
    q: q ?? this.q,
    deal: deal ?? this.deal,
    district: district ?? this.district,
    type: type ?? this.type,
    roomsMin: roomsMin ?? this.roomsMin,
    minPrice: minPrice ?? this.minPrice,
    maxPrice: maxPrice ?? this.maxPrice,
    posted: posted ?? this.posted,
    sort: sort ?? this.sort,
  );

  static String? _str(String? v) => (v == null || v.isEmpty) ? null : v;
}
