import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/auth/auth_validators.dart';

/// Нууц үг сэргээх хүсэлт. Вебийн ForgotPasswordForm-той ижил:
/// и-мэйл бүртгэлтэй эсэхийг илчлэхгүйн тулд ҮРГЭЛЖ амжилттай мессеж харуулна.
/// Линк `nemi://auth-callback` руу буцаж ирээд supabase_flutter нь
/// AuthChangeEvent.passwordRecovery emit хийнэ → /new-password (main.dart listener).
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _loading = false;
  bool _sent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await supa.auth.resetPasswordForEmail(
        _email.text.trim(),
        redirectTo: kAuthRedirectUrl,
      );
    } on AuthException {
      // Зориуд залгина — и-мэйл байгаа эсэхийг илчлэхгүй.
    } catch (_) {
      // Сүлжээний алдаа ч мөн адил: доорх нейтрал мессеж хангалттай.
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _sent = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Нууц үг сэргээх')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _sent
                  ? Column(
                      children: [
                        const Icon(Icons.mark_email_read_outlined, size: 56),
                        const SizedBox(height: 12),
                        Text(
                          'И-мэйлээ шалгана уу',
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Хэрэв ${_email.text.trim()} бүртгэлтэй бол нууц үг '
                          'сэргээх холбоос илгээгдсэн.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ],
                    )
                  : Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Бүртгэлтэй и-мэйлээ оруулбал нууц үг сэргээх '
                            'холбоос илгээнэ.',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            autocorrect: false,
                            autofillHints: const [AutofillHints.email],
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) =>
                                _loading ? null : _submit(),
                            decoration: const InputDecoration(
                              labelText: 'Бүртгэлтэй и-мэйл',
                              hintText: 'ta@example.com',
                            ),
                            validator: validateEmail,
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            child: Text(
                              _loading
                                  ? 'Илгээж байна...'
                                  : 'Сэргээх холбоос илгээх',
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
