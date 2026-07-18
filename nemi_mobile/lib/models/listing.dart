/// Зарын моделүүд — вебийн CARD_SELECT / LISTING_DETAIL_SELECT-ийн толь.
/// Бүх талбар null-tolerant fromJson (§12 #5: schema идэвхтэй хөгжиж буй).
library;

import 'package:nemi_mobile/models/agent.dart';

/// CARD_SELECT: id, title, price, ai_score, rooms, area, floor, district,
/// photo, hot, verified, deal_type, rent_advance_months, rent_deposit_months,
/// created_at, agent:agents(display_name, avatar, avatar_url, verified, office:offices(color))
class ListingCard {
  final String id;
  final String? title;
  final num? price;
  final int? aiScore;
  final int? rooms;
  final num? area;
  final String? floor;
  final String? district;
  final String? photo;
  final bool hot;
  final bool verified;
  final String? dealType; // 'sale' | 'rent'
  final int? rentAdvanceMonths;
  final int? rentDepositMonths;
  final String? createdAt; // ISO string
  final AgentInfo? agent; // NULLABLE — §13 (v1.2 хэрэглэгчийн зар)

  const ListingCard({
    required this.id,
    this.title,
    this.price,
    this.aiScore,
    this.rooms,
    this.area,
    this.floor,
    this.district,
    this.photo,
    this.hot = false,
    this.verified = false,
    this.dealType,
    this.rentAdvanceMonths,
    this.rentDepositMonths,
    this.createdAt,
    this.agent,
  });

  factory ListingCard.fromJson(Map<String, dynamic> json) => ListingCard(
    id: json['id'] as String? ?? '',
    title: json['title'] as String?,
    price: json['price'] as num?,
    aiScore: (json['ai_score'] as num?)?.toInt(),
    rooms: (json['rooms'] as num?)?.toInt(),
    area: json['area'] as num?,
    floor: json['floor'] as String?,
    district: json['district'] as String?,
    photo: json['photo'] as String?,
    hot: json['hot'] as bool? ?? false,
    verified: json['verified'] as bool? ?? false,
    dealType: json['deal_type'] as String?,
    rentAdvanceMonths: (json['rent_advance_months'] as num?)?.toInt(),
    rentDepositMonths: (json['rent_deposit_months'] as num?)?.toInt(),
    createdAt: json['created_at'] as String?,
    agent: json['agent'] is Map<String, dynamic>
        ? AgentInfo.fromJson(json['agent'] as Map<String, dynamic>)
        : null,
  );
}

class ListingPhoto {
  final String url;
  final int sortOrder;
  final bool isPrimary;

  const ListingPhoto({
    required this.url,
    this.sortOrder = 0,
    this.isPrimary = false,
  });

  factory ListingPhoto.fromJson(Map<String, dynamic> json) => ListingPhoto(
    url: json['url'] as String? ?? '',
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
    isPrimary: json['is_primary'] as bool? ?? false,
  );
}

class AiValuation {
  final int? score;
  final String? note;
  final String? model;
  final String? createdAt;

  const AiValuation({this.score, this.note, this.model, this.createdAt});

  factory AiValuation.fromJson(Map<String, dynamic> json) => AiValuation(
    score: (json['score'] as num?)?.toInt(),
    note: json['note'] as String?,
    model: json['model'] as String?,
    createdAt: json['created_at'] as String?,
  );
}

/// LISTING_DETAIL_SELECT: * + agent(+office) + photos(sort_order) + valuations.
class ListingDetail {
  final String id;
  final String? title;
  final String? district;
  final String? type;
  final int? rooms;
  final num? area;
  final String? floor;
  final num? price;
  final int? year;
  final int? parking;
  final String? status;
  final bool verified;
  final bool hot;
  final bool featured;
  final String? description;
  final List<String> amenities;
  final int? aiScore;
  final String? aiNote;
  final String? photo;
  final String? dealType;
  final int? rentAdvanceMonths;
  final int? rentDepositMonths;
  final String? createdAt;
  final AgentInfo? agent; // NULLABLE
  final List<ListingPhoto> photos; // sort_order-оор эрэмбэлэгдсэн
  final List<AiValuation> valuations;

  const ListingDetail({
    required this.id,
    this.title,
    this.district,
    this.type,
    this.rooms,
    this.area,
    this.floor,
    this.price,
    this.year,
    this.parking,
    this.status,
    this.verified = false,
    this.hot = false,
    this.featured = false,
    this.description,
    this.amenities = const [],
    this.aiScore,
    this.aiNote,
    this.photo,
    this.dealType,
    this.rentAdvanceMonths,
    this.rentDepositMonths,
    this.createdAt,
    this.agent,
    this.photos = const [],
    this.valuations = const [],
  });

  factory ListingDetail.fromJson(Map<String, dynamic> json) {
    final photos =
        (json['photos'] as List?)
            ?.whereType<Map<String, dynamic>>()
            .map(ListingPhoto.fromJson)
            .toList() ??
        <ListingPhoto>[];
    photos.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return ListingDetail(
      id: json['id'] as String? ?? '',
      title: json['title'] as String?,
      district: json['district'] as String?,
      type: json['type'] as String?,
      rooms: (json['rooms'] as num?)?.toInt(),
      area: json['area'] as num?,
      floor: json['floor'] as String?,
      price: json['price'] as num?,
      year: (json['year'] as num?)?.toInt(),
      parking: (json['parking'] as num?)?.toInt(),
      status: json['status'] as String?,
      verified: json['verified'] as bool? ?? false,
      hot: json['hot'] as bool? ?? false,
      featured: json['featured'] as bool? ?? false,
      description: json['description'] as String?,
      amenities:
          (json['amenities'] as List?)?.whereType<String>().toList() ??
          const [],
      aiScore: (json['ai_score'] as num?)?.toInt(),
      aiNote: json['ai_note'] as String?,
      photo: json['photo'] as String?,
      dealType: json['deal_type'] as String?,
      rentAdvanceMonths: (json['rent_advance_months'] as num?)?.toInt(),
      rentDepositMonths: (json['rent_deposit_months'] as num?)?.toInt(),
      createdAt: json['created_at'] as String?,
      agent: json['agent'] is Map<String, dynamic>
          ? AgentInfo.fromJson(json['agent'] as Map<String, dynamic>)
          : null,
      photos: photos,
      valuations:
          (json['valuations'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(AiValuation.fromJson)
              .toList() ??
          const [],
    );
  }
}
