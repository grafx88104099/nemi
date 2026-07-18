/// Хадгалсан зар — вебийн lib/actions/favorites.ts (toggleFavorite) +
/// lib/queries-user.ts (getFavoriteListings)-ийн порт.
///
/// RLS: favorites нь own-row FOR ALL (user_id = auth.uid()) — өөрийн мөрөө л
/// нэмж/устгаж/уншиж чадна. PK (user_id, listing_id).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nemi_mobile/core/analytics.dart';
import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart'
    show kCardSelect;
import 'package:nemi_mobile/models/listing.dart';

/// getFavoriteListings порт. Веб зөвхөн `listing:listings(CARD)` авч
/// null-ийг шүүдэг; мобайл "Зар идэвхгүй болсон" мөр үзүүлж, swipe-аар
/// устгах хэрэгтэй тул `listing_id`-г мөн авна (§6 #4 + RLS-null тайлбар).
const String kFavoriteSelect =
    'listing_id, created_at, listing:listings($kCardSelect)';

/// Хадгалсан заруудын ID олонлог — зүрхний төлөв хаана ч хэрэгтэй.
/// Нэвтрээгүй үед {} (алдаа биш). Login/logout-д автоматаар дахин ачаална.
final favoriteIdsProvider = FutureProvider<Set<String>>((ref) async {
  final userId = ref.watch(sessionProvider)?.user.id;
  if (userId == null) return <String>{};
  final data = await supa
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId);
  return data
      .whereType<Map<String, dynamic>>()
      .map((r) => r['listing_id'] as String?)
      .whereType<String>()
      .toSet();
});

/// Зүрх toggle — own-row insert/delete. Нэмэхэд [kEvFavoriteAdd] лог хийнэ.
/// Дуудагч тал `ref.invalidate(favoriteIdsProvider)` хийх үүрэгтэй.
Future<void> setFavorite(String listingId, bool value) async {
  final userId = supa.auth.currentSession?.user.id;
  if (userId == null) throw StateError('auth');
  if (value) {
    // PK (user_id, listing_id) — давхар дарахад duplicate-key алдаа гарахгүй.
    await supa
        .from('favorites')
        .upsert(
          {'user_id': userId, 'listing_id': listingId},
          onConflict: 'user_id,listing_id',
          ignoreDuplicates: true,
        );
    logEvent(kEvFavoriteAdd, {'listing_id': listingId}); // fire-and-forget (§9)
  } else {
    await supa
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('listing_id', listingId);
  }
}

/// Хадгалсан нэг мөр: listing_id + embedded карт (NULLABLE — зар идэвхгүй
/// болоход listings_select RLS join-ийг null болгодог, §6).
class FavoriteRow {
  final String listingId;
  final ListingCard? listing;

  const FavoriteRow({required this.listingId, this.listing});

  factory FavoriteRow.fromJson(Map<String, dynamic> json) => FavoriteRow(
    listingId: json['listing_id'] as String? ?? '',
    listing: json['listing'] is Map<String, dynamic>
        ? ListingCard.fromJson(json['listing'] as Map<String, dynamic>)
        : null,
  );
}

/// Хадгалсан дэлгэцийн жагсаалт — created_at desc (getFavoriteListings порт).
final favoriteListingsProvider = FutureProvider<List<FavoriteRow>>((ref) async {
  final userId = ref.watch(sessionProvider)?.user.id;
  if (userId == null) return const <FavoriteRow>[];
  final data = await supa
      .from('favorites')
      .select(kFavoriteSelect)
      .eq('user_id', userId)
      .order('created_at', ascending: false);
  return data
      .whereType<Map<String, dynamic>>()
      .map(FavoriteRow.fromJson)
      .toList();
});
