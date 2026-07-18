import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/supabase.dart';

/// Auth deep-link redirect (и-мэйл баталгаажуулалт + нууц үг сэргээх).
/// Supabase dashboard-ын allowed redirect URLs-д мөн бүртгэгдсэн байх ёстой.
const String kAuthRedirectUrl = 'nemi://auth-callback';

/// Supabase auth төлөвийн stream — signedIn/signedOut/passwordRecovery г.м
/// event бүрд шинэ утга emit хийнэ.
final authStateProvider = StreamProvider<AuthState>(
  (ref) => supa.auth.onAuthStateChange,
);

/// Одоогийн session (нэвтрээгүй бол null). authStateProvider-ийг ажигладаг тул
/// login/logout болмогц хамааралтай бүх widget автоматаар дахин build хийгдэнэ.
final sessionProvider = Provider<Session?>((ref) {
  final state = ref.watch(authStateProvider);
  return state.value?.session ?? supa.auth.currentSession;
});

/// Хамгаалагдсан үйлдлийн өмнөх шалгалт: session байвал шууд true,
/// үгүй бол /login дэлгэц push хийж, буцаж ирэхэд нэвтэрсэн эсэхийг буцаана.
Future<bool> ensureLoggedIn(BuildContext context) async {
  if (supa.auth.currentSession != null) return true;
  await GoRouter.of(context).push('/login');
  return supa.auth.currentSession != null;
}
