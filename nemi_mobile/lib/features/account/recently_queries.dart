/// Сүүлд үзсэн зарууд — вебийн recordView (lib/actions/viewings.ts) +
/// getRecentlyViewed (lib/queries-user.ts)-ийн порт.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart';
import 'package:nemi_mobile/models/listing.dart';

/// upsert-ийн conflict багана — recently_viewed-ийн unique (user_id, listing_id).
const String kRecentlyViewedOnConflict = 'user_id,listing_id';

/// Join select — вебийн `listing:listings(${CARD})`-тай ижил.
const String kRecentlyViewedSelect = 'listing:listings($kCardSelect)';

/// upsert payload — цэвэр (pure) функц, unit тестлэгдэнэ.
/// Вебтэй ижил: user_id, listing_id, viewed_at (ISO).
Map<String, dynamic> buildRecentViewPayload({
  required String userId,
  required String listingId,
  DateTime? now,
}) => {
  'user_id': userId,
  'listing_id': listingId,
  'viewed_at': (now ?? DateTime.now()).toUtc().toIso8601String(),
};

/// Зар үзсэнийг тэмдэглэх (recently_viewed upsert) — fire-and-forget.
/// Нэвтрээгүй бол чимээгүй алгасна; алдааг залгина (үзэх урсгалыг таслахгүй).
Future<void> recordView(String listingId) async {
  final user = supa.auth.currentSession?.user;
  if (user == null) return;
  try {
    await supa
        .from('recently_viewed')
        .upsert(
          buildRecentViewPayload(userId: user.id, listingId: listingId),
          onConflict: kRecentlyViewedOnConflict,
        );
  } catch (_) {
    // Зориуд залгина: recently_viewed бичилт унасан ч зар үзэхэд саад болохгүй.
  }
}

/// Сүүлд үзсэн 20 зар, viewed_at desc. Идэвхгүй болсон зарын embedded
/// `listing` нь RLS-ээр null ирдэг тул мөрийг НУУНА (§6 RLS-null тайлбар).
/// Нэвтрээгүй үед хоосон жагсаалт буцаана.
///
/// autoDispose — /recently нь push хийгддэг түр дэлгэц тул нээх бүрд шинээр
/// татна; эс бөгөөс recordView-ийн дараах шинэ үзэлтүүд session дуустал
/// кэшэнд харагдахгүй хоцордог.
final recentlyViewedProvider = FutureProvider.autoDispose<List<ListingCard>>((
  ref,
) async {
  final session = ref.watch(sessionProvider);
  if (session == null) return const [];
  final data = await supa
      .from('recently_viewed')
      .select(kRecentlyViewedSelect)
      .eq('user_id', session.user.id)
      .order('viewed_at', ascending: false)
      .limit(20);
  return data
      .whereType<Map<String, dynamic>>()
      .map((row) => row['listing'])
      .whereType<Map<String, dynamic>>()
      .map(ListingCard.fromJson)
      .toList();
});
