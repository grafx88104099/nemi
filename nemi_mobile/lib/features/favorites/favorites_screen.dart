/// Хадгалсан дэлгэц — вебийн /favorites-ийн порт (§6 #4).
/// Anonymous-first: нэвтрээгүй бол найрсаг login prompt (алдаа биш).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/errors.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/favorites/favorites_providers.dart';
import 'package:nemi_mobile/widgets/listing_card_tile.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Хадгалсан',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: session == null ? const _LoginPrompt() : const _FavoritesBody(),
    );
  }
}

/// Нэвтрээгүй үеийн найрсаг урилга (вебийн LoginPrompt хэв маяг).
class _LoginPrompt extends StatelessWidget {
  const _LoginPrompt();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.favorite_outline, size: 56, color: kMuted),
            const SizedBox(height: 16),
            const Text(
              'Нэвтэрснээр таалагдсан заруудаа хадгалж, энд харах боломжтой.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: kMuted),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => ensureLoggedIn(context),
              child: const Text('Нэвтрэх'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FavoritesBody extends ConsumerWidget {
  const _FavoritesBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(favoriteListingsProvider);
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
            OutlinedButton(
              onPressed: () => ref.invalidate(favoriteListingsProvider),
              child: const Text('Дахин оролдох'),
            ),
          ],
        ),
      ),
      data: (rows) => _FavoritesList(rows: rows),
    );
  }
}

class _FavoritesList extends ConsumerStatefulWidget {
  final List<FavoriteRow> rows;

  const _FavoritesList({required this.rows});

  @override
  ConsumerState<_FavoritesList> createState() => _FavoritesListState();
}

class _FavoritesListState extends ConsumerState<_FavoritesList> {
  late List<FavoriteRow> _rows = List.of(widget.rows);

  @override
  void didUpdateWidget(covariant _FavoritesList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.rows, widget.rows)) {
      _rows = List.of(widget.rows);
    }
  }

  Future<void> _refresh() =>
      ref.refresh(favoriteListingsProvider.future).then((_) {});

  /// Swipe устгалт: optimistic хасалт → DB delete → undo SnackBar.
  Future<void> _remove(FavoriteRow row, int index) async {
    setState(() => _rows.removeAt(index));
    try {
      await setFavorite(row.listingId, false);
    } catch (e) {
      if (!mounted) return;
      setState(() => _rows.insert(index.clamp(0, _rows.length), row));
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(mnErrorMessage(e))));
      return;
    }
    // ids + keep-alive жагсаалт хоёуланг нь шинэчилнэ — кэш дэх устгагдсан
    // мөр локал _rows-ийн ард нуугдаж үлдэхээс сэргийлнэ.
    ref.invalidate(favoriteIdsProvider);
    ref.invalidate(favoriteListingsProvider);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Хадгалснаас хаслаа.'),
        action: SnackBarAction(
          label: 'Буцаах',
          onPressed: () => _undo(row, index),
        ),
      ),
    );
  }

  Future<void> _undo(FavoriteRow row, int index) async {
    try {
      await setFavorite(row.listingId, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(mnErrorMessage(e))));
      }
      return;
    }
    ref.invalidate(favoriteIdsProvider);
    ref.invalidate(favoriteListingsProvider);
    if (!mounted) return;
    setState(() => _rows.insert(index.clamp(0, _rows.length), row));
  }

  @override
  Widget build(BuildContext context) {
    if (_rows.isEmpty) {
      // RefreshIndicator ажиллуулахын тулд scrollable хоосон төлөв.
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 120),
            Icon(Icons.favorite_outline, size: 56, color: kMuted),
            SizedBox(height: 16),
            Text(
              'Хадгалсан зар алга байна.\nЗар дээрх зүрхэн дээр дарж хадгалаарай.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: kMuted),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: _rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final row = _rows[i];
          return Dismissible(
            key: ValueKey(row.listingId),
            direction: DismissDirection.endToStart,
            background: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 20),
              decoration: BoxDecoration(
                color: const Color(0xFFE11D48),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.delete_outline, color: Colors.white),
            ),
            onDismissed: (_) => _remove(row, i),
            child: row.listing == null
                ? const _InactiveListingRow()
                : ListingCardTile(
                    listing: row.listing!,
                    onTap: () => context.push('/listings/${row.listingId}'),
                  ),
          );
        },
      ),
    );
  }
}

/// Embedded listing == null — зар идэвхгүй болсон (RLS-null, §6).
/// Мөр swipe-аар устгагдах боломжтой хэвээр.
class _InactiveListingRow extends StatelessWidget {
  const _InactiveListingRow();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        border: Border.all(color: kLine),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Row(
        children: [
          Icon(Icons.visibility_off_outlined, color: kMuted),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Зар идэвхгүй болсон',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Энэ зар зарагдсан эсвэл нийтлэлээс хасагдсан байна.',
                  style: TextStyle(fontSize: 12, color: kMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
