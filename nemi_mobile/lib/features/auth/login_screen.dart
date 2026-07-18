import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/errors.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/auth/auth_validators.dart';

/// Нэвтрэх дэлгэц — и-мэйл + нууц үг (v1.0 зөвхөн и-мэйл, OAuth v1.1).
/// Амжилттай нэвтэрмэгц pop хийж дуудсан газраа буцаана — ensureLoggedIn
/// (core/auth.dart) энэ pop-ийг хүлээгээд session-ээ дахин шалгадаг.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _loading = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _popLoggedIn() {
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/');
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await supa.auth.signInWithPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
      _popLoggedIn();
    } on AuthRetryableFetchException {
      // Сүлжээний алдаа — «нууц үг буруу» гэж ТӨӨРӨГДҮҮЛЭХГҮЙ.
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = kNetworkErrorMessage;
      });
    } on AuthApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.code == 'email_not_confirmed'
            ? 'И-мэйл хаягаа баталгаажуулаагүй байна. И-мэйлээ шалгана уу.'
            : 'И-мэйл эсвэл нууц үг буруу байна.';
      });
    } on AuthException {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'И-мэйл эсвэл нууц үг буруу байна.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = mnErrorMessage(e);
      });
    }
  }

  Future<void> _openSignup() async {
    await context.push('/signup');
    // Signup дээр auto-confirm идэвхтэй бол session үүссэн байж болно.
    if (mounted && supa.auth.currentSession != null) _popLoggedIn();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Нэвтрэх')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Тавтай морил',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Nemi бүртгэлээрээ нэвтэрнэ үү',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
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
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _loading ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: 'Нууц үг',
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscure ? Icons.visibility_off : Icons.visibility,
                          ),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) =>
                          (v ?? '').isEmpty ? 'Нууц үгээ оруулна уу.' : null,
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
                      child: Text(_loading ? 'Нэвтэрч байна...' : 'Нэвтрэх'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        TextButton(
                          onPressed: () => context.push('/forgot-password'),
                          child: const Text('Нууц үг мартсан?'),
                        ),
                        TextButton(
                          onPressed: _openSignup,
                          child: const Text('Бүртгүүлэх'),
                        ),
                      ],
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
