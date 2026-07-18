/// Цэвэр (pure) validation логик — widget-ээс салангид, unit тестлэгдэнэ.
/// Дүрэм вебийн формуудтай ижил: нууц үг хамгийн багадаа 6 тэмдэгт
/// (components/auth/SignupForm.tsx, ResetPasswordForm.tsx).
library;

/// Нууц үгийн доод урт — вебтэй ижил.
const int kMinPasswordLength = 6;

final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// null = зөв; эс бол MN алдааны текст (Form validator-т шууд өгнө).
String? validateEmail(String? value) {
  final v = value?.trim() ?? '';
  if (v.isEmpty) return 'И-мэйлээ оруулна уу.';
  if (!_emailRe.hasMatch(v)) return 'И-мэйл хаяг буруу байна.';
  return null;
}

String? validatePassword(String? value) {
  final v = value ?? '';
  if (v.isEmpty) return 'Нууц үгээ оруулна уу.';
  if (v.length < kMinPasswordLength) {
    return 'Нууц үг хамгийн багадаа $kMinPasswordLength тэмдэгт.';
  }
  return null;
}

String? validatePasswordConfirm(String password, String? confirm) {
  if ((confirm ?? '').isEmpty) return 'Нууц үгээ давтан оруулна уу.';
  if (password != confirm) return 'Нууц үг таарахгүй байна.';
  return null;
}

String? validateFullName(String? value) {
  if ((value ?? '').trim().isEmpty) return 'Бүтэн нэрээ оруулна уу.';
  return null;
}
