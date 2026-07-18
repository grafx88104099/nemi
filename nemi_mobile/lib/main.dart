import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:nemi_mobile/core/app_config.dart';
import 'package:nemi_mobile/core/router.dart';
import 'package:nemi_mobile/core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL'),
    // ignore: deprecated_member_use
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );
  runApp(const ProviderScope(child: NemiApp()));
}

class NemiApp extends StatefulWidget {
  const NemiApp({super.key});

  @override
  State<NemiApp> createState() => _NemiAppState();
}

class _NemiAppState extends State<NemiApp> {
  // Апп шууд асна; шалгалт ард нь явагдаж true бол blocking дэлгэц рүү шилжинэ.
  bool _updateRequired = false;

  @override
  void initState() {
    super.initState();
    isUpdateRequired().then((required) {
      if (required && mounted) setState(() => _updateRequired = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_updateRequired) {
      return MaterialApp(
        title: 'Nemi',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const UpdateRequiredScreen(),
      );
    }
    return MaterialApp.router(
      title: 'Nemi',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router,
    );
  }
}
