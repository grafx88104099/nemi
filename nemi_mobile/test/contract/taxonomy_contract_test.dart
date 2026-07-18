/// Taxonomy contract test (§12 risk #3/#5 — anti-drift).
///
/// Staging/prod Supabase-ийн listings хүснэгтээс distinct type/district-ийг
/// татаж Dart константуудтай (kPropertyTypes/kDistricts) тулгана — backend
/// таксономи өөрчлөгдвөл аппын шүүлтүүр чимээгүй эвдрэхээс сэргийлнэ.
///
/// Ажиллуулах:
///   flutter test --dart-define-from-file=env/staging.json test/contract
///
/// dart-define байхгүй (энгийн `flutter test`) үед автоматаар skip хийнэ —
/// офлайн unit test suite-д нөлөөлөхгүй.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:nemi_mobile/core/constants.dart';

const String _url = String.fromEnvironment('SUPABASE_URL');
const String _anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

bool get _configured =>
    _url.startsWith('https://') &&
    _anonKey.isNotEmpty &&
    !_anonKey.startsWith('TODO');

Future<List<dynamic>> _fetchRows() async {
  final client = HttpClient();
  try {
    final uri = Uri.parse(
      '$_url/rest/v1/listings?select=type,district&limit=1000',
    );
    final req = await client.getUrl(uri);
    req.headers.set('apikey', _anonKey);
    req.headers.set('Authorization', 'Bearer $_anonKey');
    final res = await req.close();
    final body = await res.transform(utf8.decoder).join();
    if (res.statusCode != 200) {
      fail('PostgREST ${res.statusCode}: $body');
    }
    return jsonDecode(body) as List<dynamic>;
  } finally {
    client.close(force: true);
  }
}

void main() {
  test(
    'listings.type / listings.district нь Dart константуудын дэд олонлог',
    () async {
      final rows = await _fetchRows();

      final dbTypes = <String>{};
      final dbDistricts = <String>{};
      for (final row in rows) {
        final r = row as Map<String, dynamic>;
        final t = r['type'] as String?;
        final d = r['district'] as String?;
        if (t != null && t.isNotEmpty) dbTypes.add(t);
        if (d != null && d.isNotEmpty) dbDistricts.add(d);
      }

      final unknownTypes = dbTypes.difference(kPropertyTypes.toSet());
      final unknownDistricts = dbDistricts.difference(kDistricts.toSet());

      expect(
        unknownTypes,
        isEmpty,
        reason:
            'DB-д kPropertyTypes-д байхгүй type байна (taxonomy drift): '
            '$unknownTypes — lib/core/constants.dart-г веб талтай тааруулна уу.',
      );
      expect(
        unknownDistricts,
        isEmpty,
        reason:
            'DB-д kDistricts-д байхгүй district байна (taxonomy drift): '
            '$unknownDistricts — lib/core/constants.dart-г веб талтай тааруулна уу.',
      );
    },
    skip: _configured
        ? false
        : 'SUPABASE_URL/ANON_KEY dart-define алга — contract тест алгасав '
              '(--dart-define-from-file=env/staging.json өгч ажиллуулна).',
  );
}
