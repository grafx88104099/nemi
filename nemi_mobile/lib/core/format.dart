/// Вебийн lib/format.ts + lib/constants.ts-ийн rent-term helper-үүдийн порт.
/// Гаралт веб-тэй ЯГ ижил байх ёстой (сая/тэрбум хил утга, таслал бүлэглэлт).
library;

/// 1,234,567 маягийн таслал бүлэглэлт (JS Intl "mn-MN"-тэй ижил гаралт).
/// Locale өгөгдлөөс хамаарахгүйн тулд гараар бүлэглэв.
String _group(num n) {
  final neg = n < 0;
  final abs = n.abs();
  // Бүхэл ба бутархай хэсгийг салгана (веб Intl нь бутархайг ихдээ 3 орон хүртэл үзүүлдэг).
  String intPart;
  String fracPart = '';
  if (abs is int || abs == abs.truncateToDouble()) {
    intPart = abs.toInt().toString();
  } else {
    final s = abs.toStringAsFixed(3);
    final parts = s.split('.');
    intPart = parts[0];
    fracPart = parts[1].replaceFirst(RegExp(r'0+$'), '');
  }
  final buf = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(',');
    buf.write(intPart[i]);
  }
  final grouped = buf.toString();
  final frac = fracPart.isEmpty ? '' : '.$fracPart';
  return '${neg ? '-' : ''}$grouped$frac';
}

/// Үнэ форматлагч: 285,000,000₮. null → «—».
String fmtMNT(num? v) {
  if (v == null) return '—';
  return '${_group(v)}₮';
}

/// Богино үнэ: 1.65 тэрбум₮ / 285 сая₮ (вебийн shortMNT — ижил хил утгууд).
String shortMNT(num? v) {
  if (v == null) return '—';
  if (v >= 1e9) return '${(v / 1e9).toStringAsFixed(2)} тэрбум₮';
  if (v >= 1e6) return '${(v / 1e6).toStringAsFixed(0)} сая₮';
  return '${_group(v)}₮';
}

/// Талбайн м² формат.
String fmtArea(num? n) => n == null ? '—' : '$n м²';

/// «1+1» хэлбэрийн түрээсийн нөхцөлийн код. Аль нэг нь null бол null.
String? rentTermCode(int? advanceMonths, int? depositMonths) {
  if (advanceMonths == null || depositMonths == null) return null;
  return '$advanceMonths+$depositMonths';
}

/// «1 сар түрээс + 1 сар барьцаа» дэлгэрэнгүй тайлбар. Аль нэг нь null бол null.
String? rentTermLabel(int? advanceMonths, int? depositMonths) {
  if (advanceMonths == null || depositMonths == null) return null;
  return '$advanceMonths сар түрээс + $depositMonths сар барьцаа';
}

const _dayMs = 86400000;

/// Нийтэлснээс хойш өнгөрсөн бүхэл хоног.
int daysSince(String iso, [DateTime? now]) {
  final t = DateTime.parse(iso);
  final n = now ?? DateTime.now();
  return ((n.millisecondsSinceEpoch - t.millisecondsSinceEpoch) / _dayMs)
      .floor();
}

/// Зар «шинэ» эсэх (анхдагч 7 хоног дотор).
bool isFresh(String iso, {int days = 7, DateTime? now}) {
  final d = daysSince(iso, now);
  return d >= 0 && d < days;
}

/// Харьцангуй огноо: «Өнөөдөр», «Өчигдөр», «3 хоногийн өмнө» ...
String relativeDate(String iso, [DateTime? now]) {
  final day = daysSince(iso, now);
  if (day < 0) return 'Удахгүй';
  if (day == 0) return 'Өнөөдөр';
  if (day == 1) return 'Өчигдөр';
  if (day < 7) return '$day хоногийн өмнө';
  if (day < 30) return '${day ~/ 7} долоо хоногийн өмнө';
  if (day < 365) return '${day ~/ 30} сарын өмнө';
  return '${day ~/ 365} жилийн өмнө';
}

/// Бүтэн огноо: «2026 оны 6-р сарын 6».
String fmtDate(String iso) {
  final d = DateTime.parse(iso).toLocal();
  return '${d.year} оны ${d.month}-р сарын ${d.day}';
}

/// Огноо + цаг: «2026.06.08 14:30».
String fmtDateTime(String iso) {
  final d = DateTime.parse(iso).toLocal();
  String p(int n) => n.toString().padLeft(2, '0');
  return '${d.year}.${p(d.month)}.${p(d.day)} ${p(d.hour)}:${p(d.minute)}';
}
