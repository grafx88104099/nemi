/// Дэлгэрэнгүй дэлгэцийн цэвэр логикийн тест — түрээсийн нөхцөл + null-tolerance.
/// Сүлжээ ашиглахгүй (detail_view_logic.dart цэвэр функцууд).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:nemi_mobile/core/format.dart';
import 'package:nemi_mobile/features/listing_detail/detail_view_logic.dart';
import 'package:nemi_mobile/models/listing.dart';

void main() {
  group('rent terms', () {
    test('hasRentTerms — rent + хоёр утга байвал true', () {
      const l = ListingDetail(
        id: 'a',
        dealType: 'rent',
        rentAdvanceMonths: 1,
        rentDepositMonths: 1,
      );
      expect(hasRentTerms(l), isTrue);
    });

    test('hasRentTerms — sale бол false (утгууд байсан ч)', () {
      const l = ListingDetail(
        id: 'a',
        dealType: 'sale',
        rentAdvanceMonths: 1,
        rentDepositMonths: 1,
      );
      expect(hasRentTerms(l), isFalse);
    });

    test('hasRentTerms — аль нэг null бол false', () {
      const adv = ListingDetail(
        id: 'a',
        dealType: 'rent',
        rentAdvanceMonths: 2,
      );
      const dep = ListingDetail(
        id: 'a',
        dealType: 'rent',
        rentDepositMonths: 2,
      );
      expect(hasRentTerms(adv), isFalse);
      expect(hasRentTerms(dep), isFalse);
    });

    test('rentTermCode/Label — «1+1» вебтэй ижил', () {
      expect(rentTermCode(1, 1), '1+1');
      expect(rentTermCode(2, 1), '2+1');
      expect(rentTermCode(null, 1), isNull);
      expect(rentTermLabel(1, 2), '1 сар түрээс + 2 сар барьцаа');
    });

    test('rentUpfront — вебийн тооцоо: (adv+dep)*price, dep*price', () {
      const l = ListingDetail(
        id: 'a',
        dealType: 'rent',
        price: 1500000,
        rentAdvanceMonths: 1,
        rentDepositMonths: 2,
      );
      final u = rentUpfront(l);
      expect(u, isNotNull);
      expect(u!.months, 3);
      expect(u.total, '4,500,000₮');
      expect(u.deposit, '3,000,000₮');
    });

    test('rentUpfront — үнэ null бол null (crash хийхгүй)', () {
      const l = ListingDetail(
        id: 'a',
        dealType: 'rent',
        rentAdvanceMonths: 1,
        rentDepositMonths: 1,
      );
      expect(rentUpfront(l), isNull);
    });

    test('priceLine — rent «/сар» дагавартай, sale дагаваргүй, null «—»', () {
      expect(
        priceLine(
          const ListingDetail(id: 'a', dealType: 'rent', price: 1800000),
        ),
        '1,800,000₮/сар',
      );
      expect(
        priceLine(
          const ListingDetail(id: 'a', dealType: 'sale', price: 285000000),
        ),
        '285,000,000₮',
      );
      expect(
        priceLine(const ListingDetail(id: 'a', dealType: 'rent')),
        '—/сар',
      );
    });
  });

  group('null-listing / null-field handling', () {
    test('fromJson — хоосон JSON дээр унахгүй, бүх сонголтот талбар null', () {
      final l = ListingDetail.fromJson(const {'id': 'x'});
      expect(l.id, 'x');
      expect(l.agent, isNull);
      expect(l.photos, isEmpty);
      expect(l.amenities, isEmpty);
      expect(hasRentTerms(l), isFalse);
      expect(rentUpfront(l), isNull);
      expect(galleryUrls(l), isEmpty);
      expect(specTiles(l), isEmpty);
      expect(priceLine(l), '—');
    });

    test(
      'galleryUrls — photos байвал sort_order дараалал, үгүй бол photo fallback',
      () {
        final withPhotos = ListingDetail.fromJson(const {
          'id': 'x',
          'photo': 'https://x/cover.jpg',
          'photos': [
            {'url': 'https://x/b.jpg', 'sort_order': 2},
            {'url': 'https://x/a.jpg', 'sort_order': 1},
          ],
        });
        expect(galleryUrls(withPhotos), ['https://x/a.jpg', 'https://x/b.jpg']);

        const fallback = ListingDetail(id: 'x', photo: 'https://x/cover.jpg');
        expect(galleryUrls(fallback), ['https://x/cover.jpg']);
      },
    );

    test(
      'specTiles — зөвхөн утгатай tile-ууд; rooms/year 0 бол нуугдана; floor "-" бол нуугдана',
      () {
        const l = ListingDetail(
          id: 'x',
          rooms: 0,
          area: 54.5,
          floor: '-',
          year: 0,
          parking: 1,
        );
        final tiles = specTiles(l);
        expect(tiles.map((t) => t.label), ['Талбай', 'Зогсоол']);
        expect(tiles.first.value, '54.5 м²');
      },
    );

    test('specTiles — бүх утгатай үед 5 tile зөв дараалалтай', () {
      const l = ListingDetail(
        id: 'x',
        rooms: 3,
        area: 76,
        floor: '5/16',
        year: 2021,
        parking: 2,
      );
      expect(specTiles(l).map((t) => '${t.label}:${t.value}').toList(), [
        'Өрөө:3',
        'Талбай:76 м²',
        'Давхар:5/16',
        'Он:2021',
        'Зогсоол:2',
      ]);
    });

    test('agent null байсан ч rent/spec логик ажиллана (§13)', () {
      final l = ListingDetail.fromJson(const {
        'id': 'x',
        'deal_type': 'rent',
        'price': 2000000,
        'rent_advance_months': 1,
        'rent_deposit_months': 1,
        'agent': null,
      });
      expect(l.agent, isNull);
      expect(hasRentTerms(l), isTrue);
      expect(rentUpfront(l)!.total, '4,000,000₮');
    });
  });
}
