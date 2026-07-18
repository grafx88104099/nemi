import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/core/constants.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart';
import 'package:nemi_mobile/features/listings/listings_screen.dart'
    show SkeletonCard;
import 'package:nemi_mobile/widgets/listing_card_tile.dart';

/// Нүүр — hero хайлт, deal-type chips, төрлийн chips, онцлох rail
/// (вебийн app/(site)/page.tsx-ийн бүтэц).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  void _go(BuildContext context, Map<String, String> params) {
    context.go(Uri(path: '/listings', queryParameters: params).toString());
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final featured = ref.watch(featuredListingsProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(featuredListingsProvider),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              // Hero
              Container(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFFFF3E9), kBg],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Nemi',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: kBrand600,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text.rich(
                      const TextSpan(
                        text: 'Монголын ',
                        children: [
                          TextSpan(
                            text: 'үл хөдлөх',
                            style: TextStyle(color: kBrand),
                          ),
                          TextSpan(text: '-ийн ухаалаг платформ'),
                        ],
                      ),
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: kInk,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'AI үнэлгээ, баталгаатай агентууд, ил тод үнэ.',
                      style: TextStyle(fontSize: 14, color: kMuted),
                    ),
                    const SizedBox(height: 16),
                    // Хайлтын мөр → Хайх дэлгэц q-тэй
                    TextField(
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) => _go(context, {
                        if (v.trim().isNotEmpty) 'q': v.trim(),
                      }),
                      onTap: null,
                      decoration: InputDecoration(
                        hintText: 'Дүүрэг, хороолол, зарын нэрээр хайх...',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        filled: true,
                        fillColor: Colors.white,
                        isDense: true,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Deal-type chips (Худалдах / Түрээс)
                    Row(
                      children: [
                        for (final code in kDealTypes) ...[
                          Expanded(
                            child: _DealCard(
                              code: code,
                              label: kDealTypeLabel[code]!,
                              onTap: () => _go(context, {'deal': code}),
                            ),
                          ),
                          if (code != kDealTypes.last)
                            const SizedBox(width: 10),
                        ],
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Төрлийн chips (вебийн PROPERTY_TYPES pill-үүд)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final t in kPropertyTypes)
                          ActionChip(
                            label: Text(
                              t,
                              style: const TextStyle(
                                fontSize: 12,
                                color: kMuted,
                              ),
                            ),
                            backgroundColor: Colors.white,
                            onPressed: () => _go(context, {'type': t}),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              // Онцлох rail
              featured.when(
                loading: () => _railSection(
                  context,
                  child: SizedBox(
                    height: 320,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: 2,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (_, _) =>
                          const SizedBox(width: 250, child: SkeletonCard()),
                    ),
                  ),
                ),
                error: (e, st) {
                  debugPrint('FEATURED ERROR: $e\n$st');
                  return _railSection(
                    context,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Column(
                        children: [
                          const Text(
                            'Ачаалахад алдаа гарлаа',
                            style: TextStyle(color: kMuted),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: () =>
                                ref.invalidate(featuredListingsProvider),
                            child: const Text('Дахин оролдох'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : _railSection(
                        context,
                        child: SizedBox(
                          height: 360,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: items.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 12),
                            itemBuilder: (context, i) {
                              final l = items[i];
                              return SizedBox(
                                width: 250,
                                child: Align(
                                  alignment: Alignment.topCenter,
                                  child: ListingCardTile(
                                    listing: l,
                                    onTap: () => context.pushNamed(
                                      'listing-detail',
                                      pathParameters: {'id': l.id},
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// «Онцлох зарууд» гарчигтай хэсэг.
  Widget _railSection(BuildContext context, {required Widget child}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Онцлох зарууд',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: kInk,
                      ),
                    ),
                    Text(
                      'AI-аар хамгийн өндөр үнэлгээтэй сонголтууд',
                      style: TextStyle(fontSize: 12, color: kMuted),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => context.go('/listings'),
                child: const Text(
                  'Бүгдийг үзэх',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: kBrand600,
                  ),
                ),
              ),
            ],
          ),
        ),
        child,
      ],
    );
  }
}

/// Худалдах / Түрээс том карт-товч.
class _DealCard extends StatelessWidget {
  final String code;
  final String label;
  final VoidCallback onTap;

  const _DealCard({
    required this.code,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: kLine),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              Icon(
                code == 'rent' ? Icons.key_outlined : Icons.home_outlined,
                color: kBrand600,
              ),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: kInk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
