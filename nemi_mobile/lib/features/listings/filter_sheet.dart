import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nemi_mobile/core/constants.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/listings/listing_filters.dart';

/// Шүүлтүүрийн bottom sheet — вебийн /listings filter bar-тай ЯГ ижил талбарууд:
/// q, deal, district (7), type, rooms (gte), minPrice/maxPrice, posted.
/// Backend дэмждэггүй шүүлтүүр НЭМЭХГҮЙ (§6 #2). sort нь дэлгэцийн сонгогчид.
Future<ListingFilters?> showFilterSheet(
  BuildContext context,
  ListingFilters current,
) {
  return showModalBottomSheet<ListingFilters>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _FilterSheet(current: current),
  );
}

class _FilterSheet extends StatefulWidget {
  final ListingFilters current;

  const _FilterSheet({required this.current});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late final TextEditingController _qCtl;
  late final TextEditingController _minCtl;
  late final TextEditingController _maxCtl;
  String? _deal;
  String? _district;
  String? _type;
  int? _roomsMin;
  int? _posted;

  @override
  void initState() {
    super.initState();
    final f = widget.current;
    _qCtl = TextEditingController(text: f.q ?? '');
    _minCtl = TextEditingController(text: f.minPrice?.toString() ?? '');
    _maxCtl = TextEditingController(text: f.maxPrice?.toString() ?? '');
    _deal = f.deal;
    _district = f.district;
    _type = f.type;
    _roomsMin = f.roomsMin;
    _posted = f.posted;
  }

  @override
  void dispose() {
    _qCtl.dispose();
    _minCtl.dispose();
    _maxCtl.dispose();
    super.dispose();
  }

  ListingFilters _build() => ListingFilters(
    q: _qCtl.text.trim().isEmpty ? null : _qCtl.text.trim(),
    deal: _deal,
    district: _district,
    type: _type,
    roomsMin: _roomsMin,
    minPrice: num.tryParse(_minCtl.text.replaceAll(',', '')),
    maxPrice: num.tryParse(_maxCtl.text.replaceAll(',', '')),
    posted: _posted,
    sort: widget.current.sort, // эрэмбийг хадгална
  );

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 8, 0),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Шүүлтүүр',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: kInk,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Хаах',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: _qCtl,
                        textInputAction: TextInputAction.search,
                        decoration: const InputDecoration(
                          hintText: 'Хайх...',
                          prefixIcon: Icon(Icons.search),
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      _label('Гүйлгээний төрөл'),
                      _chips<String?>(
                        options: [null, ...kDealTypes],
                        selected: _deal,
                        labelOf: (v) => v == null ? 'Бүгд' : kDealTypeLabel[v]!,
                        onSelect: (v) => setState(() => _deal = v),
                      ),
                      _label('Дүүрэг'),
                      _chips<String?>(
                        options: [null, ...kDistricts],
                        selected: _district,
                        labelOf: (v) => v ?? 'Бүх дүүрэг',
                        onSelect: (v) => setState(() => _district = v),
                      ),
                      _label('Үл хөдлөхийн төрөл'),
                      _chips<String?>(
                        options: [null, ...kPropertyTypes],
                        selected: _type,
                        labelOf: (v) => v ?? 'Бүх төрөл',
                        onSelect: (v) => setState(() => _type = v),
                      ),
                      _label('Өрөө'),
                      _chips<int?>(
                        options: const [null, 1, 2, 3, 4, 5],
                        selected: _roomsMin,
                        labelOf: (v) => v == null ? 'Бүгд' : '$v+ өрөө',
                        onSelect: (v) => setState(() => _roomsMin = v),
                      ),
                      _label('Үнэ (₮)'),
                      Row(
                        children: [
                          Expanded(child: _priceField(_minCtl, 'Үнэ доод')),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8),
                            child: Text('—', style: TextStyle(color: kMuted)),
                          ),
                          Expanded(child: _priceField(_maxCtl, 'Үнэ дээд')),
                        ],
                      ),
                      _label('Нийтэлсэн хугацаа'),
                      _chips<int?>(
                        options: [null, ...kPostedOptions.keys],
                        selected: _posted,
                        labelOf: (v) =>
                            v == null ? 'Бүх хугацаа' : kPostedOptions[v]!,
                        onSelect: (v) => setState(() => _posted = v),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Row(
                  children: [
                    OutlinedButton(
                      onPressed: () => Navigator.of(
                        context,
                      ).pop(ListingFilters(sort: widget.current.sort)),
                      child: const Text('Цэвэрлэх'),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: () => Navigator.of(context).pop(_build()),
                        child: const Text('Шүүх'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 8),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: kInk,
      ),
    ),
  );

  Widget _chips<T>({
    required List<T> options,
    required T selected,
    required String Function(T) labelOf,
    required void Function(T) onSelect,
  }) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ChoiceChip(
            label: Text(labelOf(o)),
            selected: o == selected,
            onSelected: (_) => onSelect(o),
            selectedColor: kBrand.withValues(alpha: 0.15),
            labelStyle: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: o == selected ? kBrand600 : kInk,
            ),
            showCheckmark: false,
          ),
      ],
    );
  }

  Widget _priceField(TextEditingController ctl, String hint) => TextField(
    controller: ctl,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
    decoration: InputDecoration(
      hintText: hint,
      border: const OutlineInputBorder(),
      isDense: true,
    ),
  );
}
