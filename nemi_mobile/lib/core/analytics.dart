import 'package:nemi_mobile/core/supabase.dart';

/// Гол conversion event нэрүүд (Firebase-компатибль нэршил).
const String kEvCallTap = 'call_tap';
const String kEvViewingBooked = 'viewing_booked';
const String kEvFavoriteAdd = 'favorite_add';
const String kEvSearchZeroResults = 'search_zero_results';
const String kEvSignupComplete = 'signup_complete';

/// Fire-and-forget аналитик event бичилт.
///
/// `analytics_events` хүснэгт рүү insert хийнэ. Нэвтэрсэн бол user_id хавсаргана,
/// эс бол null (anon insert-ийг RLS зөвшөөрдөг). ЯМАР Ч алдаа шидэхгүй —
/// аналитик унасан ч аппын урсгалыг таслахгүй.
Future<void> logEvent(String event, [Map<String, dynamic>? props]) async {
  try {
    final userId = supa.auth.currentSession?.user.id;
    await supa.from('analytics_events').insert({
      'event': event,
      'props': props ?? const <String, dynamic>{},
      'user_id': userId,
    });
  } catch (_) {
    // Зориуд залгина: аналитикийн алдаа UI-д нөлөөлөх ёсгүй.
  }
}
