import 'package:flutter/material.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/theme.dart';

/// Нэвтрээгүй үеийн найрсаг prompt (гэрээний хэв маяг):
/// icon + "Нэвтэрснээр ... боломжтой" + [Нэвтрэх] товч.
/// [Нэвтрэх] нь ensureLoggedIn дууддаг — амжилттай нэвтэрмэгц sessionProvider
/// ажиглагчид автоматаар дахин build хийгдэнэ.
class LoginPrompt extends StatelessWidget {
  final IconData icon;
  final String message;

  const LoginPrompt({
    super.key,
    this.icon = Icons.person_outline,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: kBrand.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 36, color: kBrand600),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: kMuted, height: 1.5),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => ensureLoggedIn(context),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                child: Text('Нэвтрэх'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
