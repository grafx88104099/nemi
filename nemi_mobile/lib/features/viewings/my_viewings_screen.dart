/// Миний үзэлтүүд — вебийн /tours хуудасны порт (§6 #5).
/// getMyViewings: scheduled_at asc, статус chip, цуцлах (own-row UPDATE).
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/format.dart';
import 'package:nemi_mobile/core/image_url.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/viewings/viewings_queries.dart';
import 'package:nemi_mobile/models/viewing.dart';

/// Статусын монгол label — вебийн /tours STATUS map-тай ЯГ ижил.
const Map<String, String> kViewingStatusLabel = {
  'pending': 'Хүлээгдэж буй',
  'confirmed': 'Баталгаажсан',
  'done': 'Болсон',
  'cancelled': 'Цуцалсан',
};

/// Статусын өнгө — вебийн tone семантик (amber/green/neutral/rose).
Color viewingStatusColor(String? status) => switch (status) {
  'pending' => const Color(0xFFD97706), // amber
  'confirmed' => const Color(0xFF059669), // green
  'cancelled' => const Color(0xFFE11D48), // rose
  _ => kMuted, // done + танигдаагүй статус → neutral (вебтэй ижил fallback)
};

class MyViewingsScreen extends ConsumerWidget {
  const MyViewingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Миний үзэлтүүд',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: session == null ? const _LoginPrompt() : const _ViewingsBody(),
    );
  }
}

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
            const Icon(Icons.event_outlined, size: 56, color: kMuted),
            const SizedBox(height: 16),
            const Text(
              'Нэвтэрснээр товлосон үзэлтүүдээ энд харах боломжтой.',
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

class _ViewingsBody extends ConsumerWidget {
  const _ViewingsBody();

  Future<void> _cancel(BuildContext context, WidgetRef ref, Viewing v) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Үзэлт цуцлах уу?'),
        content: const Text('Товлосон үзэлтийн цаг цуцлагдана.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Болих'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Цуцлах'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await cancelViewing(v.id);
    } catch (_) {
      // Хуучирсан мөр (зэрэг устсан/өөрчлөгдсөн) байж болзошгүй тул
      // жагсаалтыг дахин ачаална.
      ref.invalidate(myViewingsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Алдаа гарлаа. Дахин оролдоно уу.')),
        );
      }
      return;
    }
    ref.invalidate(myViewingsProvider);
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Үзэлт цуцлагдлаа')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myViewingsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Алдаа гарлаа. Дахин оролдоно уу.',
              style: TextStyle(color: kMuted),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => ref.invalidate(myViewingsProvider),
              child: const Text('Дахин ачаалах'),
            ),
          ],
        ),
      ),
      data: (viewings) => RefreshIndicator(
        onRefresh: () => ref.refresh(myViewingsProvider.future).then((_) {}),
        child: viewings.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  Icon(Icons.event_outlined, size: 56, color: kMuted),
                  SizedBox(height: 16),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 32),
                    child: Text(
                      'Одоогоор товлосон үзэлт алга. Зар дээрээс «Үзэлт товлох» дарна уу.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 14, color: kMuted),
                    ),
                  ),
                ],
              )
            : ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                itemCount: viewings.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) => _ViewingCard(
                  viewing: viewings[i],
                  onCancel: () => _cancel(context, ref, viewings[i]),
                ),
              ),
      ),
    );
  }
}

class _ViewingCard extends StatelessWidget {
  final Viewing viewing;
  final VoidCallback onCancel;

  const _ViewingCard({required this.viewing, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final v = viewing;
    final listing = v.listing;
    final statusColor = viewingStatusColor(v.status);
    final statusLabel = kViewingStatusLabel[v.status] ?? v.status ?? '—';
    final cancellable = canCancelViewing(
      status: v.status,
      scheduledAt: v.scheduledAt,
    );
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: listing?.id == null
            ? null
            : () => context.push('/listings/${listing!.id}'),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: kLine),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _photo(listing),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: listing == null
                                  ? const Text(
                                      'Зар идэвхгүй болсон',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: kMuted,
                                      ),
                                    )
                                  : Text(
                                      listing.title ?? '—',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: kInk,
                                      ),
                                    ),
                            ),
                            const SizedBox(width: 8),
                            _statusChip(statusLabel, statusColor),
                          ],
                        ),
                        if (listing != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            [
                              if (listing.district != null) listing.district!,
                              fmtMNT(listing.price),
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: kMuted),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(Icons.event, size: 14, color: kMuted),
                            const SizedBox(width: 4),
                            Text(
                              v.scheduledAt == null
                                  ? '—'
                                  : fmtDateTime(v.scheduledAt!),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: kInk,
                              ),
                            ),
                          ],
                        ),
                        if (v.agent != null) ...[
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                Icons.person_outline,
                                size: 14,
                                color: kMuted,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  [
                                    v.agent!.displayName ?? '',
                                    if (v.agent!.phone != null) v.agent!.phone!,
                                  ].where((s) => s.isNotEmpty).join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: kMuted,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (cancellable)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: onCancel,
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFE11D48),
                    ),
                    child: const Text('Цуцлах'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photo(ViewingListing? listing) {
    final photo = listing?.photo;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 72,
        height: 72,
        child: photo == null || photo.isEmpty
            ? Container(
                color: const Color(0xFFF1F5F9),
                child: const Icon(Icons.home_outlined, color: kMuted),
              )
            : CachedNetworkImage(
                imageUrl: thumbUrl(photo, width: 192),
                memCacheWidth: 192,
                maxWidthDiskCache: 192,
                fit: BoxFit.cover,
                placeholder: (_, _) =>
                    Container(color: const Color(0xFFF1F5F9)),
                errorWidget: (_, _, _) => Container(
                  color: const Color(0xFFF1F5F9),
                  child: const Icon(Icons.home_outlined, color: kMuted),
                ),
              ),
      ),
    );
  }

  Widget _statusChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
