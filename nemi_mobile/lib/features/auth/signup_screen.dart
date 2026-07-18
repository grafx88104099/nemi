import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/analytics.dart';
import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/auth/auth_validators.dart';

/// Бүртгүүлэх дэлгэц. Role metadata ЯВУУЛАХГҮЙ — handle_new_user trigger
/// (20260601000300_auth_signup.sql) default 'buyer' болгодог; trigger нь
/// metadata-аас `full_name`-ийг уншдаг тул зөвхөн түүнийг явуулна.
class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;
  bool _loading = false;
  bool _obscure = true;
  bool _done = false;

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await supa.auth.signUp(
        email: _email.text.trim(),
        password: _password.text,
        data: {'full_name': _fullName.text.trim()},
        emailRedirectTo: kAuthRedirectUrl,
      );
      // §9 conversion metric: зөвхөн БОДИТ бүртгэл үүссэн үед лог хийнэ.
      // Email confirmations идэвхтэй үед Supabase давхардсан и-мэйлд
      // enumeration-хамгаалалттай fake-success (identities: []) буцаадаг
      // тул тэр тохиолдолд signup_complete тоолохгүй.
      if (res.session != null || (res.user?.identities?.isNotEmpty ?? false)) {
        logEvent(kEvSignupComplete);
      }
      if (!mounted) return;
      if (res.session != null) {
        // Auto-confirm идэвхтэй орчин: шууд нэвтэрсэн — буцна.
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/');
        }
      } else {
        setState(() {
          _loading = false;
          _done = true;
        });
      }
    } on AuthApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error =
            e.code == 'user_already_exists' || e.message.contains('registered')
            ? 'Энэ и-мэйл бүртгэлтэй байна.'
            : 'Бүртгэл амжилтгүй боллоо. Дахин оролдоно уу.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Алдаа гарлаа. Сүлжээгээ шалгаад дахин оролдоно уу.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Бүртгүүлэх')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _done ? _buildDone(context) : _buildForm(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDone(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.mark_email_read_outlined, size: 56),
        const SizedBox(height: 12),
        Text(
          'И-мэйлээ шалгана уу',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          '${_email.text.trim()} хаягт баталгаажуулах холбоос илгээлээ. '
          'Холбоосыг дарж бүртгэлээ идэвхжүүлнэ үү.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => context.pop(),
          child: const Text('Нэвтрэх хуудас руу'),
        ),
      ],
    );
  }

  Widget _buildForm(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _fullName,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Бүтэн нэр',
              hintText: 'Б. Болд',
            ),
            validator: validateFullName,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'И-мэйл',
              hintText: 'ta@example.com',
            ),
            validator: validateEmail,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Нууц үг',
              helperText: 'Хамгийн багадаа $kMinPasswordLength тэмдэгт',
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: validatePassword,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _confirm,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _loading ? null : _submit(),
            decoration: const InputDecoration(labelText: 'Нууц үг давтах'),
            validator: (v) => validatePasswordConfirm(_password.text, v),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 13,
              ),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: Text(_loading ? 'Бүртгэж байна...' : 'Бүртгүүлэх'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => context.pop(),
            child: const Text('Бүртгэлтэй юу? Нэвтрэх'),
          ),
        ],
      ),
    );
  }
}
