/// Алдааг хэрэглэгчид үзүүлэх нэгдсэн MN мессеж рүү буулгах давхарга (Phase 3).
///
/// Зарчим: түүхий exception текст ("SocketException: ...") UI-д ХЭЗЭЭ Ч
/// гарахгүй — сүлжээний алдааг «Интернэт холболтоо шалгана уу.», бусдыг нь
/// generic (эсвэл дуудагчийн өгсөн fallback) мессежээр үзүүлнэ.
library;

import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Сүлжээний алдааны нэгдсэн мессеж.
const String kNetworkErrorMessage = 'Интернэт холболтоо шалгана уу.';

/// Generic алдааны нэгдсэн мессеж.
const String kGenericErrorMessage = 'Алдаа гарлаа. Дахин оролдоно уу.';

/// Сүлжээний (offline/DNS/timeout) алдаа мөн эсэх.
///
/// Типжсэн шалгалт + toString fallback: Supabase клиентүүд сүлжээний алдааг
/// янз бүрээр ораадаг (postgrest → http ClientException, auth →
/// AuthRetryableFetchException, storage/functions → өөр өөр) тул хоёуланг
/// нь хэрэглэнэ.
bool isNetworkError(Object error) {
  if (error is SocketException ||
      error is TimeoutException ||
      error is HandshakeException ||
      error is AuthRetryableFetchException) {
    return true;
  }
  final s = error.toString();
  return s.contains('SocketException') ||
      s.contains('ClientException') ||
      s.contains('HandshakeException') ||
      s.contains('Failed host lookup') ||
      s.contains('Connection refused') ||
      s.contains('Connection reset') ||
      s.contains('Connection closed') ||
      s.contains('Network is unreachable') ||
      s.contains('Operation timed out') ||
      s.contains('Connection timed out');
}

/// Алдаа → хэрэглэгчид үзүүлэх MN мессеж.
/// Сүлжээний алдаа бол [kNetworkErrorMessage], эс бол [fallback].
String mnErrorMessage(Object error, {String fallback = kGenericErrorMessage}) =>
    isNetworkError(error) ? kNetworkErrorMessage : fallback;
