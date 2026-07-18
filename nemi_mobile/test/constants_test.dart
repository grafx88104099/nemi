import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/core/constants.dart';

void main() {
  test('7 дүүрэг — вебийн DISTRICTS-тэй ижил', () {
    expect(kDistricts, hasLength(7));
    expect(kDistricts, [
      'Сүхбаатар',
      'Чингэлтэй',
      'Хан-Уул',
      'Баянгол',
      'Сонгинохайрхан',
      'Баянзүрх',
      'Налайх',
    ]);
  });

  test('үл хөдлөхийн төрөл — 6, "Обьект" орсон', () {
    expect(kPropertyTypes, hasLength(6));
    expect(kPropertyTypes, contains('Обьект'));
    expect(kPropertyTypes.first, 'Орон сууц');
  });

  test('deal кодууд ба шошго', () {
    expect(kDealTypes, ['sale', 'rent']);
    expect(kDealTypeLabel['sale'], 'Худалдах');
    expect(kDealTypeLabel['rent'], 'Түрээс');
  });

  test('эрэмбэлэх кодууд', () {
    expect(kSortOptions.keys.toList(), [
      'new',
      'price_asc',
      'price_desc',
      'ai',
    ]);
    expect(kSortOptions['new'], 'Шинэлэг');
    expect(kSortOptions['ai'], 'AI оноо');
  });

  test('түрээсийн preset — вебийн RENT_TERM_PRESETS', () {
    expect(kRentTermPresets, hasLength(5));
    expect(kRentTermPresets.first, (advance: 1, deposit: 1));
    expect(kRentTermPresets.last, (advance: 1, deposit: 2));
  });

  test('posted сонголтууд', () {
    expect(kPostedOptions.keys.toList(), [1, 3, 7, 30]);
  });
}
