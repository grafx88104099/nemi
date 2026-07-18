/// Вебийн lib/queries.ts getListings / getFeaturedListings-ийн шууд порт.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/listings/listing_filters.dart';
import 'package:nemi_mobile/models/listing.dart';

/// Вебийн CARD_SELECT-тэй ижил (lib/queries.ts).
const String kCardSelect =
    'id, title, price, ai_score, rooms, area, floor, district, photo, hot, verified, deal_type, '
    'rent_advance_months, rent_deposit_months, created_at, '
    'agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))';

/// Эрэмбийн багана/чиглэл — вебийн `switch (f.sort)`-ийн толь (цэвэр, тестлэгдэнэ).
({String column, bool ascending}) sortSpec(String? sort) => switch (sort) {
  'price_asc' => (column: 'price', ascending: true),
  'price_desc' => (column: 'price', ascending: false),
  'ai' => (column: 'ai_score', ascending: false),
  _ => (column: 'created_at', ascending: false),
};

/// posted (сүүлийн N хоног) → `created_at >= cutoff` ISO огноо.
/// Вебийн `new Date(Date.now() - posted * 86_400_000).toISOString()`-тэй ижил.
String? postedCutoffIso(int? posted, [DateTime? now]) {
  if (posted == null || posted <= 0) return null;
  final n = (now ?? DateTime.now()).toUtc();
  return n.subtract(Duration(days: posted)).toIso8601String();
}

/// Жагсаалт + шүүлтүүр + offset хуудаслалт (count exact) — getListings порт.
Future<({List<ListingCard> items, int count})> fetchListings(
  ListingFilters f, {
  required int page,
  int pageSize = 12,
}) async {
  final from = (page - 1) * pageSize;

  var q = supa.from('listings').select(kCardSelect).eq('status', 'active');

  final search = f.q;
  if (search != null && search.isNotEmpty) q = q.ilike('title', '%$search%');
  if (f.deal != null) q = q.eq('deal_type', f.deal!);
  if (f.district != null) q = q.eq('district', f.district!);
  if (f.type != null) q = q.eq('type', f.type!);
  if (f.roomsMin != null) q = q.gte('rooms', f.roomsMin!);
  if (f.minPrice != null) q = q.gte('price', f.minPrice!);
  if (f.maxPrice != null) q = q.lte('price', f.maxPrice!);
  final cutoff = postedCutoffIso(f.posted);
  if (cutoff != null) q = q.gte('created_at', cutoff);

  final s = sortSpec(f.sort);
  // nullsFirst: вебийн supabase-js nulls modifier заадаггүй тул Postgres-ийн
  // default (DESC → NULLS FIRST, ASC → NULLS LAST) үйлчилдэг. postgrest-dart
  // default-оороо үргэлж NULLS LAST залгадаг тул ai_score NULL зарууд веб дээр
  // эхэнд, апп дээр сүүлд гарч зөрдөг байсан — ил зааж вебтэй тааруулав.
  final res = await q
      .order(s.column, ascending: s.ascending, nullsFirst: !s.ascending)
      .range(from, from + pageSize - 1)
      .count(CountOption.exact);

  final items = res.data
      .whereType<Map<String, dynamic>>()
      .map(ListingCard.fromJson)
      .toList();
  return (items: items, count: res.count);
}

/// Онцлох идэвхтэй зарууд — getFeaturedListings порт
/// (featured=true, status='active', ai_score desc, limit 8).
Future<List<ListingCard>> fetchFeaturedListings({int limit = 8}) async {
  final data = await supa
      .from('listings')
      .select(kCardSelect)
      .eq('status', 'active')
      .eq('featured', true)
      // nullsFirst: true — вебийн DESC + Postgres default NULLS FIRST-тэй ижил.
      .order('ai_score', ascending: false, nullsFirst: true)
      .limit(limit);
  return data
      .whereType<Map<String, dynamic>>()
      .map(ListingCard.fromJson)
      .toList();
}

/// Нүүрийн онцлох rail-ийн provider (refresh: ref.invalidate).
final featuredListingsProvider = FutureProvider<List<ListingCard>>(
  (ref) => fetchFeaturedListings(),
);
