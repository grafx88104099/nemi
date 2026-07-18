import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/models/agent.dart';
import 'package:nemi_mobile/models/listing.dart';
import 'package:nemi_mobile/models/profile.dart';
import 'package:nemi_mobile/models/viewing.dart';

void main() {
  group('ListingCard.fromJson', () {
    test('бүрэн JSON', () {
      final c = ListingCard.fromJson({
        'id': 'abc',
        'title': '3 өрөө орон сууц',
        'price': 285000000,
        'ai_score': 87,
        'rooms': 3,
        'area': 84.5,
        'floor': '12/18',
        'district': 'Хан-Уул',
        'photo': 'https://x/p.jpg',
        'hot': true,
        'verified': true,
        'deal_type': 'rent',
        'rent_advance_months': 1,
        'rent_deposit_months': 1,
        'created_at': '2026-07-01T00:00:00Z',
        'agent': {
          'display_name': 'Бат',
          'avatar': 'Б',
          'avatar_url': null,
          'verified': true,
          'office': {'color': '#f97316'},
        },
      });
      expect(c.id, 'abc');
      expect(c.price, 285000000);
      expect(c.area, 84.5);
      expect(c.dealType, 'rent');
      expect(c.agent?.displayName, 'Бат');
      expect(c.agent?.office?.color, '#f97316');
    });

    test('талбар дутуу JSON — унахгүй', () {
      final c = ListingCard.fromJson({'id': 'x'});
      expect(c.id, 'x');
      expect(c.price, isNull);
      expect(c.rooms, isNull);
      expect(c.hot, isFalse);
      expect(c.agent, isNull);
    });

    test('agent: null (хэрэглэгчийн зар — §13)', () {
      final c = ListingCard.fromJson({'id': 'x', 'agent': null});
      expect(c.agent, isNull);
    });

    test('илүү танигдаагүй талбар — унахгүй', () {
      final c = ListingCard.fromJson({
        'id': 'x',
        'unknown_col': 42,
        'foo': 'bar',
      });
      expect(c.id, 'x');
    });
  });

  group('ListingDetail.fromJson', () {
    test('photos sort_order-оор эрэмбэлэгдэнэ', () {
      final d = ListingDetail.fromJson({
        'id': 'd1',
        'photos': [
          {'url': 'c.jpg', 'sort_order': 2},
          {'url': 'a.jpg', 'sort_order': 0, 'is_primary': true},
          {'url': 'b.jpg', 'sort_order': 1},
        ],
      });
      expect(d.photos.map((p) => p.url).toList(), ['a.jpg', 'b.jpg', 'c.jpg']);
      expect(d.photos.first.isPrimary, isTrue);
    });

    test('дутуу/null embed-үүд — унахгүй', () {
      final d = ListingDetail.fromJson({'id': 'd2', 'agent': null});
      expect(d.agent, isNull);
      expect(d.photos, isEmpty);
      expect(d.valuations, isEmpty);
      expect(d.amenities, isEmpty);
    });

    test('amenities + valuations', () {
      final d = ListingDetail.fromJson({
        'id': 'd3',
        'amenities': ['Лифт', 'Зогсоол'],
        'valuations': [
          {'score': 90, 'note': 'ok', 'model': 'm', 'created_at': '2026-01-01'},
        ],
      });
      expect(d.amenities, ['Лифт', 'Зогсоол']);
      expect(d.valuations.single.score, 90);
    });
  });

  group('Viewing.fromJson — RLS-null embedded listing (§6)', () {
    test('listing: null — «Зар идэвхгүй болсон» кейс', () {
      final v = Viewing.fromJson({
        'id': 'v1',
        'status': 'pending',
        'listing': null,
        'agent': {'display_name': 'Сара', 'phone': '99112233'},
      });
      expect(v.listing, isNull);
      expect(v.agent?.phone, '99112233');
      expect(v.status, 'pending');
    });

    test('бүрэн мөр', () {
      final v = Viewing.fromJson({
        'id': 'v2',
        'listing_id': 'l1',
        'agent_id': 'a1',
        'buyer_id': 'b1',
        'scheduled_at': '2026-07-20T10:00:00Z',
        'status': 'confirmed',
        'listing': {'id': 'l1', 'title': 'Хаус', 'price': 500000000},
      });
      expect(v.listing?.title, 'Хаус');
      expect(v.agentId, 'a1');
    });
  });

  group('Profile / AgentInfo', () {
    test('Profile дутуу талбар', () {
      final p = Profile.fromJson({'id': 'u1'});
      expect(p.id, 'u1');
      expect(p.fullName, isNull);
      expect(p.role, isNull);
    });

    test('AgentInfo office null', () {
      final a = AgentInfo.fromJson({'display_name': 'Бат', 'office': null});
      expect(a.office, isNull);
      expect(a.verified, isFalse);
    });
  });
}
