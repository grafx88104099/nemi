import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'package:nemi_mobile/core/format.dart';
import 'package:nemi_mobile/core/image_url.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/models/agent.dart';
import 'package:nemi_mobile/models/listing.dart';

/// Зарын карт — вебийн components/listings/ListingCard.tsx-ийн порт.
/// Зураг (thumbnail transform) · badge · үнэ (+/сар, X+Y) · AI оноо ·
/// гарчиг · мета мөр · агентын мөр · нийтэлсэн огноо.
class ListingCardTile extends StatelessWidget {
  final ListingCard listing;
  final VoidCallback? onTap;

  const ListingCardTile({super.key, required this.listing, this.onTap});

  @override
  Widget build(BuildContext context) {
    final l = listing;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: kLine),
            borderRadius: BorderRadius.circular(16),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _photo(l),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _priceRow(l),
                    const SizedBox(height: 6),
                    Text(
                      l.title ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: kInk,
                      ),
                    ),
                    const SizedBox(height: 4),
                    _metaRow(l),
                    if (l.agent != null) ...[
                      const SizedBox(height: 8),
                      _agentRow(l.agent!),
                    ],
                    if (l.createdAt != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.schedule, size: 12, color: kMuted),
                          const SizedBox(width: 4),
                          Text(
                            '${relativeDate(l.createdAt!)} нийтэлсэн',
                            style: const TextStyle(fontSize: 11, color: kMuted),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photo(ListingCard l) {
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (l.photo != null && l.photo!.isNotEmpty)
            CachedNetworkImage(
              imageUrl: thumbUrl(l.photo!, width: 480),
              // Decode bound — kUseImageTransform=false fallback үед ч
              // full-size original-ийг бүтнээр decode хийхгүй (§2.1).
              memCacheWidth: 480,
              maxWidthDiskCache: 480,
              fit: BoxFit.cover,
              placeholder: (_, _) => Container(color: const Color(0xFFF1F5F9)),
              errorWidget: (_, _, _) => Container(
                color: const Color(0xFFF1F5F9),
                child: const Icon(Icons.home_outlined, color: kMuted, size: 40),
              ),
            )
          else
            Container(
              color: const Color(0xFFF1F5F9),
              child: const Icon(Icons.home_outlined, color: kMuted, size: 40),
            ),
          // Зүүн дээд badge: Эрэлттэй > Баталгаатай (вебийн дараалал).
          Positioned(
            left: 8,
            top: 8,
            child: l.hot
                ? _badge(
                    'Эрэлттэй',
                    const Color(0xFFE11D48),
                    Icons.local_fire_department,
                  )
                : l.verified
                ? _badge(
                    'Баталгаатай',
                    const Color(0xFF059669),
                    Icons.verified_user,
                  )
                : const SizedBox.shrink(),
          ),
          // Баруун дээд: Шинэ (7 хоног дотор).
          if (l.createdAt != null && isFresh(l.createdAt!))
            Positioned(
              right: 8,
              top: 8,
              child: _badge('Шинэ', kBrand600, Icons.auto_awesome),
            ),
        ],
      ),
    );
  }

  Widget _badge(String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white),
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _priceRow(ListingCard l) {
    final isRent = l.dealType == 'rent';
    final term = isRent
        ? rentTermCode(l.rentAdvanceMonths, l.rentDepositMonths)
        : null;
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text.rich(
                  TextSpan(
                    text: fmtMNT(l.price),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: kInk,
                    ),
                    children: [
                      if (isRent)
                        const TextSpan(
                          text: '/сар',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: kMuted,
                          ),
                        ),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (term != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 5,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    term,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: kMuted,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (l.aiScore != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: kBrand.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.star, size: 11, color: kBrand600),
                const SizedBox(width: 2),
                Text(
                  '${l.aiScore}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: kBrand600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _metaRow(ListingCard l) {
    final parts = <String>[
      if ((l.rooms ?? 0) > 0) '${l.rooms} өрөө',
      if (l.area != null) fmtArea(l.area),
      if (l.floor != null && l.floor != '-') l.floor!,
      if (l.district != null) l.district!,
    ];
    if (parts.isEmpty) return const SizedBox.shrink();
    return Text(
      parts.join(' · '),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 12, color: kMuted),
    );
  }

  Widget _agentRow(AgentInfo agent) {
    final color = _hexColor(agent.office?.color) ?? const Color(0xFFC2410C);
    final avatarUrl = agent.avatarUrl;
    return Row(
      children: [
        CircleAvatar(
          radius: 11,
          backgroundColor: color,
          backgroundImage: avatarUrl != null && avatarUrl.isNotEmpty
              // 22px тойрогт full-size авчрахгүй: transform + decode bound.
              ? CachedNetworkImageProvider(
                  thumbUrl(avatarUrl, width: 96),
                  maxWidth: 96,
                )
              : null,
          child: avatarUrl == null || avatarUrl.isEmpty
              ? Text(
                  agent.avatar ?? 'NA',
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                )
              : null,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            agent.displayName ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: kInk,
            ),
          ),
        ),
        if (agent.verified)
          const Icon(Icons.verified_user, size: 14, color: Color(0xFF059669)),
      ],
    );
  }

  static Color? _hexColor(String? hex) {
    if (hex == null) return null;
    final h = hex.replaceFirst('#', '');
    if (h.length != 6) return null;
    final v = int.tryParse(h, radix: 16);
    return v == null ? null : Color(0xFF000000 | v);
  }
}
