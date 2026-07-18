/// Дэлгэрэнгүй дэлгэцийн ЦЭВЭР логик (widget-ээс салгасан — unit тестлэгдэнэ).
library;

import 'package:nemi_mobile/core/format.dart';
import 'package:nemi_mobile/models/listing.dart';

/// Галерейн зургууд: listing_photos (аль хэдийн sort_order-оор) → fallback listings.photo → [].
List<String> galleryUrls(ListingDetail l) {
  if (l.photos.isNotEmpty) {
    return l.photos.map((p) => p.url).where((u) => u.isNotEmpty).toList();
  }
  final p = l.photo;
  return (p != null && p.isNotEmpty) ? [p] : const [];
}

/// Түрээсийн нөхцөл үзүүлэх эсэх — вебтэй ижил: rent + хоёр утга хоёулаа non-null.
bool hasRentTerms(ListingDetail l) =>
    l.dealType == 'rent' &&
    l.rentAdvanceMonths != null &&
    l.rentDepositMonths != null;

/// «Эхэлж төлөх: N сар = X (Y нь буцаагдах барьцаа)» — вебийн тооцооны порт.
/// Нөхцөл эсвэл үнэ байхгүй бол null.
({int months, String total, String deposit})? rentUpfront(ListingDetail l) {
  if (!hasRentTerms(l) || l.price == null) return null;
  final adv = l.rentAdvanceMonths!;
  final dep = l.rentDepositMonths!;
  return (
    months: adv + dep,
    total: fmtMNT((adv + dep) * l.price!),
    deposit: fmtMNT(dep * l.price!),
  );
}

/// Spec tile-ууд — зөвхөн утгатай нь (вебийн нөхцөлүүд: rooms>0, area, floor!='-', year>0, parking).
List<({String label, String value})> specTiles(ListingDetail l) {
  final tiles = <({String label, String value})>[];
  final rooms = l.rooms;
  if (rooms != null && rooms > 0) tiles.add((label: 'Өрөө', value: '$rooms'));
  if (l.area != null) tiles.add((label: 'Талбай', value: fmtArea(l.area)));
  final floor = l.floor;
  if (floor != null && floor.isNotEmpty && floor != '-') {
    tiles.add((label: 'Давхар', value: floor));
  }
  final year = l.year;
  if (year != null && year > 0) tiles.add((label: 'Он', value: '$year'));
  final parking = l.parking;
  if (parking != null && parking > 0) {
    tiles.add((label: 'Зогсоол', value: '$parking'));
  }
  return tiles;
}

/// Үнийн мөр: fmtMNT + түрээст «/сар» дагавар.
String priceLine(ListingDetail l) =>
    l.dealType == 'rent' ? '${fmtMNT(l.price)}/сар' : fmtMNT(l.price);
