import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/errors.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/account/login_prompt.dart';
import 'package:nemi_mobile/features/account/recently_queries.dart';
import 'package:nemi_mobile/widgets/listing_card_tile.dart';

/// Сүүлд үзсэн зарууд (§6 #7): viewed_at desc, limit 20; идэвхгүй болсон
/// (embedded listing null) мөрүүд provider-т аль хэдийн нуугдсан.
class RecentlyViewedScreen extends ConsumerWidget {
  const RecentlyViewedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Сүүлд үзсэн')),
      body: session == null
          ? const LoginPrompt(
              icon: Icons.history,
              message: 'Нэвтэрснээр сүүлд үзсэн заруудаа\nхарах боломжтой.',
            )
          : _RecentlyList(),
    );
  }
}

class _RecentlyList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(recentlyViewedProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off, size: 40, color: kMuted),
            const SizedBox(height: 12),
            Text(mnErrorMessage(e), style: const TextStyle(color: kMuted)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => ref.invalidate(recentlyViewedProvider),
              child: const Text('Дахин оролдох'),
            ),
          ],
        ),
      ),
      data: (items) {
        if (items.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.history, size: 56, color: kMuted),
                  const SizedBox(height: 12),
                  const Text(
                    'Сүүлд үзсэн зар алга байна.',
                    style: TextStyle(fontSize: 14, color: kMuted),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => context.go('/listings'),
                    child: const Text('Зар үзэх'),
                  ),
                ],
              ),
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.refresh(recentlyViewedProvider.future),
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final l = items[i];
              return ListingCardTile(
                listing: l,
                onTap: () => context.push('/listings/${l.id}'),
              );
            },
          ),
        );
      },
    );
  }
}
