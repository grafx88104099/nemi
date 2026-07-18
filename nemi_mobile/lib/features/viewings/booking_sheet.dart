/// Үзэлт товлох bottom sheet — огноо (өнөөдөр..+30 хоног) + цагийн слот.
/// Амжилттай бол bookViewing → logEvent(kEvViewingBooked) → true буцаана.
library;

import 'package:flutter/material.dart';

import 'package:nemi_mobile/core/analytics.dart';
import 'package:nemi_mobile/core/errors.dart';
import 'package:nemi_mobile/core/theme.dart';
import 'package:nemi_mobile/features/viewings/viewings_queries.dart';

/// Товлох боломжит хоногийн тоо (өнөөдрөөс хойш).
const int kBookingDays = 30;

/// Слотын цагийн хүрээ (09:00 .. 18:00, цаг тутам).
const int kBookingStartHour = 9;
const int kBookingEndHour = 18;

/// Монгол гарагийн товчлол (DateTime.weekday: 1=Даваа .. 7=Ням).
const List<String> kWeekdayShortMn = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

/// Сонгож болох огноонууд: өнөөдөр..+30 хоног (цэвэр функц).
List<DateTime> bookingDates({DateTime? now}) {
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  return [for (var i = 0; i <= kBookingDays; i++) today.add(Duration(days: i))];
}

/// Тухайн өдрийн боломжит цагийн слотууд — зөвхөн ИРЭЭДҮЙН цаг (цэвэр функц).
List<DateTime> bookingTimeSlots(DateTime day, {DateTime? now}) {
  final n = now ?? DateTime.now();
  return [
    for (var h = kBookingStartHour; h <= kBookingEndHour; h++)
      DateTime(day.year, day.month, day.day, h),
  ].where((t) => t.isAfter(n)).toList();
}

/// Үзэлт товлох sheet. Амжилттай товлогдвол true.
/// Дуудагч тал ensureLoggedIn-ээр нэвтрэлтийг урьдчилан баталгаажуулна.
Future<bool> showBookingSheet(
  BuildContext context, {
  required String listingId,
  required String? agentId,
}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _BookingSheet(listingId: listingId, agentId: agentId),
  );
  return ok ?? false;
}

class _BookingSheet extends StatefulWidget {
  final String listingId;
  final String? agentId;

  const _BookingSheet({required this.listingId, required this.agentId});

  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> {
  late final List<DateTime> _dates = bookingDates();
  late DateTime _selectedDate;
  DateTime? _selectedSlot;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // Өнөөдөр боломжит слот үлдээгүй бол (орой) маргаашаас эхэлнэ.
    _selectedDate = bookingTimeSlots(_dates.first).isNotEmpty
        ? _dates.first
        : _dates[1];
  }

  Future<void> _confirm() async {
    final slot = _selectedSlot;
    if (slot == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      await bookViewing(
        listingId: widget.listingId,
        agentId: widget.agentId,
        scheduledAt: slot,
      );
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(mnErrorMessage(e))));
      }
      return;
    }
    logEvent(kEvViewingBooked, {
      'listing_id': widget.listingId,
    }); // fire-and-forget (§9)
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Хүсэлт илгээгдлээ.')));
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final slots = bookingTimeSlots(_selectedDate);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        // Landscape/жижиг өндөрт overflow хийхгүй: 85%-д хязгаарлаж скроллдоно.
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Үзэлт товлох',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Танд тохирох огноо, цагаа сонгоно уу.',
                  style: TextStyle(fontSize: 13, color: kMuted),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Огноо',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 78,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _dates.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, i) {
                      final d = _dates[i];
                      final selected =
                          d.year == _selectedDate.year &&
                          d.month == _selectedDate.month &&
                          d.day == _selectedDate.day;
                      return _DateChip(
                        date: d,
                        selected: selected,
                        onTap: () => setState(() {
                          _selectedDate = d;
                          _selectedSlot = null;
                        }),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Цаг',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: kInk,
                  ),
                ),
                const SizedBox(height: 8),
                if (slots.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'Энэ өдөр боломжит цаг алга. Өөр өдөр сонгоно уу.',
                      style: TextStyle(fontSize: 13, color: kMuted),
                    ),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final t in slots)
                        ChoiceChip(
                          label: Text(
                            '${t.hour.toString().padLeft(2, '0')}:00',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _selectedSlot == t ? Colors.white : kInk,
                            ),
                          ),
                          selected: _selectedSlot == t,
                          selectedColor: kBrand600,
                          showCheckmark: false,
                          onSelected: (_) => setState(() => _selectedSlot = t),
                        ),
                    ],
                  ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _selectedSlot == null || _submitting
                        ? null
                        : _confirm,
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Хүсэлт илгээх'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  final DateTime date;
  final bool selected;
  final VoidCallback onTap;

  const _DateChip({
    required this.date,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 56,
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kBrand600 : Colors.white,
          border: Border.all(color: selected ? kBrand600 : kLine),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              kWeekdayShortMn[date.weekday - 1],
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : kMuted,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${date.day}',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: selected ? Colors.white : kInk,
              ),
            ),
            Text(
              '${date.month}-р сар',
              style: TextStyle(
                fontSize: 9,
                color: selected ? Colors.white : kMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
