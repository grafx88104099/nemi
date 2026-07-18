/// Account feature-ийн цэвэр (pure) логикийн тестүүд:
/// аватарын үсэг + recently_viewed upsert payload/select гэрээ.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/features/account/account_queries.dart';
import 'package:nemi_mobile/features/account/recently_queries.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart';

void main() {
  group('profileInitials', () {
    test('хоёр үгтэй нэр — хоёр үсэг', () {
      expect(profileInitials('Бат Дорж', null), 'БД');
    });

    test('олон зайтай нэрийг тэсвэрлэнэ', () {
      expect(profileInitials('  бат   эрдэнэ  ', null), 'БЭ');
    });

    test('нэг үгтэй нэр — нэг үсэг', () {
      expect(profileInitials('Сараа', 'x@y.mn'), 'С');
    });

    test('нэргүй бол и-мэйлийн эхний үсэг', () {
      expect(profileInitials(null, 'bat@example.mn'), 'B');
      expect(profileInitials('   ', 'bat@example.mn'), 'B');
    });

    test('нэр ч, и-мэйл ч байхгүй бол ?', () {
      expect(profileInitials(null, null), '?');
      expect(profileInitials('', ''), '?');
    });
  });

  group('buildRecentViewPayload (recordView гэрээ)', () {
    test('вебийн recordView-тэй ижил түлхүүрүүд', () {
      final now = DateTime.utc(2026, 7, 18, 10, 30);
      final p = buildRecentViewPayload(
        userId: 'user-1',
        listingId: 'listing-9',
        now: now,
      );
      expect(p.keys.toSet(), {'user_id', 'listing_id', 'viewed_at'});
      expect(p['user_id'], 'user-1');
      expect(p['listing_id'], 'listing-9');
      expect(p['viewed_at'], '2026-07-18T10:30:00.000Z');
    });

    test('viewed_at нь UTC ISO форматтай', () {
      final p = buildRecentViewPayload(userId: 'u', listingId: 'l');
      expect(p['viewed_at'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}T.*Z$')));
    });

    test('onConflict багана — unique (user_id, listing_id)', () {
      expect(kRecentlyViewedOnConflict, 'user_id,listing_id');
    });
  });

  group('select стрингүүд', () {
    test(
      'recently select нь CARD_SELECT-тэй listing join хийдэг (веб порт)',
      () {
        expect(kRecentlyViewedSelect, 'listing:listings($kCardSelect)');
        expect(kRecentlyViewedSelect, contains('agent:agents('));
      },
    );

    test('profiles select — засварт хэрэгтэй талбарууд', () {
      for (final col in ['id', 'full_name', 'phone', 'email', 'role']) {
        expect(kProfileSelect, contains(col));
      }
    });
  });
}
