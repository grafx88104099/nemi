/// Phase 3 хатуужуулалт: алдаа → MN мессеж mapping (core/errors.dart).
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/errors.dart';

void main() {
  group('isNetworkError', () {
    test('типжсэн сүлжээний алдаанууд → true', () {
      expect(isNetworkError(const SocketException('Failed host lookup')), true);
      expect(isNetworkError(TimeoutException('timed out')), true);
      expect(isNetworkError(const HandshakeException('tls')), true);
      expect(isNetworkError(AuthRetryableFetchException()), true);
    });

    test('toString fallback (ораасон клиентийн алдаа) → true', () {
      expect(
        isNetworkError(
          Exception('ClientException with SocketException: Failed host lookup'),
        ),
        true,
      );
      expect(isNetworkError(Exception('Connection refused')), true);
      expect(isNetworkError(Exception('Network is unreachable')), true);
    });

    test('бизнес/сервер алдаа → false', () {
      expect(isNetworkError(StateError('auth')), false);
      expect(
        isNetworkError(
          const PostgrestException(message: 'duplicate key', code: '23505'),
        ),
        false,
      );
      expect(isNetworkError(Exception('random')), false);
    });
  });

  group('mnErrorMessage', () {
    test('сүлжээний алдаа → «Интернэт холболтоо шалгана уу.»', () {
      expect(mnErrorMessage(const SocketException('x')), kNetworkErrorMessage);
    });

    test('бусад алдаа → generic мессеж', () {
      expect(mnErrorMessage(StateError('boom')), kGenericErrorMessage);
    });

    test('fallback параметр generic-ийг орлоно, сүлжээнийхийг орлохгүй', () {
      expect(
        mnErrorMessage(StateError('boom'), fallback: 'Хадгалж чадсангүй.'),
        'Хадгалж чадсангүй.',
      );
      expect(
        mnErrorMessage(
          const SocketException('x'),
          fallback: 'Хадгалж чадсангүй.',
        ),
        kNetworkErrorMessage,
      );
    });

    test('түүхий exception текст мессежид ХЭЗЭЭ Ч гарахгүй', () {
      final msg = mnErrorMessage(Exception('secret-internal-detail'));
      expect(msg.contains('secret'), false);
      expect(msg.contains('Exception'), false);
    });
  });
}
