/// Агент + оффисын embed модель (CARD_SELECT / LISTING_DETAIL_SELECT-ийн agent хэсэг).
/// Бүх талбар null-tolerant — schema drift-д унахгүй.
library;

class OfficeInfo {
  final String? name;
  final String? color;

  const OfficeInfo({this.name, this.color});

  factory OfficeInfo.fromJson(Map<String, dynamic> json) => OfficeInfo(
    name: json['name'] as String?,
    color: json['color'] as String?,
  );
}

class AgentInfo {
  final String? id; // CARD_SELECT-д ирдэггүй, DETAIL-д ирнэ
  final String? displayName;
  final String? avatar; // товчлол "AB"
  final String? avatarUrl;
  final bool verified;
  final num? rating;
  final int? reviewsCount;
  final String? phone;
  final OfficeInfo? office; // NULLABLE — office_id null байж болно

  const AgentInfo({
    this.id,
    this.displayName,
    this.avatar,
    this.avatarUrl,
    this.verified = false,
    this.rating,
    this.reviewsCount,
    this.phone,
    this.office,
  });

  factory AgentInfo.fromJson(Map<String, dynamic> json) => AgentInfo(
    id: json['id'] as String?,
    displayName: json['display_name'] as String?,
    avatar: json['avatar'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    verified: json['verified'] as bool? ?? false,
    rating: json['rating'] as num?,
    reviewsCount: (json['reviews_count'] as num?)?.toInt(),
    phone: json['phone'] as String?,
    office: json['office'] is Map<String, dynamic>
        ? OfficeInfo.fromJson(json['office'] as Map<String, dynamic>)
        : null,
  );
}
