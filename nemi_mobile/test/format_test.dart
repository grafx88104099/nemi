import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/core/format.dart';

void main() {
  group('fmtMNT', () {
    test('таслал бүлэглэлт', () {
      expect(fmtMNT(285000000), '285,000,000₮');
      expect(fmtMNT(1234567), '1,234,567₮');
      expect(fmtMNT(999), '999₮');
      expect(fmtMNT(0), '0₮');
    });
    test('null → —', () {
      expect(fmtMNT(null), '—');
    });
  });

  group('shortMNT — сая/тэрбум хил утгууд', () {
    test('тэрбум (>= 1e9, 2 орон)', () {
      expect(shortMNT(1650000000), '1.65 тэрбум₮');
      expect(shortMNT(1000000000), '1.00 тэрбум₮');
    });
    test('сая (>= 1e6, бүхэл)', () {
      expect(shortMNT(285000000), '285 сая₮');
      expect(shortMNT(1000000), '1 сая₮');
      expect(shortMNT(999999999), '1000 сая₮'); // тэрбумын хилийн доор
    });
    test('сая-гийн доор — бүтэн формат', () {
      expect(shortMNT(999999), '999,999₮');
      expect(shortMNT(500), '500₮');
    });
    test('null → —', () {
      expect(shortMNT(null), '—');
    });
  });

  group('rentTermCode / rentTermLabel', () {
    test('хоёулаа утгатай', () {
      expect(rentTermCode(1, 1), '1+1');
      expect(rentTermCode(6, 1), '6+1');
      expect(rentTermLabel(2, 1), '2 сар түрээс + 1 сар барьцаа');
    });
    test('аль нэг null → null', () {
      expect(rentTermCode(null, 1), isNull);
      expect(rentTermCode(1, null), isNull);
      expect(rentTermCode(null, null), isNull);
      expect(rentTermLabel(null, 1), isNull);
    });
  });

  group('fmtArea', () {
    test('утгатай ба null', () {
      expect(fmtArea(84), '84 м²');
      expect(fmtArea(null), '—');
    });
  });

  group('daysSince / isFresh / relativeDate', () {
    final now = DateTime.utc(2026, 7, 18);
    test('daysSince', () {
      expect(daysSince('2026-07-18T00:00:00Z', now), 0);
      expect(daysSince('2026-07-15T00:00:00Z', now), 3);
    });
    test('isFresh — 7 хоногийн хил', () {
      expect(isFresh('2026-07-12T00:00:00Z', now: now), isTrue); // 6 хоног
      expect(isFresh('2026-07-11T00:00:00Z', now: now), isFalse); // 7 хоног
      expect(isFresh('2026-07-20T00:00:00Z', now: now), isFalse); // ирээдүй
    });
    test('relativeDate', () {
      expect(relativeDate('2026-07-18T00:00:00Z', now), 'Өнөөдөр');
      expect(relativeDate('2026-07-17T00:00:00Z', now), 'Өчигдөр');
      expect(relativeDate('2026-07-15T00:00:00Z', now), '3 хоногийн өмнө');
      expect(relativeDate('2026-05-18T00:00:00Z', now), '2 сарын өмнө');
      expect(relativeDate('2026-07-20T00:00:00Z', now), 'Удахгүй');
    });
  });
}
