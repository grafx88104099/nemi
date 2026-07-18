import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/features/auth/auth_validators.dart';

/// «Шинэ нууц үг» дэлгэц — AuthChangeEvent.passwordRecovery үед нээгдэнэ
/// (main.dart-ын auth listener push хийдэг). Recovery линк аль хэдийн
/// session үүсгэсэн тул шууд updateUser(password) дуудна (§6 #6).
class NewPasswordScreen extends StatefulWidget {
  const NewPasswordScreen({super.key});

  @override
  State<NewPasswordScreen> createState() => _NewPasswordScreenState();
}

class _NewPasswordScreenState extends State<NewPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;
  bool _loading = false;
  bool _obscure = true;
  bool _done = false;

  @override
  void dispose() {
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
      await supa.auth.updateUser(UserAttributes(password: _password.text));
      if (!mounted) return;
      setState(() {
        _loading = false;
        _done = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error =
            'Холбоос хүчингүй эсвэл хугацаа дууссан байж магадгүй. '
            'Дахин оролдоно уу.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Шинэ нууц үг')),
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
        const Icon(Icons.check_circle_outline, size: 56, color: Colors.green),
        const SizedBox(height: 12),
        Text(
          'Нууц үг тохирлоо',
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          // Recovery линк session үүсгэсэн тул хэрэглэгч аль хэдийн нэвтэрсэн.
          supa.auth.currentSession != null
              ? 'Та нэвтэрсэн байна. Аппаа үргэлжлүүлээрэй.'
              : 'Шинэ нууц үгээрээ нэвтэрнэ үү.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => context.go('/'),
          child: const Text('Нүүр рүү'),
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
          Text(
            'Шинэ нууц үгээ оруулна уу',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Шинэ нууц үг',
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
            child: Text(_loading ? 'Хадгалж байна...' : 'Нууц үг шинэчлэх'),
          ),
        ],
      ),
    );
  }
}
