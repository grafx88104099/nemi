/// Зарын дэлгэрэнгүйн query давхарга — вебийн getListingById / getListingPoint порт.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/models/listing.dart';

/// Вебийн LISTING_DETAIL_SELECT-ийн үгчилсэн порт (lib/queries.ts).
/// Нийтийн хуудас тул agent/office-оос зөвхөн ил гаргаж болох баганууд.
const String kListingDetailSelect =
    '*, agent:agents(id, display_name, avatar, avatar_url, verified, rating, reviews_count, phone, '
    'office:offices(name, color)), photos:listing_photos(url, sort_order, is_primary), '
    'valuations:ai_valuations(score, note, model, created_at)';

/// Зарын дэлгэрэнгүй. Олдохгүй/идэвхгүй (RLS status='active') бол null —
/// deep-link аюулгүй байдал: crash хийхгүй, "Зар олдсонгүй" дэлгэц үзүүлнэ (§6).
Future<ListingDetail?> fetchListingDetail(String id) async {
  final data = await supa
      .from('listings')
      .select(kListingDetailSelect)
      .eq('id', id)
      .maybeSingle();
  if (data == null) return null;
  return ListingDetail.fromJson(data);
}

/// Координат — `listing_point` RPC (returns table(lng float8, lat float8)).
/// location null эсвэл зар олдохгүй бол хоосон list ирдэг → null.
Future<({double lng, double lat})?> fetchListingPoint(String id) async {
  try {
    final data = await supa.rpc('listing_point', params: {'p_id': id});
    final row = (data as List?)?.whereType<Map<String, dynamic>>().firstOrNull;
    final lng = (row?['lng'] as num?)?.toDouble();
    final lat = (row?['lat'] as num?)?.toDouble();
    if (lng == null || lat == null) return null;
    return (lng: lng, lat: lat);
  } catch (_) {
    return null; // газрын зураг нэмэлт feature — алдаа залгихад аюулгүй
  }
}

/// Riverpod: дэлгэрэнгүй query (ref.invalidate-аар дахин татна).
final listingDetailProvider = FutureProvider.family<ListingDetail?, String>(
  (ref, id) => fetchListingDetail(id),
);
