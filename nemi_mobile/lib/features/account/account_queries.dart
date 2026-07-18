/// Профайлын query/action — вебийн lib/actions/profile.ts updateProfile-ийн
/// порт + өөрийн profiles мөрийн provider (RLS: id = auth.uid()).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/models/profile.dart';

/// profiles select — өөрийн мөр (own-row SELECT policy).
const String kProfileSelect =
    'id, full_name, avatar_url, phone, email, role, created_at';

/// Аватарын үсэг — цэвэр (pure) функц, unit тестлэгдэнэ.
/// Бүтэн нэрний эхний хоёр үгийн эхний үсэг ("Бат Дорж" → "БД"),
/// нэг үгтэй бол эхний үсэг; нэргүй бол и-мэйлийн эхний үсэг; эс бол '?'.
String profileInitials(String? fullName, String? email) {
  final name = fullName?.trim() ?? '';
  if (name.isNotEmpty) {
    final parts = name.split(RegExp(r'\s+'));
    final first = parts[0][0];
    final second = parts.length > 1 ? parts[1][0] : '';
    return (first + second).toUpperCase();
  }
  final mail = email?.trim() ?? '';
  if (mail.isNotEmpty) return mail[0].toUpperCase();
  return '?';
}

/// Өөрийн profiles мөр. Нэвтрээгүй үед null.
final myProfileProvider = FutureProvider<Profile?>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session == null) return null;
  final data = await supa
      .from('profiles')
      .select(kProfileSelect)
      .eq('id', session.user.id)
      .maybeSingle();
  return data == null ? null : Profile.fromJson(data);
});

/// full_name + phone шинэчлэх — вебийн updateProfile-тай ижил own-row UPDATE.
/// Алдаа гарвал шидэнэ (дуудагч нь snackbar-аар харуулна).
Future<void> updateProfile({
  required String fullName,
  required String phone,
}) async {
  final user = supa.auth.currentSession?.user;
  if (user == null) {
    throw const AuthRequiredException();
  }
  await supa
      .from('profiles')
      .update({'full_name': fullName, 'phone': phone})
      .eq('id', user.id);
}

/// Нэвтрээгүй үед хамгаалагдсан action дуудагдсаныг илэрхийлнэ.
class AuthRequiredException implements Exception {
  const AuthRequiredException();

  @override
  String toString() => 'Нэвтрэх шаардлагатай.';
}
