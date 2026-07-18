import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/core/theme.dart';

/// Store линкүүд. Play URL нь applicationId (mn.nemi.app)-аас гарна.
const String kPlayStoreUrl =
    'https://play.google.com/store/apps/details?id=mn.nemi.app';

/// App Store-ийн тоон ID нь апп нийтлэгдсэний ДАРАА л тодорхой болно.
/// TODO(release): 'https://apps.apple.com/app/idXXXXXXXXXX' болгож солих.
/// АНХААР: энэ хоосон байх үед `min_supported_version` kill switch-ийг
/// өргөж БОЛОХГҮЙ — iOS хэрэглэгч шинэчлэх замгүй түгжигдэнэ.
const String kAppStoreUrl = '';

/// Semver харьцуулалт: a < b бол сөрөг, тэнцүү бол 0, a > b бол эерэг.
/// '1.2.3' маягийн мөрүүд; дутуу хэсгийг 0 гэж үзнэ. Parse хийгдэхгүй
/// хэсэг гарвал [FormatException] шидэгдэнэ (дуудагч fail-open барина).
int compareSemver(String a, String b) {
  List<int> parse(String v) {
    // '1.2.3+45' / '1.2.3-beta' → зөвхөн үндсэн хэсэг.
    final core = v.trim().split(RegExp(r'[+-]')).first;
    final parts = core.split('.');
    if (parts.isEmpty || parts.length > 3) {
      throw FormatException('bad semver: $v');
    }
    return List<int>.generate(
      3,
      (i) => i < parts.length ? int.parse(parts[i]) : 0,
    );
  }

  final pa = parse(a);
  final pb = parse(b);
  for (var i = 0; i < 3; i++) {
    if (pa[i] != pb[i]) return pa[i].compareTo(pb[i]);
  }
  return 0;
}

/// Аппын хувилбар `app_config.min_supported_version`-оос бага эсэх.
///
/// Fail-open: ямар ч алдаа (хүснэгт байхгүй, сүлжээгүй, semver эвдэрхий)
/// гарвал false — хэрэглэгчийг буруугаар түгжихгүй.
Future<bool> isUpdateRequired() async {
  try {
    final row = await supa
        .from('app_config')
        .select('min_supported_version')
        .maybeSingle();
    final min = row?['min_supported_version'] as String?;
    if (min == null) return false;
    final info = await PackageInfo.fromPlatform();
    return compareSemver(info.version, min) < 0;
  } catch (_) {
    return false;
  }
}

/// Заавал шинэчлэх blocking дэлгэц.
class UpdateRequiredScreen extends StatelessWidget {
  const UpdateRequiredScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        // Landscape/жижиг өндөрт overflow хийхгүй scroll wrapper.
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.system_update, size: 64, color: kBrand),
                const SizedBox(height: 24),
                const Text(
                  'Шинэчлэх шаардлагатай',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Таны ашиглаж буй хувилбар хуучирсан байна. '
                  'Үргэлжлүүлэхийн тулд аппаа шинэчилнэ үү.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, color: kMuted),
                ),
                const SizedBox(height: 32),
                // Платформ бүрт зөвхөн өөрийнх нь store-ийн товч (iOS дээр
                // Google Play линк харуулах нь App Review 2.3.10 эрсдэлтэй).
                if (defaultTargetPlatform == TargetPlatform.iOS)
                  FilledButton(
                    onPressed: kAppStoreUrl.isEmpty
                        ? null
                        : () => launchUrl(
                            Uri.parse(kAppStoreUrl),
                            mode: LaunchMode.externalApplication,
                          ),
                    child: const Text('App Store-оос шинэчлэх'),
                  )
                else
                  FilledButton(
                    onPressed: () => launchUrl(
                      Uri.parse(kPlayStoreUrl),
                      mode: LaunchMode.externalApplication,
                    ),
                    child: const Text('Google Play-ээс шинэчлэх'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
