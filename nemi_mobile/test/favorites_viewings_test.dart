/// FAVORITES + VIEWINGS unit тестүүд (Phase 2).
///
/// ХАМГИЙН ЧУХАЛ (§6 #3): viewings insert payload-д `agent_id` явж буйг
/// assert хийнэ — агент талын RLS `owns_agent(agent_id)` тул үгүй бол
/// хүсэлт агентад хэзээ ч үл үзэгдэнэ.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/features/favorites/favorites_providers.dart';
import 'package:nemi_mobile/features/viewings/booking_sheet.dart';
import 'package:nemi_mobile/features/viewings/my_viewings_screen.dart';
import 'package:nemi_mobile/features/viewings/viewings_queries.dart';
import 'package:nemi_mobile/models/viewing.dart';

void main() {
  group('buildViewingPayload (§6 #3)', () {
    final at = DateTime.utc(2026, 7, 20, 10, 0);

    test('agent_id ЗААВАЛ payload-д байна', () {
      final p = buildViewingPayload(
        buyerId: 'buyer-1',
        listingId: 'listing-1',
        agentId: 'agent-1',
        scheduledAt: at,
      );
      expect(p.containsKey('agent_id'), isTrue);
      expect(p['agent_id'], 'agent-1');
    });

    test("status='pending' + buyer_id тавигдсан", () {
      final p = buildViewingPayload(
        buyerId: 'buyer-1',
        listingId: 'listing-1',
        agentId: 'agent-1',
        scheduledAt: at,
      );
      expect(p['status'], 'pending');
      expect(p['buyer_id'], 'buyer-1');
      expect(p['listing_id'], 'listing-1');
    });

    test('scheduled_at — UTC ISO8601 тэмдэгт мөр', () {
      final p = buildViewingPayload(
        buyerId: 'b',
        listingId: 'l',
        agentId: 'a',
        scheduledAt: DateTime.utc(2026, 7, 20, 10, 30),
      );
      expect(p['scheduled_at'], '2026-07-20T10:30:00.000Z');
      // Локал цагийг UTC руу хөрвүүлдэг.
      final local = DateTime(2026, 7, 20, 10, 30);
      final p2 = buildViewingPayload(
        buyerId: 'b',
        listingId: 'l',
        agentId: 'a',
        scheduledAt: local,
      );
      expect(DateTime.parse(p2['scheduled_at'] as String), local.toUtc());
    });

    test('agentId null үед ч түлхүүр нь явна (вебтэй ижил insert)', () {
      final p = buildViewingPayload(
        buyerId: 'b',
        listingId: 'l',
        agentId: null,
        scheduledAt: at,
      );
      expect(p.containsKey('agent_id'), isTrue);
      expect(p['agent_id'], isNull);
    });
  });

  group('Viewing.fromJson — null-listing (RLS-null §6)', () {
    test('listing: null — унахгүй, listing == null', () {
      final v = Viewing.fromJson({
        'id': 'v1',
        'scheduled_at': '2026-07-20T10:00:00Z',
        'status': 'pending',
        'listing': null,
        'agent': {'display_name': 'Бат', 'phone': '99112233'},
      });
      expect(v.id, 'v1');
      expect(v.listing, isNull);
      expect(v.status, 'pending');
      expect(v.agent?.displayName, 'Бат');
      expect(v.agent?.phone, '99112233');
    });

    test('бүрэн мөр (getMyViewings select хэлбэр)', () {
      final v = Viewing.fromJson({
        'id': 'v2',
        'scheduled_at': '2026-07-21T14:00:00Z',
        'status': 'confirmed',
        'listing': {
          'id': 'l1',
          'title': '3 өрөө',
          'district': 'Хан-Уул',
          'photo': 'https://x/p.jpg',
          'price': 285000000,
        },
        'agent': {'display_name': 'Сараа', 'phone': null},
      });
      expect(v.listing?.id, 'l1');
      expect(v.listing?.price, 285000000);
      expect(v.agent?.phone, isNull);
    });
  });

  group('FavoriteRow.fromJson — null-listing (RLS-null §6)', () {
    test(
      'listing: null — listingId хадгалагдана (swipe устгалтад хэрэгтэй)',
      () {
        final r = FavoriteRow.fromJson({
          'listing_id': 'l-gone',
          'created_at': '2026-07-01T00:00:00Z',
          'listing': null,
        });
        expect(r.listingId, 'l-gone');
        expect(r.listing, isNull);
      },
    );

    test('идэвхтэй зар — карт модель руу задарна', () {
      final r = FavoriteRow.fromJson({
        'listing_id': 'l1',
        'listing': {
          'id': 'l1',
          'title': '2 өрөө',
          'price': 150000000,
          'deal_type': 'sale',
        },
      });
      expect(r.listing?.id, 'l1');
      expect(r.listing?.price, 150000000);
    });
  });

  group('canCancelViewing', () {
    final now = DateTime(2026, 7, 18, 12, 0);

    test('pending + ирээдүйн цаг → true', () {
      expect(
        canCancelViewing(
          status: 'pending',
          scheduledAt: '2026-07-20T10:00:00Z',
          now: now,
        ),
        isTrue,
      );
    });

    test('confirmed + ирээдүйн цаг → true', () {
      expect(
        canCancelViewing(
          status: 'confirmed',
          scheduledAt: '2026-07-20T10:00:00Z',
          now: now,
        ),
        isTrue,
      );
    });

    test('өнгөрсөн цаг → false', () {
      expect(
        canCancelViewing(
          status: 'pending',
          scheduledAt: '2026-07-01T10:00:00Z',
          now: now,
        ),
        isFalse,
      );
    });

    test('done/cancelled → false', () {
      for (final s in ['done', 'cancelled', null]) {
        expect(
          canCancelViewing(
            status: s,
            scheduledAt: '2026-07-20T10:00:00Z',
            now: now,
          ),
          isFalse,
        );
      }
    });

    test('scheduled_at null эсвэл эвдэрхий → false', () {
      expect(
        canCancelViewing(status: 'pending', scheduledAt: null, now: now),
        isFalse,
      );
      expect(
        canCancelViewing(status: 'pending', scheduledAt: 'garbage', now: now),
        isFalse,
      );
    });
  });

  group('Статус chip — вебийн /tours STATUS map семантик', () {
    test('label-ууд вебтэй ЯГ ижил', () {
      expect(kViewingStatusLabel['pending'], 'Хүлээгдэж буй');
      expect(kViewingStatusLabel['confirmed'], 'Баталгаажсан');
      expect(kViewingStatusLabel['done'], 'Болсон');
      expect(kViewingStatusLabel['cancelled'], 'Цуцалсан');
    });

    test('өнгөний семантик: done/танигдаагүй → neutral fallback', () {
      expect(
        viewingStatusColor('done'),
        viewingStatusColor('something-unknown'),
      );
      expect(
        viewingStatusColor('pending'),
        isNot(viewingStatusColor('confirmed')),
      );
      expect(
        viewingStatusColor('cancelled'),
        isNot(viewingStatusColor('confirmed')),
      );
    });
  });

  group('Booking sheet — огноо/цагийн слот (ирээдүйн цаг л зөвшөөрнө)', () {
    test('bookingDates: өнөөдөр..+30 хоног (31 өдөр)', () {
      final now = DateTime(2026, 7, 18, 15, 30);
      final dates = bookingDates(now: now);
      expect(dates.length, kBookingDays + 1);
      expect(dates.first, DateTime(2026, 7, 18));
      expect(dates.last, DateTime(2026, 8, 17));
    });

    test('ирээдүйн өдөр — бүх слот (09..18 = 10 слот)', () {
      final now = DateTime(2026, 7, 18, 15, 30);
      final slots = bookingTimeSlots(DateTime(2026, 7, 20), now: now);
      expect(slots.length, 10);
      expect(slots.first.hour, 9);
      expect(slots.last.hour, 18);
    });

    test('өнөөдөр — өнгөрсөн цагийг хасна', () {
      final now = DateTime(2026, 7, 18, 15, 30);
      final slots = bookingTimeSlots(DateTime(2026, 7, 18), now: now);
      // 16:00, 17:00, 18:00 л үлдэнэ.
      expect(slots.map((t) => t.hour).toList(), [16, 17, 18]);
    });

    test('орой болсон бол өнөөдөрт слот алга', () {
      final now = DateTime(2026, 7, 18, 21, 0);
      expect(bookingTimeSlots(DateTime(2026, 7, 18), now: now), isEmpty);
    });
  });
}
