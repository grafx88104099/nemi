import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/features/account/account_screen.dart';
import 'package:nemi_mobile/features/account/recently_viewed_screen.dart';
import 'package:nemi_mobile/features/auth/forgot_password_screen.dart';
import 'package:nemi_mobile/features/auth/login_screen.dart';
import 'package:nemi_mobile/features/auth/new_password_screen.dart';
import 'package:nemi_mobile/features/auth/signup_screen.dart';
import 'package:nemi_mobile/features/favorites/favorites_screen.dart';
import 'package:nemi_mobile/features/home/home_screen.dart';
import 'package:nemi_mobile/features/listing_detail/listing_detail_screen.dart';
import 'package:nemi_mobile/features/listings/listing_filters.dart';
import 'package:nemi_mobile/features/listings/listings_screen.dart';
import 'package:nemi_mobile/features/viewings/my_viewings_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// go_router — StatefulShellRoute bottom nav (Нүүр · Хайх · Хадгалсан · Профайл)
/// + зарын дэлгэрэнгүй shell-ийн ДЭЭР push хийгддэг (parentNavigatorKey: root).
///
/// ШИЙДВЭР (Phase 2, эцсийн): router түвшний `redirect:` guard-ийг ЗОРИУД
/// хэрэгжүүлээгүй. Anonymous-first (§6) тул хамгаалагдсан дэлгэцүүд
/// (/favorites, /viewings, /recently, /account) тус бүр өөрөө найрсаг
/// in-screen LoginPrompt үзүүлж, ensureLoggedIn → sessionProvider rebuild-ээр
/// үргэлжилдэг — dead-end байхгүй. Global redirect нэмбэл энэ prompt UX-ийг
/// эвдэх тул нэмэхгүй байхаар шийдсэн (redirect бус LoginPrompt = design).
final GoRouter router = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: '/',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          _ShellScaffold(shell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/',
              name: 'home',
              builder: (context, state) => const HomeScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/listings',
              name: 'listings',
              builder: (context, state) => ListingsScreen(
                initial: state.uri.queryParameters.isEmpty
                    ? null
                    : ListingFilters.fromQueryParams(state.uri.queryParameters),
              ),
              routes: [
                GoRoute(
                  path: ':id',
                  name: 'listing-detail',
                  parentNavigatorKey: rootNavigatorKey,
                  builder: (context, state) =>
                      ListingDetailScreen(id: state.pathParameters['id']!),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/favorites',
              name: 'favorites',
              builder: (context, state) => const FavoritesScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/account',
              name: 'account',
              builder: (context, state) => const AccountScreen(),
            ),
          ],
        ),
      ],
    ),
    // ---- Auth (Phase 2) — shell-ийн ГАДНА, root navigator дээр push хийгддэг.
    // LoginScreen амжилттай нэвтэрмэгц pop хийдэг тул ensureLoggedIn
    // (core/auth.dart) push-ээ await хийгээд session-ээ дахин шалгадаг.
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/signup',
      name: 'signup',
      builder: (context, state) => const SignupScreen(),
    ),
    GoRoute(
      path: '/forgot-password',
      name: 'forgot-password',
      builder: (context, state) => const ForgotPasswordScreen(),
    ),
    GoRoute(
      path: '/new-password',
      name: 'new-password',
      builder: (context, state) => const NewPasswordScreen(),
    ),
    // ---- Хамгаалагдсан жагсаалтууд (дэлгэцүүдийг FavVie/Account agent эзэмшинэ).
    GoRoute(
      path: '/viewings',
      name: 'viewings',
      builder: (context, state) => const MyViewingsScreen(),
    ),
    GoRoute(
      path: '/recently',
      name: 'recently',
      builder: (context, state) => const RecentlyViewedScreen(),
    ),
  ],
);

class _ShellScaffold extends StatelessWidget {
  final StatefulNavigationShell shell;

  const _ShellScaffold({required this.shell});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) =>
            shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Нүүр',
          ),
          NavigationDestination(icon: Icon(Icons.search), label: 'Хайх'),
          NavigationDestination(
            icon: Icon(Icons.favorite_outline),
            selectedIcon: Icon(Icons.favorite),
            label: 'Хадгалсан',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Профайл',
          ),
        ],
      ),
    );
  }
}
