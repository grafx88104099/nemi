import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/features/account/account_screen.dart';
import 'package:nemi_mobile/features/favorites/favorites_screen.dart';
import 'package:nemi_mobile/features/home/home_screen.dart';
import 'package:nemi_mobile/features/listing_detail/listing_detail_screen.dart';
import 'package:nemi_mobile/features/listings/listing_filters.dart';
import 'package:nemi_mobile/features/listings/listings_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// go_router — StatefulShellRoute bottom nav (Нүүр · Хайх · Хадгалсан · Профайл)
/// + зарын дэлгэрэнгүй shell-ийн ДЭЭР push хийгддэг (parentNavigatorKey: root).
///
/// DEFERRAL (Phase 0 → Phase 2): auth redirect guard-ийг ухамсартайгаар
/// Phase 2 руу хойшлуулав — /login route хараахан байхгүй бөгөөд /favorites,
/// /account нь өөрсдөө «Нэвтрэх шаардлагатай» placeholder үзүүлдэг тул одоо
/// guard хийх юмгүй. Phase 2-т auth орж ирэхэд энд `redirect:` callback нэмж
/// (supa.auth.currentSession == null && gated route → /login) залгана.
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
