import 'package:flutter/material.dart';

/// Брэнд өнгө — вебийн app/globals.css `--color-brand-500`.
const Color kBrand = Color(0xFFF97316);
const Color kBrand600 = Color(0xFFEA580C);
const Color kInk = Color(0xFF0F172A); // --color-ink
const Color kMuted = Color(0xFF64748B); // --color-muted
const Color kBg = Color(0xFFF6F8FA); // --color-bg
const Color kLine = Color(0xFFE5E7EB); // --color-line

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: kBrand,
    brightness: Brightness.light,
    primary: kBrand600,
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: kBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: kInk,
      elevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: kBrand.withValues(alpha: 0.15),
      labelTextStyle: WidgetStatePropertyAll(
        const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kInk),
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 1,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: kLine),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kBrand600,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    chipTheme: const ChipThemeData(side: BorderSide(color: kLine)),
    dividerTheme: const DividerThemeData(color: kLine),
  );
}
