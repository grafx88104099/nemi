/// Үзэлт товлолт — вебийн lib/actions/viewings.ts (bookViewing) +
/// lib/queries-user.ts (getMyViewings)-ийн порт.
///
/// RLS: viewings INSERT check `buyer_id = auth.uid()`, UPDATE own-row.
/// Агент талын SELECT/UPDATE нь `owns_agent(agent_id)` тул `agent_id`-г
/// ЗААВАЛ явуулна (§6 #3) — null бол хүсэлт агентад хэзээ ч үл үзэгдэнэ.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nemi_mobile/core/auth.dart';
import 'package:nemi_mobile/core/supabase.dart';
import 'package:nemi_mobile/models/viewing.dart';

/// Вебийн getMyViewings select-тэй ижил (lib/queries-user.ts).
const String kMyViewingsSelect =
    'id, scheduled_at, status, '
    'listing:listings(id, title, district, photo, price), '
    'agent:agents(display_name, phone)';

/// viewings insert payload — ЦЭВЭР функц (unit тестлэгдэнэ).
/// Вебийн bookViewing insert-тэй талбар бүрээр ижил: listing_id, agent_id,
/// buyer_id, scheduled_at, status:'pending'. `agent_id` түлхүүр ҮРГЭЛЖ явна
/// (веб мөн null байсан ч явуулдаг) — §6 #3.
Map<String, dynamic> buildViewingPayload({
  required String buyerId,
  required String listingId,
  required String? agentId,
  required DateTime scheduledAt,
}) => {
  'listing_id': listingId,
  'agent_id': agentId,
  'buyer_id': buyerId,
  'scheduled_at': scheduledAt.toUtc().toIso8601String(),
  'status': 'pending',
};

/// Үзэлтийн цаг товлох (вебийн bookViewing порт). Нэвтрээгүй бол StateError.
Future<void> bookViewing({
  required String listingId,
  required String? agentId,
  required DateTime scheduledAt,
}) async {
  final userId = supa.auth.currentSession?.user.id;
  if (userId == null) throw StateError('auth');
  await supa
      .from('viewings')
      .insert(
        buildViewingPayload(
          buyerId: userId,
          listingId: listingId,
          agentId: agentId,
          scheduledAt: scheduledAt,
        ),
      );
}

/// Үзэлт цуцлах — own-row UPDATE status='cancelled' (RLS зөвшөөрдөг).
/// `.select('id')`-ээр RETURNING шаардана: RLS дор 0 мөр таарсан update-д
/// PostgREST чимээгүй 200 буцаадаг тул хоосон үр дүнг алдаа гэж үзнэ
/// (жишээ нь үзэлт зэрэг устгагдсан/өөрчлөгдсөн үед худал амжилт үзүүлэхгүй).
Future<void> cancelViewing(String id) async {
  final rows = await supa
      .from('viewings')
      .update({'status': 'cancelled'})
      .eq('id', id)
      .select('id');
  if (rows.isEmpty) throw StateError('viewing-not-updated');
}

/// Цуцлах боломжтой эсэх — pending/confirmed БА ирээдүйн цаг (цэвэр функц).
bool canCancelViewing({
  required String? status,
  required String? scheduledAt,
  DateTime? now,
}) {
  if (status != 'pending' && status != 'confirmed') return false;
  if (scheduledAt == null) return false;
  final t = DateTime.tryParse(scheduledAt);
  if (t == null) return false;
  return t.isAfter(now ?? DateTime.now());
}

/// Миний үзэлтүүд — buyer_id=self, scheduled_at asc (getMyViewings порт).
/// Нэвтрээгүй үед [] (алдаа биш). Login/logout-д автоматаар дахин ачаална.
final myViewingsProvider = FutureProvider<List<Viewing>>((ref) async {
  final userId = ref.watch(sessionProvider)?.user.id;
  if (userId == null) return const <Viewing>[];
  final data = await supa
      .from('viewings')
      .select(kMyViewingsSelect)
      .eq('buyer_id', userId)
      .order('scheduled_at', ascending: true);
  return data.whereType<Map<String, dynamic>>().map(Viewing.fromJson).toList();
});
