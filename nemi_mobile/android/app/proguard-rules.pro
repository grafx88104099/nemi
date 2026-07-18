# Nemi — R8/ProGuard дүрмүүд (release, isMinifyEnabled=true)
#
# Flutter engine-ийн өөрийн keep дүрмүүд Flutter Gradle plugin-аас автоматаар
# орж ирдэг тул энд давтахгүй. Supabase (supabase_flutter/gotrue) нь цэвэр Dart
# тул R8-д огт өртөхгүй — Kotlin/Java талын keep дүрэм шаардлагагүй.
# kotlinx.serialization энэ төсөлд ашиглагдаагүй (Kotlin тал зөвхөн MainActivity)
# тул түүний keep дүрэм мөн хэрэггүй.

# Play Core (deferred components) — аппд ашигладаггүй ч Flutter engine-ийн
# PlayStore split hooks нь эдгээр классыг нэрээр нь дурддаг тул R8
# "missing class" warning-ийг алдаа болгохгүйн тулд dontwarn хийнэ.
-dontwarn com.google.android.play.core.**
