/// Дэлгэрэнгүй дэлгэцийн Phase 2 холболтын цэвэр-логик тестүүд.
/// Кросс-агент файлуудаас (favorites/viewings/account) хамааралгүй —
/// зөвхөн модел давхаргыг шалгана.
library;

import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/models/listing.dart';

void main() {
  group('ListingDetail.agentId', () {
    test('agent_id багана байвал parse хийнэ', () {
      final l = ListingDetail.fromJson({
        'id': 'l1',
        'agent_id': 'a1',
        'agent': {'id': 'a1', 'display_name': 'Бат'},
      });
      expect(l.agentId, 'a1');
    });

    test('agent_id байхгүй/null бол null (null-tolerant)', () {
      expect(ListingDetail.fromJson({'id': 'l1'}).agentId, isNull);
      expect(
        ListingDetail.fromJson({'id': 'l1', 'agent_id': null}).agentId,
        isNull,
      );
    });

    test('agent_id нэмэгдсэн ч бусад талбар өөрчлөгдөөгүй', () {
      final l = ListingDetail.fromJson({
        'id': 'l2',
        'title': 'Орц сайтай 2 өрөө',
        'price': 250,
        'agent_id': 'a9',
      });
      expect(l.id, 'l2');
      expect(l.title, 'Орц сайтай 2 өрөө');
      expect(l.price, 250);
      expect(l.agent, isNull); // embedded agent байхгүй хэвээр
    });

    test('хоосон json — default-ууд хэвээр, crash хийхгүй', () {
      final l = ListingDetail.fromJson(const {});
      expect(l.id, '');
      expect(l.agentId, isNull);
      expect(l.photos, isEmpty);
      expect(l.valuations, isEmpty);
    });
  });
}
