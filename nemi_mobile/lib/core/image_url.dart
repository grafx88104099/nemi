/// Supabase storage зургийн thumbnail хөрвүүлэгч (§2.1).
/// `/storage/v1/object/public/listings/...` → `/storage/v1/render/image/public/listings/...?width=&quality=`
/// Supabase БИШ URL-ийг өөрчлөлгүй pass-through хийнэ (legacy external зураг).
library;

/// Transform идэвхтэй эсэх (render/image нь Supabase Pro+ л ажилладаг).
/// false үед original URL буцаана — caller `cacheWidth`-ээр decode шахна.
const bool kUseImageTransform = true;

const String _objectPrefix = '/storage/v1/object/public/listings/';
const String _renderPrefix = '/storage/v1/render/image/public/listings/';

String thumbUrl(String url, {int width = 480, int quality = 75}) {
  if (!kUseImageTransform) return url;
  final idx = url.indexOf(_objectPrefix);
  if (idx < 0) return url; // Supabase storage биш — pass-through
  final base = url.substring(0, idx);
  final path = url.substring(idx + _objectPrefix.length);
  return '$base$_renderPrefix$path?width=$width&quality=$quality';
}
