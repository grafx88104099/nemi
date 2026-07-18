import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nemi_mobile/core/analytics.dart';
import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/errors.dart';
import 'package:nemi_mobile/core/format.dart';
import 'package:nemi_mobile/core/image_url.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/account/recently_queries.dart';
import 'package:nemi_mobile/features/favorites/favorites_providers.dart';
import 'package:nemi_mobile/features/listing_detail/detail_queries.dart';
import 'package:nemi_mobile/features/listing_detail/detail_view_logic.dart';
import 'package:nemi_mobile/features/viewings/booking_sheet.dart';
import 'package:nemi_mobile/features/viewings/viewings_queries.dart';
import 'package:nemi_mobile/models/agent.dart';
import 'package:nemi_mobile/models/listing.dart';

/// Зарын дэлгэрэнгүй дэлгэц (§6 #3). Deep-link аюулгүй: зар олдохгүй/идэвхгүй
/// бол crash хийхгүй «Зар олдсонгүй» төлөв үзүүлнэ.
class ListingDetailScreen extends ConsumerStatefulWidget {
  final String id;

  const ListingDetailScreen({super.key, required this.id});

  @override
  ConsumerState<ListingDetailScreen> createState() =>
      _ListingDetailScreenState();
}

class _ListingDetailScreenState extends ConsumerState<ListingDetailScreen> {
  @override
  void initState() {
    super.initState();
    // Сүүлд үзсэн — fire-and-forget upsert; нэвтрээгүй бол чимээгүй no-op.
    recordView(widget.id);
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.id;
    final detail = ref.watch(listingDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('Зарын дэлгэрэнгүй')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: mnErrorMessage(e),
          onRetry: () => ref.invalidate(listingDetailProvider(id)),
        ),
        data: (l) =>
            l == null ? const _NotFoundView() : _DetailBody(listing: l),
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (l) => l == null ? null : _BottomBar(listing: l),
        orElse: () => null,
      ),
    );
  }
}

class _NotFoundView extends StatelessWidget {
  const _NotFoundView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, size: 48, color: kMuted),
            const SizedBox(height: 12),
            const Text(
              'Зар олдсонгүй эсвэл идэвхгүй болсон',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: kInk,
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: const Text('Буцах'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off, size: 40, color: kMuted),
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(color: kMuted)),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Дахин оролдох')),
        ],
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  final ListingDetail listing;

  const _DetailBody({required this.listing});

  @override
  Widget build(BuildContext context) {
    final l = listing;
    final upfront = rentUpfront(l);
    final tiles = specTiles(l);
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _Gallery(urls: galleryUrls(l)),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Badges(listing: l),
              const SizedBox(height: 8),
              Text(
                priceLine(l),
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: kInk,
                ),
              ),
              if (l.title != null) ...[
                const SizedBox(height: 4),
                Text(
                  l.title!,
                  style: const TextStyle(fontSize: 17, color: kInk),
                ),
              ],
              const SizedBox(height: 4),
              Wrap(
                spacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (l.district != null)
                    _IconText(icon: Icons.place_outlined, text: l.district!),
                  if (l.createdAt != null)
                    _IconText(
                      icon: Icons.schedule,
                      text: '${relativeDate(l.createdAt!)} нийтэлсэн',
                    ),
                ],
              ),
              if (tiles.isNotEmpty) ...[
                const SizedBox(height: 16),
                _SpecTiles(tiles: tiles),
              ],
              if (hasRentTerms(l)) ...[
                const SizedBox(height: 16),
                _RentTerms(listing: l, upfront: upfront),
              ],
              if (l.aiScore != null) ...[
                const SizedBox(height: 16),
                _AiScoreCard(score: l.aiScore!, note: l.aiNote),
              ],
              if (l.description != null && l.description!.isNotEmpty) ...[
                const SizedBox(height: 16),
                const _SectionTitle('Тайлбар'),
                const SizedBox(height: 6),
                Text(
                  l.description!,
                  style: const TextStyle(color: kMuted, height: 1.5),
                ),
              ],
              if (l.amenities.isNotEmpty) ...[
                const SizedBox(height: 16),
                const _SectionTitle('Тохижилт'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final a in l.amenities)
                      Chip(
                        avatar: const Icon(
                          Icons.check,
                          size: 16,
                          color: Colors.green,
                        ),
                        label: Text(a, style: const TextStyle(fontSize: 13)),
                        backgroundColor: Colors.white,
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 16),
              _AgentCard(agent: l.agent),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ],
    );
  }
}

/// Зургийн галерей — PageView + цэгэн заагч. Хоосон бол placeholder.
class _Gallery extends StatefulWidget {
  final List<String> urls;

  const _Gallery({required this.urls});

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.urls.isEmpty) {
      return Container(
        height: 260,
        color: kLine,
        child: const Center(
          child: Icon(Icons.photo_outlined, size: 48, color: kMuted),
        ),
      );
    }
    return SizedBox(
      height: 260,
      child: Stack(
        children: [
          PageView.builder(
            itemCount: widget.urls.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (_, i) => CachedNetworkImage(
              imageUrl: thumbUrl(widget.urls[i], width: 1200),
              // Decode bound — transform fallback үед ч 1200px-ээс ихийг
              // санах ойд decode хийхгүй (§2.1).
              memCacheWidth: 1200,
              maxWidthDiskCache: 1200,
              fit: BoxFit.cover,
              placeholder: (_, _) => Container(color: kLine),
              errorWidget: (_, _, _) => Container(
                color: kLine,
                child: const Icon(Icons.broken_image_outlined, color: kMuted),
              ),
            ),
          ),
          if (widget.urls.length > 1)
            Positioned(
              bottom: 10,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < widget.urls.length; i++)
                    Container(
                      width: i == _page ? 18 : 7,
                      height: 7,
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      decoration: BoxDecoration(
                        color: i == _page ? Colors.white : Colors.white70,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Badges extends StatelessWidget {
  final ListingDetail listing;

  const _Badges({required this.listing});

  @override
  Widget build(BuildContext context) {
    final l = listing;
    final fresh = l.createdAt != null && isFresh(l.createdAt!);
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        if (l.hot)
          const _Badge(
            text: 'Эрэлттэй',
            icon: Icons.local_fire_department,
            bg: Color(0xFFFFE4E6),
            fg: Color(0xFFBE123C),
          ),
        if (l.verified)
          const _Badge(
            text: 'Баталгаатай',
            icon: Icons.verified_user,
            bg: Color(0xFFD1FAE5),
            fg: Color(0xFF047857),
          ),
        if (l.type != null) _Badge(text: l.type!, bg: kLine, fg: kInk),
        if (fresh)
          const _Badge(
            text: 'Шинэ',
            icon: Icons.auto_awesome,
            bg: Color(0xFFFFEDD5),
            fg: kBrand600,
          ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final IconData? icon;
  final Color bg;
  final Color fg;

  const _Badge({
    required this.text,
    this.icon,
    required this.bg,
    required this.fg,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 3),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class _IconText extends StatelessWidget {
  final IconData icon;
  final String text;

  const _IconText({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: kMuted),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 13, color: kMuted)),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;

  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: kInk,
      ),
    );
  }
}

class _SpecTiles extends StatelessWidget {
  final List<({String label, String value})> tiles;

  const _SpecTiles({required this.tiles});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.9,
      children: [
        for (final t in tiles)
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kLine),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  t.label,
                  style: const TextStyle(fontSize: 12, color: kMuted),
                ),
                const SizedBox(height: 2),
                Text(
                  t.value,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _RentTerms extends StatelessWidget {
  final ListingDetail listing;
  final ({int months, String total, String deposit})? upfront;

  const _RentTerms({required this.listing, required this.upfront});

  @override
  Widget build(BuildContext context) {
    final code = rentTermCode(
      listing.rentAdvanceMonths,
      listing.rentDepositMonths,
    );
    final label = rentTermLabel(
      listing.rentAdvanceMonths,
      listing.rentDepositMonths,
    );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kLine),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Түрээсийн нөхцөл',
                style: TextStyle(fontWeight: FontWeight.w700, color: kInk),
              ),
              if (code != null)
                _Badge(
                  text: code,
                  bg: const Color(0xFFDBEAFE),
                  fg: const Color(0xFF1D4ED8),
                ),
            ],
          ),
          if (label != null) ...[
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 13, color: kMuted)),
          ],
          if (upfront != null) ...[
            const SizedBox(height: 8),
            Text.rich(
              TextSpan(
                style: const TextStyle(fontSize: 13, color: kInk),
                children: [
                  const TextSpan(text: 'Эхэлж төлөх: '),
                  TextSpan(
                    text: '${upfront!.months} сар = ${upfront!.total}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text: ' (${upfront!.deposit} нь буцаагдах барьцаа)',
                    style: const TextStyle(color: kMuted),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AiScoreCard extends StatelessWidget {
  final int score;
  final String? note;

  const _AiScoreCard({required this.score, this.note});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kLine),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.star, color: kBrand600),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AI чанарын оноо: $score/100',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  note ?? 'Зах зээлийн үнэлгээ боловсруулагдсан.',
                  style: const TextStyle(fontSize: 13, color: kMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Агентын карт — agent NULLABLE (§13): null бол «Агент тодорхойгүй».
class _AgentCard extends StatelessWidget {
  final AgentInfo? agent;

  const _AgentCard({required this.agent});

  static Color _hex(String? s, Color fallback) {
    if (s == null) return fallback;
    final h = s.replaceFirst('#', '');
    if (h.length != 6) return fallback;
    final v = int.tryParse(h, radix: 16);
    return v == null ? fallback : Color(0xFF000000 | v);
  }

  @override
  Widget build(BuildContext context) {
    final a = agent;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kLine),
      ),
      child: a == null
          ? const Text(
              'Агент тодорхойгүй.',
              style: TextStyle(fontSize: 13, color: kMuted),
            )
          : Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: _hex(
                    a.office?.color,
                    const Color(0xFFC2410C),
                  ),
                  foregroundImage:
                      (a.avatarUrl != null && a.avatarUrl!.isNotEmpty)
                      ? CachedNetworkImageProvider(
                          thumbUrl(a.avatarUrl!, width: 160),
                          maxWidth: 160,
                        )
                      : null,
                  child: Text(
                    a.avatar ?? 'NA',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              a.displayName ?? '—',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: kInk,
                              ),
                            ),
                          ),
                          if (a.verified) ...[
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.verified_user,
                              size: 15,
                              color: Color(0xFF047857),
                            ),
                          ],
                        ],
                      ),
                      if (a.office?.name != null)
                        Text(
                          a.office!.name!,
                          style: const TextStyle(fontSize: 13, color: kMuted),
                        ),
                      if (a.rating != null)
                        Row(
                          children: [
                            const Icon(
                              Icons.star,
                              size: 14,
                              color: Color(0xFFFBBF24),
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '${a.rating}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: kInk,
                              ),
                            ),
                            Text(
                              ' (${a.reviewsCount ?? 0})',
                              style: const TextStyle(
                                fontSize: 13,
                                color: kMuted,
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

/// Sticky доод мөр: зүрх · байршил · үзэлт товлох · залгах.
class _BottomBar extends ConsumerStatefulWidget {
  final ListingDetail listing;

  const _BottomBar({required this.listing});

  @override
  ConsumerState<_BottomBar> createState() => _BottomBarState();
}

class _BottomBarState extends ConsumerState<_BottomBar> {
  ListingDetail get listing => widget.listing;

  /// Зүрхний хүсэлт явж буй эсэх — давхар дарахаас сэргийлнэ.
  bool _favBusy = false;

  /// Зүрх: нэвтрэлт шаардана → own-row insert/delete → provider invalidate.
  Future<void> _toggleFavorite(BuildContext context, bool isFav) async {
    if (_favBusy) return;
    if (!await ensureLoggedIn(context)) return;
    setState(() => _favBusy = true);
    try {
      await setFavorite(listing.id, !isFav);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(mnErrorMessage(e))));
      }
      return;
    } finally {
      if (mounted) setState(() => _favBusy = false);
    }
    // Зүрхний төлөв (ids) БА «Хадгалсан» табын keep-alive жагсаалтыг хоёуланг
    // нь invalidate хийнэ — эс бөгөөс таб дахин нээхэд хуучин кэш харагдана.
    ref.invalidate(favoriteIdsProvider);
    ref.invalidate(favoriteListingsProvider);
    if (context.mounted && !isFav) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Хадгалагдлаа.')));
    }
  }

  /// Үзэлт товлох: нэвтрэлт шаардана → booking sheet (§6 #3).
  /// Амжилтын snackbar-ыг sheet өөрөө үзүүлдэг («Хүсэлт илгээгдлээ») тул
  /// энд давхардуулж үзүүлэхгүй.
  Future<void> _book(BuildContext context) async {
    if (!await ensureLoggedIn(context)) return;
    if (!context.mounted) return;
    final booked = await showBookingSheet(
      context,
      listingId: listing.id,
      agentId: listing.agentId,
    );
    // Шинэ товлолт «Миний үзэлтүүд»-ийн keep-alive кэшэд шууд орж ирэхийн
    // тулд амжилттай товлолтын дараа жагсаалтыг invalidate хийнэ.
    if (booked) ref.invalidate(myViewingsProvider);
  }

  Future<void> _openMap(BuildContext context) async {
    final p = await fetchListingPoint(listing.id);
    if (!context.mounted) return;
    if (p == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Байршлын мэдээлэл байхгүй')),
      );
      return;
    }
    final geo = Uri.parse('geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}');
    if (await canLaunchUrl(geo)) {
      await launchUrl(geo);
      return;
    }
    // geo: дэмжихгүй (iOS) → Google Maps вэб fallback
    await launchUrl(
      Uri.parse('https://maps.google.com/?q=${p.lat},${p.lng}'),
      mode: LaunchMode.externalApplication,
    );
  }

  Future<void> _call(String phone) async {
    logEvent(kEvCallTap, {'listing_id': listing.id}); // fire-and-forget (§9)
    await launchUrl(Uri(scheme: 'tel', path: phone));
  }

  @override
  Widget build(BuildContext context) {
    final phone = listing.agent?.phone;
    // Нэвтрээгүй/ачаалж буй үед {} — зүрх хоосон харагдана.
    final favIds = ref.watch(favoriteIdsProvider).value ?? const <String>{};
    final isFav = favIds.contains(listing.id);
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: kLine)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(
            children: [
              IconButton(
                tooltip: isFav ? 'Хадгалснаас хасах' : 'Хадгалах',
                onPressed: _favBusy
                    ? null
                    : () => _toggleFavorite(context, isFav),
                icon: Icon(
                  isFav ? Icons.favorite : Icons.favorite_border,
                  color: isFav ? const Color(0xFFE11D48) : kMuted,
                ),
              ),
              IconButton(
                tooltip: 'Байршил',
                onPressed: () => _openMap(context),
                icon: const Icon(Icons.place_outlined, color: kMuted),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _book(context),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Үзэлт товлох'),
                ),
              ),
              if (phone != null && phone.isNotEmpty) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _call(phone),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 44),
                    ),
                    icon: const Icon(Icons.call, size: 18),
                    label: const Text('Залгах'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
