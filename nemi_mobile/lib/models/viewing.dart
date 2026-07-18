/// viewings модель — getMyViewings порт.
/// Embedded `listing` НЬ NULLABLE: зар идэвхгүй болоход RLS join null буцаадаг (§6).
library;

import 'package:nemi_mobile/models/agent.dart';

/// Үзэлтийн жагсаалтад join-оор ирдэг зарын хураангуй.
class ViewingListing {
  final String? id;
  final String? title;
  final String? district;
  final String? photo;
  final num? price;

  const ViewingListing({
    this.id,
    this.title,
    this.district,
    this.photo,
    this.price,
  });

  factory ViewingListing.fromJson(Map<String, dynamic> json) => ViewingListing(
    id: json['id'] as String?,
    title: json['title'] as String?,
    district: json['district'] as String?,
    photo: json['photo'] as String?,
    price: json['price'] as num?,
  );
}

class Viewing {
  final String id;
  final String? listingId;
  final String? agentId;
  final String? buyerId;
  final String? scheduledAt;
  final String? status; // pending | confirmed | done | cancelled
  final String? createdAt;
  final ViewingListing? listing; // NULLABLE — RLS-null (§6)
  final AgentInfo? agent;

  const Viewing({
    required this.id,
    this.listingId,
    this.agentId,
    this.buyerId,
    this.scheduledAt,
    this.status,
    this.createdAt,
    this.listing,
    this.agent,
  });

  factory Viewing.fromJson(Map<String, dynamic> json) => Viewing(
    id: json['id'] as String? ?? '',
    listingId: json['listing_id'] as String?,
    agentId: json['agent_id'] as String?,
    buyerId: json['buyer_id'] as String?,
    scheduledAt: json['scheduled_at'] as String?,
    status: json['status'] as String?,
    createdAt: json['created_at'] as String?,
    listing: json['listing'] is Map<String, dynamic>
        ? ViewingListing.fromJson(json['listing'] as Map<String, dynamic>)
        : null,
    agent: json['agent'] is Map<String, dynamic>
        ? AgentInfo.fromJson(json['agent'] as Map<String, dynamic>)
        : null,
  );
}
