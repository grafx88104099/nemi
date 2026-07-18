import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/features/listings/listing_filters.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart';

void main() {
  group('ListingFilters query param roundtrip', () {
    test('бүрэн шүүлтүүр → toQueryParams → fromQueryParams ижил', () {
      const f = ListingFilters(
        q: 'Хан-Уул',
        deal: 'rent',
        district: 'Хан-Уул',
        type: 'Орон сууц',
        roomsMin: 2,
        minPrice: 500000,
        maxPrice: 2500000,
        posted: 7,
        sort: 'price_asc',
      );
      final params = f.toQueryParams();
      // Түлхүүрүүд вебийн /listings URL-тай ижил.
      expect(params, {
        'q': 'Хан-Уул',
        'deal': 'rent',
        'district': 'Хан-Уул',
        'type': 'Орон сууц',
        'rooms': '2',
        'minPrice': '500000',
        'maxPrice': '2500000',
        'posted': '7',
        'sort': 'price_asc',
      });
      final back = ListingFilters.fromQueryParams(params);
      expect(back.q, f.q);
      expect(back.deal, f.deal);
      expect(back.district, f.district);
      expect(back.type, f.type);
      expect(back.roomsMin, f.roomsMin);
      expect(back.minPrice, f.minPrice);
      expect(back.maxPrice, f.maxPrice);
      expect(back.posted, f.posted);
      expect(back.sort, f.sort);
    });

    test('хоосон шүүлтүүр → хоосон params', () {
      expect(const ListingFilters().toQueryParams(), isEmpty);
    });

    test('буруу deal утга null болно (вебийн validation)', () {
      final f = ListingFilters.fromQueryParams({'deal': 'lease'});
      expect(f.deal, isNull);
    });

    test('хоосон string утгууд null болно', () {
      final f = ListingFilters.fromQueryParams({'q': '', 'district': ''});
      expect(f.q, isNull);
      expect(f.district, isNull);
    });

    test('тоон биш rooms/price null болно', () {
      final f = ListingFilters.fromQueryParams({
        'rooms': 'abc',
        'minPrice': 'x',
        'posted': '',
      });
      expect(f.roomsMin, isNull);
      expect(f.minPrice, isNull);
      expect(f.posted, isNull);
    });
  });

  group('sortSpec — вебийн switch(f.sort) толь', () {
    test('price_asc', () {
      final s = sortSpec('price_asc');
      expect(s.column, 'price');
      expect(s.ascending, isTrue);
    });
    test('price_desc', () {
      final s = sortSpec('price_desc');
      expect(s.column, 'price');
      expect(s.ascending, isFalse);
    });
    test('ai', () {
      final s = sortSpec('ai');
      expect(s.column, 'ai_score');
      expect(s.ascending, isFalse);
    });
    test('default (new / null / unknown) → created_at desc', () {
      for (final v in [null, 'new', 'garbage']) {
        final s = sortSpec(v);
        expect(s.column, 'created_at');
        expect(s.ascending, isFalse);
      }
    });
  });

  group('postedCutoffIso — posted → created_at gte cutoff', () {
    test('null/0/сөрөг → null (вебийн f.posted && f.posted > 0)', () {
      expect(postedCutoffIso(null), isNull);
      expect(postedCutoffIso(0), isNull);
      expect(postedCutoffIso(-3), isNull);
    });

    test('N хоногийн өмнөх UTC ISO огноо', () {
      final now = DateTime.utc(2026, 7, 18, 12, 0, 0);
      final iso = postedCutoffIso(7, now);
      expect(iso, isNotNull);
      final cutoff = DateTime.parse(iso!);
      expect(cutoff, DateTime.utc(2026, 7, 11, 12, 0, 0));
    });
  });

  group('kCardSelect — вебийн CARD_SELECT-тэй ижил', () {
    test('бүх багана орсон', () {
      for (final col in [
        'id',
        'title',
        'price',
        'ai_score',
        'rooms',
        'area',
        'floor',
        'district',
        'photo',
        'hot',
        'verified',
        'deal_type',
        'rent_advance_months',
        'rent_deposit_months',
        'created_at',
      ]) {
        expect(kCardSelect.contains(col), isTrue, reason: col);
      }
      expect(
        kCardSelect.contains(
          'agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))',
        ),
        isTrue,
      );
    });
  });
}
