import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nemi_mobile/core/analytics.dart';
import 'package:nemi_mobile/core/constants.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/listings/filter_sheet.dart';
import 'package:nemi_mobile/features/listings/listing_filters.dart';
import 'package:nemi_mobile/features/listings/listings_queries.dart';
import 'package:nemi_mobile/models/listing.dart' as models;
import 'package:nemi_mobile/widgets/listing_card_tile.dart';

/// Зарын жагсаалт — infinite scroll (.range, pageSize 12, count exact),
/// pull-to-refresh, эрэмбэ + шүүлтүүр sheet. Вебийн /listings-ийн порт.
class ListingsScreen extends StatefulWidget {
  final ListingFilters? initial;

  const ListingsScreen({super.key, this.initial});

  @override
  State<ListingsScreen> createState() => _ListingsScreenState();
}

class _ListingsScreenState extends State<ListingsScreen> {
  static const _pageSize = 12;

  late ListingFilters _filters = widget.initial ?? const ListingFilters();
  final List<models.ListingCard> _items = [];
  int _total = 0;
  int _page = 1;
  bool _loading = false; // эхний ачаалт / шүүлтүүр солигдоход
  bool _loadingMore = false;
  String? _error;
  int _requestSeq = 0; // хоцорсон хариу шинэ төлвийг дарахаас сэргийлнэ

  final _scroll = ScrollController();
  late final TextEditingController _searchCtl = TextEditingController(
    text: _filters.q ?? '',
  );

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void didUpdateWidget(ListingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Нүүрээс шинэ query param-тай ирэхэд (branch state хадгалагддаг тул).
    final next = widget.initial ?? const ListingFilters();
    final prev = oldWidget.initial ?? const ListingFilters();
    if (!mapEquals(next.toQueryParams(), prev.toQueryParams()) &&
        !mapEquals(next.toQueryParams(), _filters.toQueryParams())) {
      _filters = next;
      _searchCtl.text = _filters.q ?? '';
      _load();
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    _searchCtl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) {
      _loadMore();
    }
  }

  Future<void> _load() async {
    final seq = ++_requestSeq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await fetchListings(_filters, page: 1, pageSize: _pageSize);
      if (!mounted || seq != _requestSeq) return;
      setState(() {
        _items
          ..clear()
          ..addAll(res.items);
        _total = res.count;
        _page = 1;
        _loading = false;
      });
      if (res.count == 0) {
        // §9: 0 үр дүнтэй хайлтын лог — filter JSON-ийг props-д.
        logEvent(
          'search_zero_results',
          Map<String, dynamic>.from(_filters.toQueryParams()),
        );
      }
    } catch (e) {
      if (!mounted || seq != _requestSeq) return;
      setState(() {
        _loading = false;
        _error = 'Ачаалахад алдаа гарлаа';
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _items.length >= _total) return;
    final seq = _requestSeq;
    setState(() => _loadingMore = true);
    try {
      final res = await fetchListings(
        _filters,
        page: _page + 1,
        pageSize: _pageSize,
      );
      if (mounted && seq == _requestSeq) {
        setState(() {
          _items.addAll(res.items);
          _total = res.count;
          _page += 1;
        });
      }
    } catch (_) {
      // Алдааг зөөлөн үл тоомсорлоно — дараагийн scroll дахин оролдоно.
    } finally {
      // finally-д заавал буулгана: refresh/шүүлтүүр (_load) seq-ийг ахиулж
      // энэ хүсэлтийг хүчингүй болгосон ч _loadingMore true гацаж
      // хуудаслалт бүрмөсөн түгжигдэхээс сэргийлнэ.
      if (mounted) {
        setState(() => _loadingMore = false);
      } else {
        _loadingMore = false;
      }
    }
  }

  void _apply(ListingFilters f) {
    if (!mounted) return;
    setState(() => _filters = f);
    _searchCtl.text = f.q ?? '';
    _load();
    // Route URL-ийг локал шүүлтүүртэй sync — эс бөгөөс Нүүрний chip ижил
    // URI руу go хийхэд didUpdateWidget (next == prev) reload хийхгүй,
    // локал өөрчилсөн шүүлтүүр хэвээр үлддэг байсан. URL нь эх сурвалж.
    final params = f.toQueryParams();
    context.go(
      Uri(
        path: '/listings',
        queryParameters: params.isEmpty ? null : params,
      ).toString(),
    );
  }

  String get _title => switch (_filters.deal) {
    'rent' => 'Түрээсийн зар',
    'sale' => 'Худалдах зар',
    _ => 'Зарын жагсаалт',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _title,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.swap_vert),
            tooltip: 'Эрэмбэлэх',
            initialValue: _filters.sort ?? 'new',
            onSelected: (v) => _apply(_filters.copyWith(sort: v)),
            itemBuilder: (_) => [
              for (final e in kSortOptions.entries)
                PopupMenuItem(value: e.key, child: Text(e.value)),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Шүүлтүүр',
            onPressed: () async {
              final res = await showFilterSheet(context, _filters);
              if (res != null) _apply(res);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _searchCtl,
              textInputAction: TextInputAction.search,
              onSubmitted: (v) => _apply(_filters.copyWith(q: v.trim())),
              decoration: InputDecoration(
                hintText: 'Хайх...',
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: kLine),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: kLine),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _loading ? ' ' : '$_total зар олдлоо',
                style: const TextStyle(fontSize: 13, color: kMuted),
              ),
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading && _items.isEmpty) return const _SkeletonList();
    if (_error != null && _items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off, size: 40, color: kMuted),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: kMuted)),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Дахин оролдох')),
          ],
        ),
      );
    }
    if (_items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, size: 40, color: kMuted),
            const SizedBox(height: 12),
            const Text(
              'Илэрц олдсонгүй',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: kInk,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Шүүлтүүрээ өөрчилж үзнэ үү',
              style: TextStyle(fontSize: 13, color: kMuted),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => _apply(const ListingFilters()),
              child: const Text('Шүүлтүүр цэвэрлэх'),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: _items.length + (_items.length < _total ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          if (i >= _items.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
              ),
            );
          }
          final l = _items[i];
          return ListingCardTile(
            listing: l,
            onTap: () => context.pushNamed(
              'listing-detail',
              pathParameters: {'id': l.id},
            ),
          );
        },
      ),
    );
  }
}

/// Skeleton loader — ачаалж буй үеийн саарал карт placeholder.
class _SkeletonList extends StatelessWidget {
  const _SkeletonList();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 3,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => const SkeletonCard(),
    );
  }
}

/// Нэг skeleton карт (Нүүрийн rail-д мөн ашиглана).
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key});

  @override
  Widget build(BuildContext context) {
    const shimmer = Color(0xFFE9EEF3);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: kLine),
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AspectRatio(
            aspectRatio: 4 / 3,
            child: ColoredBox(color: shimmer),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 120, height: 16, color: shimmer),
                const SizedBox(height: 8),
                Container(width: 200, height: 12, color: shimmer),
                const SizedBox(height: 8),
                Container(width: 160, height: 12, color: shimmer),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
