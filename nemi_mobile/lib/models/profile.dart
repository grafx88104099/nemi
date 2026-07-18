/// profiles хүснэгтийн модель (өөрийн мөр — RLS id = auth.uid()).
library;

class Profile {
  final String id;
  final String? fullName;
  final String? avatarUrl;
  final String? phone;
  final String? email;
  final String? role; // 'buyer' default
  final String? createdAt;

  const Profile({
    required this.id,
    this.fullName,
    this.avatarUrl,
    this.phone,
    this.email,
    this.role,
    this.createdAt,
  });

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
    id: json['id'] as String? ?? '',
    fullName: json['full_name'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    phone: json['phone'] as String?,
    email: json['email'] as String?,
    role: json['role'] as String?,
    createdAt: json['created_at'] as String?,
  );
}
