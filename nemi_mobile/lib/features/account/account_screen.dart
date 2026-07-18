import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/account/account_queries.dart';
import 'package:nemi_mobile/features/account/login_prompt.dart';
import 'package:nemi_mobile/features/auth/auth_validators.dart';
import 'package:nemi_mobile/models/profile.dart';

/// Профайл дэлгэц (§6 #7): profiles мөр + засах sheet + цэс +
/// Гарах + Бүртгэл устгах (delete-account Edge Function — §2.2).
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Профайл')),
      body: session == null
          ? const LoginPrompt(
              message:
                  'Нэвтэрснээр профайлаа засах, хадгалсан зар,\n'
                  'үзэлт товлолтоо удирдах боломжтой.',
            )
          : _AccountBody(session: session),
    );
  }
}

class _AccountBody extends ConsumerWidget {
  final Session session;

  const _AccountBody({required this.session});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(myProfileProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(myProfileProvider.future),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          profileAsync.when(
            data: (profile) => _ProfileHeader(
              profile: profile,
              fallbackEmail: session.user.email,
            ),
            loading: () => const SizedBox(
              height: 96,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => _ProfileHeader(
              profile: null,
              fallbackEmail: session.user.email,
            ),
          ),
          const SizedBox(height: 16),
          _menuCard(context, ref),
          const SizedBox(height: 16),
          _dangerCard(context, ref),
        ],
      ),
    );
  }

  Widget _menuCard(BuildContext context, WidgetRef ref) {
    return Card(
      margin: EdgeInsets.zero,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.favorite_outline, color: kInk),
            title: const Text('Хадгалсан зарууд'),
            trailing: const Icon(Icons.chevron_right, color: kMuted),
            onTap: () => context.go('/favorites'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.event_outlined, color: kInk),
            title: const Text('Миний үзэлтүүд'),
            trailing: const Icon(Icons.chevron_right, color: kMuted),
            onTap: () => context.push('/viewings'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.history, color: kInk),
            title: const Text('Сүүлд үзсэн'),
            trailing: const Icon(Icons.chevron_right, color: kMuted),
            onTap: () => context.push('/recently'),
          ),
        ],
      ),
    );
  }

  Widget _dangerCard(BuildContext context, WidgetRef ref) {
    return Card(
      margin: EdgeInsets.zero,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.logout, color: kInk),
            title: const Text('Гарах'),
            onTap: () => _confirmSignOut(context),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: Color(0xFFDC2626)),
            title: const Text(
              'Бүртгэл устгах',
              style: TextStyle(color: Color(0xFFDC2626)),
            ),
            onTap: () => _confirmDeleteAccount(context),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Гарах уу?'),
        content: const Text('Та бүртгэлээсээ гарахдаа итгэлтэй байна уу?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Болих'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Гарах'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await supa.auth.signOut();
  }

  /// Typing-free давхар баталгаажуулалт → delete-account Edge Function.
  /// Функц нь агент-холбоотой бүртгэлд ТАТГАЛЗАЖ алдаа буцаадаг (§2.2 spec)
  /// — серверийн мессежийг шууд харуулна.
  Future<void> _confirmDeleteAccount(BuildContext context) async {
    final first = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Бүртгэл устгах уу?'),
        content: const Text(
          'Таны профайл, хадгалсан зар, үзэлт товлолт зэрэг бүх мэдээлэл '
          'БҮРМӨСӨН устана. Энэ үйлдлийг буцаах боломжгүй.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Болих'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Үргэлжлүүлэх'),
          ),
        ],
      ),
    );
    if (first != true || !context.mounted) return;

    final second = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Итгэлтэй байна уу?'),
        content: const Text(
          'Сүүлчийн баталгаажуулалт: бүртгэлээ бүрмөсөн устгах уу?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Болих'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Тийм, устгах'),
          ),
        ],
      ),
    );
    if (second != true || !context.mounted) return;

    // Dialog-ийн pop, navigation, snackbar-ыг context-оос ХАМААРАХГҮЙ
    // handle-уудаар хийнэ: invoke хийх зуур _AccountBody unmount болбол
    // (auth event → LoginPrompt г.м.) barrierDismissible:false spinner-ийн
    // ард апп түгжигдэх, эсвэл go('/')+мэдэгдэл алгасагдахаас сэргийлнэ.
    final rootNavigator = Navigator.of(context, rootNavigator: true);
    final messenger = ScaffoldMessenger.of(context);
    final goRouter = GoRouter.of(context);

    // Блоклогч progress dialog — функц дуустал хүлээлгэнэ.
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    String? errorMessage;
    try {
      await supa.functions.invoke('delete-account');
    } on FunctionException catch (e) {
      errorMessage = _functionErrorMessage(e);
    } catch (_) {
      errorMessage = 'Бүртгэл устгаж чадсангүй. Дахин оролдоно уу.';
    } finally {
      rootNavigator.pop(); // progress dialog-ийг ЯМАГТ хаана
    }

    if (errorMessage != null) {
      messenger.showSnackBar(SnackBar(content: Text(errorMessage)));
      return;
    }

    // Амжилт: нүүр рүү → мэдэгдэл → локал signOut (§2.2 spec #3).
    // go/мэдэгдлийг signOut-аас ӨМНӨ хийнэ — sessionProvider rebuild-ээр
    // энэ widget unmount болсон ч хэрэглэгч баталгаажуулалтаа заавал харна.
    goRouter.go('/');
    messenger.showSnackBar(
      const SnackBar(content: Text('Таны бүртгэл устгагдлаа.')),
    );
    // Сервер талд бүртгэл аль хэдийн устсан, локал session ч цэвэрлэгдсэн
    // байдаг тул signOut-ын алдааг (сүлжээ, 5xx г.м.) үл тоомсорлоно.
    try {
      await supa.auth.signOut();
    } catch (_) {
      // Зориуд залгина — доорх урсгалд нөлөөгүй.
    }
  }

  /// Edge Function-ы алдааны body-оос хэрэглэгчид үзүүлэх мессеж гаргана.
  static String _functionErrorMessage(FunctionException e) {
    final details = e.details;
    if (details is Map && details['error'] is String) {
      return details['error'] as String;
    }
    if (details is String && details.isNotEmpty) return details;
    return 'Бүртгэл устгаж чадсангүй. Дахин оролдоно уу.';
  }
}

class _ProfileHeader extends ConsumerWidget {
  final Profile? profile;
  final String? fallbackEmail;

  const _ProfileHeader({required this.profile, required this.fallbackEmail});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final email = profile?.email ?? fallbackEmail;
    final name = profile?.fullName?.trim();
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: kBrand600,
              child: Text(
                profileInitials(profile?.fullName, email),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name == null || name.isEmpty ? 'Хэрэглэгч' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: kInk,
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (email != null)
                    Text(
                      email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, color: kMuted),
                    ),
                  if ((profile?.phone ?? '').isNotEmpty)
                    Text(
                      profile!.phone!,
                      style: const TextStyle(fontSize: 13, color: kMuted),
                    ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Засах',
              icon: const Icon(Icons.edit_outlined, color: kMuted),
              onPressed: () => _openEditSheet(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openEditSheet(BuildContext context, WidgetRef ref) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _EditProfileSheet(
        initialName: profile?.fullName ?? '',
        initialPhone: profile?.phone ?? '',
      ),
    );
    if (saved == true) {
      ref.invalidate(myProfileProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Профайл хадгалагдлаа.')));
      }
    }
  }
}

/// full_name + phone засах bottom sheet — вебийн updateProfile порт.
class _EditProfileSheet extends StatefulWidget {
  final String initialName;
  final String initialPhone;

  const _EditProfileSheet({
    required this.initialName,
    required this.initialPhone,
  });

  @override
  State<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends State<_EditProfileSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.initialName);
    _phone = TextEditingController(text: widget.initialPhone);
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await updateProfile(
        fullName: _name.text.trim(),
        phone: _phone.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Хадгалж чадсангүй. Дахин оролдоно уу.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Профайл засах',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: kInk,
              ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Бүтэн нэр',
                border: OutlineInputBorder(),
              ),
              validator: validateFullName,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Утасны дугаар',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Хадгалах'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
